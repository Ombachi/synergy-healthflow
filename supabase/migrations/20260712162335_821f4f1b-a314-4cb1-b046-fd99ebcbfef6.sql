
-- =====================================================================
-- Encounter columns on clinical tables
-- =====================================================================
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'lab_orders','lab_results','lab_samples','imaging_orders','prescriptions',
    'medication_orders','procedure_orders','nutrition_plans','allied_health_notes',
    'visit_diagnoses','vitals'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS encounter_id uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS encounter_type text', t);
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      t, t || '_encounter_type_chk'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (encounter_type IS NULL OR encounter_type IN (''visit'',''admission''))',
      t, t || '_encounter_type_chk'
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(encounter_id)',
      'idx_' || t || '_encounter', t
    );
  END LOOP;
END $$;

-- =====================================================================
-- Backfill from existing visit_id / admission_id columns where present
-- =====================================================================
DO $$
DECLARE
  t text;
  has_visit boolean;
  has_admission boolean;
  tables text[] := ARRAY[
    'lab_orders','imaging_orders','prescriptions','medication_orders',
    'procedure_orders','nutrition_plans','allied_health_notes',
    'visit_diagnoses','vitals'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='visit_id') INTO has_visit;
    SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='admission_id') INTO has_admission;
    IF has_admission THEN
      EXECUTE format('UPDATE public.%I SET encounter_id = admission_id, encounter_type = ''admission'' WHERE encounter_id IS NULL AND admission_id IS NOT NULL', t);
    END IF;
    IF has_visit THEN
      EXECUTE format('UPDATE public.%I SET encounter_id = visit_id, encounter_type = ''visit'' WHERE encounter_id IS NULL AND visit_id IS NOT NULL', t);
    END IF;
  END LOOP;
END $$;

-- Backfill lab_samples / lab_results from their parent lab_order
UPDATE public.lab_results r
   SET encounter_id = o.encounter_id, encounter_type = o.encounter_type
  FROM public.lab_orders o
 WHERE r.order_id = o.id AND r.encounter_id IS NULL AND o.encounter_id IS NOT NULL;

UPDATE public.lab_samples s
   SET encounter_id = o.encounter_id, encounter_type = o.encounter_type
  FROM public.lab_orders o
 WHERE s.order_id = o.id AND s.encounter_id IS NULL AND o.encounter_id IS NOT NULL;

-- =====================================================================
-- Trigger: derive encounter columns from visit_id / admission_id on insert
-- =====================================================================
CREATE OR REPLACE FUNCTION public.set_encounter_from_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  has_admission boolean;
  has_visit boolean;
  v_admission uuid;
  v_visit uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=TG_TABLE_SCHEMA AND table_name=TG_TABLE_NAME AND column_name='admission_id') INTO has_admission;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=TG_TABLE_SCHEMA AND table_name=TG_TABLE_NAME AND column_name='visit_id') INTO has_visit;

  IF has_admission THEN
    EXECUTE format('SELECT ($1).%I', 'admission_id') USING NEW INTO v_admission;
  END IF;
  IF has_visit THEN
    EXECUTE format('SELECT ($1).%I', 'visit_id') USING NEW INTO v_visit;
  END IF;

  IF NEW.encounter_id IS NULL THEN
    IF v_admission IS NOT NULL THEN
      NEW.encounter_id := v_admission;
      NEW.encounter_type := 'admission';
    ELSIF v_visit IS NOT NULL THEN
      NEW.encounter_id := v_visit;
      NEW.encounter_type := 'visit';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'lab_orders','imaging_orders','prescriptions','medication_orders',
    'procedure_orders','nutrition_plans','allied_health_notes',
    'visit_diagnoses','vitals'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_encounter ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_set_encounter BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_encounter_from_source()',
      t, t
    );
  END LOOP;
END $$;

-- Trigger: copy encounter from parent lab_order onto lab_results / lab_samples
CREATE OR REPLACE FUNCTION public.copy_encounter_from_lab_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.encounter_id IS NULL AND NEW.order_id IS NOT NULL THEN
    SELECT encounter_id, encounter_type
      INTO NEW.encounter_id, NEW.encounter_type
      FROM public.lab_orders WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_lab_results_copy_encounter ON public.lab_results;
CREATE TRIGGER trg_lab_results_copy_encounter
  BEFORE INSERT ON public.lab_results
  FOR EACH ROW EXECUTE FUNCTION public.copy_encounter_from_lab_order();

DROP TRIGGER IF EXISTS trg_lab_samples_copy_encounter ON public.lab_samples;
CREATE TRIGGER trg_lab_samples_copy_encounter
  BEFORE INSERT ON public.lab_samples
  FOR EACH ROW EXECUTE FUNCTION public.copy_encounter_from_lab_order();

-- =====================================================================
-- clinical_tasks — canonical task board per encounter
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.clinical_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid,
  encounter_type text CHECK (encounter_type IN ('visit','admission')),
  patient_id uuid,
  kind text NOT NULL,                    -- lab | imaging | prescription | procedure | nursing | discharge | ...
  title text NOT NULL,
  description text,
  source_table text,
  source_id uuid,
  assigned_role app_role,
  assigned_to uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','done','cancelled')),
  priority int NOT NULL DEFAULT 3,
  due_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinical_tasks TO authenticated;
GRANT ALL ON public.clinical_tasks TO service_role;

ALTER TABLE public.clinical_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinical tasks: assignee/creator/admin can view"
ON public.clinical_tasks FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR (assigned_role IS NOT NULL AND public.has_role(auth.uid(), assigned_role))
);

CREATE POLICY "Clinical tasks: staff insert"
ON public.clinical_tasks FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Clinical tasks: assignee/creator/admin update"
ON public.clinical_tasks FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR assigned_to = auth.uid()
  OR created_by = auth.uid()
  OR (assigned_role IS NOT NULL AND public.has_role(auth.uid(), assigned_role))
)
WITH CHECK (true);

CREATE POLICY "Clinical tasks: admin delete"
ON public.clinical_tasks FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_clinical_tasks_encounter ON public.clinical_tasks(encounter_id);
CREATE INDEX IF NOT EXISTS idx_clinical_tasks_status ON public.clinical_tasks(status);
CREATE INDEX IF NOT EXISTS idx_clinical_tasks_patient ON public.clinical_tasks(patient_id);

DROP TRIGGER IF EXISTS trg_clinical_tasks_updated ON public.clinical_tasks;
CREATE TRIGGER trg_clinical_tasks_updated
  BEFORE UPDATE ON public.clinical_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- Auto-create tasks when clinicians place orders
-- =====================================================================
CREATE OR REPLACE FUNCTION public.tg_task_from_lab_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.clinical_tasks (encounter_id, encounter_type, patient_id, kind, title,
    source_table, source_id, assigned_role, priority, created_by)
  VALUES (NEW.encounter_id, NEW.encounter_type, NEW.patient_id, 'lab', 'Lab order: collect & result',
    'lab_orders', NEW.id, 'lab_tech'::app_role,
    CASE WHEN NEW.priority = 'stat' THEN 1 WHEN NEW.priority = 'urgent' THEN 2 ELSE 3 END,
    NEW.ordered_by);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_lab_orders_task ON public.lab_orders;
CREATE TRIGGER trg_lab_orders_task AFTER INSERT ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_task_from_lab_order();

CREATE OR REPLACE FUNCTION public.tg_task_from_imaging_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO public.clinical_tasks (encounter_id, encounter_type, patient_id, kind, title,
    source_table, source_id, assigned_role, priority, created_by)
  VALUES (NEW.encounter_id, NEW.encounter_type, NEW.patient_id, 'imaging',
    'Imaging: ' || COALESCE(NEW.modality,'study'),
    'imaging_orders', NEW.id, 'radiologist'::app_role,
    CASE WHEN NEW.priority = 'stat' THEN 1 WHEN NEW.priority = 'urgent' THEN 2 ELSE 3 END,
    NEW.ordered_by);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_imaging_orders_task ON public.imaging_orders;
CREATE TRIGGER trg_imaging_orders_task AFTER INSERT ON public.imaging_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_task_from_imaging_order();

CREATE OR REPLACE FUNCTION public.tg_task_from_prescription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_patient uuid;
BEGIN
  SELECT patient_id INTO v_patient FROM public.visits WHERE id = NEW.visit_id;
  INSERT INTO public.clinical_tasks (encounter_id, encounter_type, patient_id, kind, title,
    source_table, source_id, assigned_role, priority, created_by)
  VALUES (NEW.encounter_id, NEW.encounter_type, v_patient, 'prescription',
    'Dispense: ' || NEW.medication,
    'prescriptions', NEW.id, 'pharmacist'::app_role, 3, NEW.created_by);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_prescriptions_task ON public.prescriptions;
CREATE TRIGGER trg_prescriptions_task AFTER INSERT ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_task_from_prescription();

CREATE OR REPLACE FUNCTION public.tg_task_from_procedure_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_patient uuid;
BEGIN
  SELECT patient_id INTO v_patient FROM public.visits WHERE id = NEW.visit_id;
  INSERT INTO public.clinical_tasks (encounter_id, encounter_type, patient_id, kind, title,
    source_table, source_id, assigned_role, priority, created_by)
  VALUES (NEW.encounter_id, NEW.encounter_type, v_patient, 'procedure',
    'Procedure: ' || NEW.procedure_name,
    'procedure_orders', NEW.id, 'nurse'::app_role, 3, NEW.ordered_by);
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_procedure_orders_task ON public.procedure_orders;
CREATE TRIGGER trg_procedure_orders_task AFTER INSERT ON public.procedure_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_task_from_procedure_order();

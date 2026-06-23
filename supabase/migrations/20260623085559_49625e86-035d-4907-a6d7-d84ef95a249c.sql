
-- 1) Visits: payment + location captured at reception
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_location text;

-- 2) Lab result templates (admin-managed)
CREATE TABLE IF NOT EXISTS public.lab_result_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.lab_tests_catalog(id) ON DELETE CASCADE,
  parameter_name text NOT NULL,
  units text,
  reference_range text,
  reference_low numeric,
  reference_high numeric,
  critical_low numeric,
  critical_high numeric,
  input_type text NOT NULL DEFAULT 'numeric', -- numeric | text | select
  select_options text, -- comma separated
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_result_templates_test_idx ON public.lab_result_templates(test_id, display_order);

GRANT SELECT ON public.lab_result_templates TO authenticated;
GRANT ALL ON public.lab_result_templates TO service_role;
ALTER TABLE public.lab_result_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY lrt_read ON public.lab_result_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY lrt_admin_write ON public.lab_result_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER lrt_touch BEFORE UPDATE ON public.lab_result_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Lab result values (one row per parameter of an order)
CREATE TABLE IF NOT EXISTS public.lab_result_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.lab_result_templates(id) ON DELETE SET NULL,
  parameter_name text NOT NULL,
  value_text text,
  value_numeric numeric,
  units text,
  reference_range text,
  abnormal_flag text,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_result_values_order_idx ON public.lab_result_values(order_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_result_values TO authenticated;
GRANT ALL ON public.lab_result_values TO service_role;
ALTER TABLE public.lab_result_values ENABLE ROW LEVEL SECURITY;

-- Lab tech / admin / doctor write & read; patient can read own
CREATE POLICY lrv_read ON public.lab_result_values FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'lab_tech')
  OR public.has_role(auth.uid(),'doctor')
  OR public.has_role(auth.uid(),'nurse')
  OR EXISTS (
    SELECT 1 FROM public.lab_orders lo
    JOIN public.patients p ON p.id = lo.patient_id
    WHERE lo.id = lab_result_values.order_id AND p.user_id = auth.uid()
  )
);
CREATE POLICY lrv_write ON public.lab_result_values FOR ALL TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'lab_tech')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'lab_tech')
);

-- Auto flag values against template ranges
CREATE OR REPLACE FUNCTION public.auto_flag_lab_value()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t RECORD; v numeric;
BEGIN
  IF NEW.template_id IS NULL THEN RETURN NEW; END IF;
  SELECT reference_low, reference_high, critical_low, critical_high, units, reference_range
    INTO t FROM public.lab_result_templates WHERE id = NEW.template_id;
  NEW.units := COALESCE(NEW.units, t.units);
  NEW.reference_range := COALESCE(NEW.reference_range, t.reference_range);
  v := NEW.value_numeric;
  IF v IS NULL AND NEW.value_text IS NOT NULL THEN
    BEGIN v := NULLIF(regexp_replace(NEW.value_text,'[^0-9.\-]','','g'),'')::numeric; EXCEPTION WHEN others THEN v := NULL; END;
    NEW.value_numeric := v;
  END IF;
  IF v IS NOT NULL THEN
    IF t.critical_low  IS NOT NULL AND v < t.critical_low  THEN NEW.abnormal_flag := 'critical low';
    ELSIF t.critical_high IS NOT NULL AND v > t.critical_high THEN NEW.abnormal_flag := 'critical high';
    ELSIF t.reference_low IS NOT NULL AND v < t.reference_low THEN NEW.abnormal_flag := 'low';
    ELSIF t.reference_high IS NOT NULL AND v > t.reference_high THEN NEW.abnormal_flag := 'high';
    ELSIF t.reference_low IS NOT NULL OR t.reference_high IS NOT NULL THEN NEW.abnormal_flag := 'normal';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lrv_autoflag ON public.lab_result_values;
CREATE TRIGGER lrv_autoflag BEFORE INSERT OR UPDATE ON public.lab_result_values
  FOR EACH ROW EXECUTE FUNCTION public.auto_flag_lab_value();

-- 4) Sick-off notes
CREATE TABLE IF NOT EXISTS public.sick_off_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  diagnosis text,
  recommendation text,
  days int NOT NULL DEFAULT 1,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sick_off_patient_idx ON public.sick_off_notes(patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sick_off_notes TO authenticated;
GRANT ALL ON public.sick_off_notes TO service_role;
ALTER TABLE public.sick_off_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY sick_read ON public.sick_off_notes FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR public.has_role(auth.uid(),'doctor')
  OR public.has_role(auth.uid(),'nurse')
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = sick_off_notes.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY sick_write ON public.sick_off_notes FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
);
CREATE POLICY sick_update ON public.sick_off_notes FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
);

-- 5) Auto-bill consultation when a visit is opened
CREATE OR REPLACE FUNCTION public.bill_consultation_on_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_price int;
BEGIN
  v_price := COALESCE(NULLIF(public.catalog_price('consultation'),0), 3000);
  PERFORM public.add_invoice_line(NEW.id,'consultation','visits',NEW.id,'Consultation fee',1,v_price);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS visits_bill_consultation ON public.visits;
CREATE TRIGGER visits_bill_consultation AFTER INSERT ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.bill_consultation_on_visit();

-- 6) Seed drug catalog into inventory_items (idempotent by name)
INSERT INTO public.inventory_items (name, category, quantity, reorder_threshold)
SELECT dc.drug_name,
       COALESCE(dc.medication_class,'pharmacy'),
       0,
       20
FROM public.drug_catalog dc
WHERE dc.active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.inventory_items ii
    WHERE lower(ii.name) = lower(dc.drug_name)
  );

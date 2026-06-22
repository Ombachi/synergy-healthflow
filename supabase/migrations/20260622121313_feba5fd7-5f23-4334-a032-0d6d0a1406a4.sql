-- Receptionists must be able to create walk-in and booked visits.
DROP POLICY IF EXISTS visits_insert ON public.visits;
CREATE POLICY visits_insert ON public.visits
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'admin')
);

-- Doctors can update consultation notes/reports after completion, but do not create visits.
DROP POLICY IF EXISTS visits_update ON public.visits;
CREATE POLICY visits_update ON public.visits
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'receptionist')
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'receptionist')
  OR public.has_role(auth.uid(), 'admin')
);

-- Pharmacy needs to see prescriptions for fulfillment.
DROP POLICY IF EXISTS rx_select ON public.prescriptions;
CREATE POLICY rx_select ON public.prescriptions
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'pharmacist')
  OR EXISTS (
    SELECT 1 FROM public.visits v
    JOIN public.patients p ON p.id = v.patient_id
    WHERE v.id = prescriptions.visit_id AND p.user_id = auth.uid()
  )
);

-- Structured drug database for prescribing.
CREATE TABLE IF NOT EXISTS public.drug_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_name TEXT NOT NULL UNIQUE,
  default_dose TEXT,
  default_frequency TEXT,
  default_duration TEXT,
  medication_class TEXT,
  contraindications TEXT,
  instructions TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.drug_catalog TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.drug_catalog TO authenticated;
GRANT ALL ON public.drug_catalog TO service_role;
ALTER TABLE public.drug_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS drug_catalog_read ON public.drug_catalog;
CREATE POLICY drug_catalog_read ON public.drug_catalog
FOR SELECT TO authenticated
USING (active OR public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS drug_catalog_manage ON public.drug_catalog;
CREATE POLICY drug_catalog_manage ON public.drug_catalog
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pharmacist'));
DROP TRIGGER IF EXISTS trg_drug_catalog_upd ON public.drug_catalog;
CREATE TRIGGER trg_drug_catalog_upd BEFORE UPDATE ON public.drug_catalog
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Structured reference ranges for automatic lab flags.
ALTER TABLE public.lab_tests_catalog
  ADD COLUMN IF NOT EXISTS reference_low NUMERIC,
  ADD COLUMN IF NOT EXISTS reference_high NUMERIC,
  ADD COLUMN IF NOT EXISTS critical_low NUMERIC,
  ADD COLUMN IF NOT EXISTS critical_high NUMERIC;

ALTER TABLE public.lab_results
  ADD COLUMN IF NOT EXISTS numeric_value NUMERIC;

CREATE OR REPLACE FUNCTION public.auto_flag_lab_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_test RECORD;
  v_num NUMERIC;
BEGIN
  SELECT c.reference_low, c.reference_high, c.critical_low, c.critical_high, c.reference_range, c.units
    INTO v_test
  FROM public.lab_orders lo
  JOIN public.lab_tests_catalog c ON c.id = lo.test_id
  WHERE lo.id = NEW.order_id;

  IF NEW.numeric_value IS NULL AND NEW.result_value IS NOT NULL THEN
    BEGIN
      v_num := NULLIF(regexp_replace(NEW.result_value, '[^0-9.\-]', '', 'g'), '')::numeric;
    EXCEPTION WHEN others THEN
      v_num := NULL;
    END;
    NEW.numeric_value := v_num;
  ELSE
    v_num := NEW.numeric_value;
  END IF;

  NEW.units := COALESCE(NEW.units, v_test.units);
  NEW.reference_range := COALESCE(NEW.reference_range, v_test.reference_range);

  IF v_num IS NOT NULL THEN
    IF v_test.critical_low IS NOT NULL AND v_num < v_test.critical_low THEN
      NEW.abnormal_flag := 'critical low';
    ELSIF v_test.critical_high IS NOT NULL AND v_num > v_test.critical_high THEN
      NEW.abnormal_flag := 'critical high';
    ELSIF v_test.reference_low IS NOT NULL AND v_num < v_test.reference_low THEN
      NEW.abnormal_flag := 'low';
    ELSIF v_test.reference_high IS NOT NULL AND v_num > v_test.reference_high THEN
      NEW.abnormal_flag := 'high';
    ELSIF v_test.reference_low IS NOT NULL OR v_test.reference_high IS NOT NULL THEN
      NEW.abnormal_flag := 'normal';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_flag_lab_result ON public.lab_results;
CREATE TRIGGER trg_auto_flag_lab_result
BEFORE INSERT OR UPDATE OF result_value, numeric_value, units, reference_range ON public.lab_results
FOR EACH ROW EXECUTE FUNCTION public.auto_flag_lab_result();

CREATE OR REPLACE FUNCTION public.route_lab_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.visit_id IS NOT NULL THEN
    INSERT INTO public.visit_queue (visit_id, queue_type, priority, entered_at, notes)
    VALUES (NEW.visit_id, 'lab', CASE WHEN NEW.priority = 'stat' THEN 1 WHEN NEW.priority = 'urgent' THEN 2 ELSE 3 END, now(), NEW.clinical_notes)
    ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.notify_role('lab_tech','lab_order','New lab order','A new lab investigation has been ordered.','/lab','lab_order', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_route_lab_order ON public.lab_orders;
DROP TRIGGER IF EXISTS trg_notify_lab_order ON public.lab_orders;
CREATE TRIGGER trg_route_lab_order AFTER INSERT ON public.lab_orders
FOR EACH ROW EXECUTE FUNCTION public.route_lab_order();

CREATE OR REPLACE FUNCTION public.route_imaging_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.visit_id IS NOT NULL THEN
    INSERT INTO public.visit_queue (visit_id, queue_type, priority, entered_at, notes)
    VALUES (NEW.visit_id, 'radiology', CASE WHEN NEW.priority = 'stat' THEN 1 WHEN NEW.priority = 'urgent' THEN 2 ELSE 3 END, now(), NEW.clinical_question)
    ON CONFLICT DO NOTHING;
  END IF;
  PERFORM public.notify_role('radiologist','imaging_order','New imaging order','A new imaging study has been ordered.','/radiology','imaging_order', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_route_imaging_order ON public.imaging_orders;
DROP TRIGGER IF EXISTS trg_notify_imaging_order ON public.imaging_orders;
CREATE TRIGGER trg_route_imaging_order AFTER INSERT ON public.imaging_orders
FOR EACH ROW EXECUTE FUNCTION public.route_imaging_order();

CREATE OR REPLACE FUNCTION public.route_prescription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.visit_queue (visit_id, queue_type, priority, entered_at, notes)
  VALUES (NEW.visit_id, 'pharmacy', 3, now(), NEW.medication)
  ON CONFLICT DO NOTHING;
  PERFORM public.notify_role('pharmacist','prescription','New prescription','A new prescription is ready for dispensing.','/pharmacy','prescription', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_route_prescription ON public.prescriptions;
DROP TRIGGER IF EXISTS trg_notify_prescription ON public.prescriptions;
CREATE TRIGGER trg_route_prescription AFTER INSERT ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.route_prescription();

CREATE OR REPLACE FUNCTION public.route_procedure_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.visit_queue (visit_id, queue_type, priority, entered_at, notes)
  VALUES (NEW.visit_id, 'procedure', 3, now(), NEW.procedure_name)
  ON CONFLICT DO NOTHING;
  PERFORM public.notify_role('nurse','procedure','New procedure order','A procedure has been ordered for nursing.','/queue','procedure', NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_route_procedure_order ON public.procedure_orders;
CREATE TRIGGER trg_route_procedure_order AFTER INSERT ON public.procedure_orders
FOR EACH ROW EXECUTE FUNCTION public.route_procedure_order();

-- Seed core drugs when the catalog is empty.
INSERT INTO public.drug_catalog (drug_name, default_dose, default_frequency, default_duration, medication_class, contraindications, instructions)
SELECT * FROM (VALUES
  ('Paracetamol', '1 g', 'Three times daily', '3 days', 'Analgesic / antipyretic', 'Severe liver disease; caution with alcohol use', 'Do not exceed 4 g per day in adults.'),
  ('Ibuprofen', '400 mg', 'Three times daily after food', '3 days', 'NSAID', 'Peptic ulcer disease, severe kidney disease, NSAID allergy, late pregnancy', 'Take with food; stop if gastric bleeding symptoms occur.'),
  ('Amoxicillin', '500 mg', 'Three times daily', '5 days', 'Penicillin antibiotic', 'Penicillin allergy', 'Complete the full course even if symptoms improve.'),
  ('Azithromycin', '500 mg', 'Once daily', '3 days', 'Macrolide antibiotic', 'Macrolide allergy; caution with QT prolongation', 'Take at the same time daily.'),
  ('Metformin', '500 mg', 'Twice daily with meals', '30 days', 'Biguanide antidiabetic', 'Severe renal impairment, metabolic acidosis', 'Take with meals; monitor glucose.'),
  ('Amlodipine', '5 mg', 'Once daily', '30 days', 'Calcium channel blocker', 'Severe hypotension; caution in heart failure', 'Take daily; report ankle swelling.'),
  ('Omeprazole', '20 mg', 'Once daily before food', '14 days', 'Proton pump inhibitor', 'Hypersensitivity to PPIs', 'Take 30 minutes before breakfast.'),
  ('Ceftriaxone', '1 g', 'Once daily', '3 days', 'Cephalosporin antibiotic', 'Severe cephalosporin allergy', 'For parenteral administration per protocol.'),
  ('Salbutamol inhaler', '2 puffs', 'Every 4–6 hours as needed', 'As needed', 'Short-acting beta agonist', 'Caution with tachyarrhythmias', 'Use with spacer if available; seek care if relief is poor.'),
  ('Cetirizine', '10 mg', 'Once daily', '5 days', 'Antihistamine', 'Severe renal impairment without dose adjustment', 'May cause drowsiness in some patients.')
) AS v(drug_name, default_dose, default_frequency, default_duration, medication_class, contraindications, instructions)
WHERE NOT EXISTS (SELECT 1 FROM public.drug_catalog);

-- Add structured ranges to common existing assays where present.
UPDATE public.lab_tests_catalog SET reference_low = 4.0, reference_high = 11.0, critical_low = 2.0, critical_high = 30.0, units = COALESCE(units, '10^9/L'), reference_range = COALESCE(reference_range, '4.0–11.0') WHERE code IN ('CBC','WBC') OR name ILIKE '%white blood%';
UPDATE public.lab_tests_catalog SET reference_low = 13.0, reference_high = 17.0, critical_low = 7.0, critical_high = 20.0, units = COALESCE(units, 'g/dL'), reference_range = COALESCE(reference_range, '13.0–17.0') WHERE code IN ('HB','HGB') OR name ILIKE '%hemoglobin%';
UPDATE public.lab_tests_catalog SET reference_low = 70, reference_high = 140, critical_low = 40, critical_high = 400, units = COALESCE(units, 'mg/dL'), reference_range = COALESCE(reference_range, '70–140') WHERE name ILIKE '%glucose%';
UPDATE public.lab_tests_catalog SET reference_low = 3.5, reference_high = 5.1, critical_low = 2.5, critical_high = 6.5, units = COALESCE(units, 'mmol/L'), reference_range = COALESCE(reference_range, '3.5–5.1') WHERE name ILIKE '%potassium%';
UPDATE public.lab_tests_catalog SET reference_low = 135, reference_high = 145, critical_low = 120, critical_high = 160, units = COALESCE(units, 'mmol/L'), reference_range = COALESCE(reference_range, '135–145') WHERE name ILIKE '%sodium%';
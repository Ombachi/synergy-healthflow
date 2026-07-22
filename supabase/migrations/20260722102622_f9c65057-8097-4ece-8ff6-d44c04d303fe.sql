
-- 1. Fix trigger referencing non-existent column drug_catalog.name
CREATE OR REPLACE FUNCTION public.post_cdr_on_dispense()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_med TEXT; v_sched TEXT; v_patient UUID; v_prescriber UUID; v_bal NUMERIC;
BEGIN
  SELECT rx.medication, v.patient_id, rx.created_by
    INTO v_med, v_patient, v_prescriber
    FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id
    WHERE rx.id = NEW.prescription_id;
  SELECT controlled_schedule INTO v_sched FROM drug_catalog WHERE drug_name ILIKE v_med LIMIT 1;
  IF v_sched IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(balance_after,0) - COALESCE(NEW.quantity,1)
    INTO v_bal FROM controlled_drug_register
    WHERE drug_name = v_med ORDER BY created_at DESC LIMIT 1;
  INSERT INTO controlled_drug_register(drug_name, schedule, direction, qty, balance_after,
    patient_id, prescriber_id, dispenser_id, ref_table, ref_id)
  VALUES (v_med, v_sched, 'dispense', COALESCE(NEW.quantity,1), COALESCE(v_bal, -COALESCE(NEW.quantity,1)),
    v_patient, v_prescriber, auth.uid(), 'pharmacy_dispenses', NEW.id);
  RETURN NEW;
END $function$;

-- 2. Fix admit_patient_inpatient to set admitting_consultant so
--    "My inpatients" filter for doctors works.
CREATE OR REPLACE FUNCTION public.admit_patient_inpatient(_source_visit uuid, _ward_id uuid, _reason text DEFAULT NULL::text)
 RETURNS TABLE(admission_id uuid, inpatient_visit_id uuid, bed_id uuid, bed_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_src record;
  v_bed record;
  v_new_visit uuid;
  v_admission uuid;
  v_consultant uuid;
BEGIN
  SELECT id, patient_id, assigned_doctor_id, doctor_id, reason, chief_complaint, notes
    INTO v_src
  FROM public.visits
  WHERE id = _source_visit AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source visit not found'; END IF;

  v_consultant := COALESCE(v_src.assigned_doctor_id, v_src.doctor_id, auth.uid());

  SELECT b.id, b.code INTO v_bed
  FROM public.beds b
  WHERE b.ward_id = _ward_id AND b.status IN ('free','available')
  ORDER BY b.code NULLS LAST, b.created_at
  LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RAISE EXCEPTION 'No available beds in this ward'; END IF;

  INSERT INTO public.visits (
    patient_id, doctor_id, assigned_doctor_id, opened_by,
    reason, chief_complaint, notes, status, current_stage
  ) VALUES (
    v_src.patient_id, v_consultant, v_consultant, auth.uid(),
    COALESCE(_reason, 'Inpatient admission'), v_src.chief_complaint, v_src.notes,
    'open', 'admitted'
  ) RETURNING id INTO v_new_visit;

  UPDATE public.beds SET status = 'occupied' WHERE id = v_bed.id;

  INSERT INTO public.admissions (
    patient_id, visit_id, bed_id, admitted_by, admitting_consultant, admission_reason, status
  ) VALUES (
    v_src.patient_id, v_new_visit, v_bed.id, auth.uid(), v_consultant,
    COALESCE(_reason, 'Inpatient admission'), 'active'
  ) RETURNING id INTO v_admission;

  INSERT INTO public.visit_diagnoses (visit_id, icd_code, description, is_primary, added_by)
  SELECT v_new_visit, icd_code, description, is_primary, auth.uid()
  FROM public.visit_diagnoses WHERE visit_id = _source_visit;

  INSERT INTO public.prescriptions (
    visit_id, patient_id, medication, dosage, frequency, route, duration, instructions, created_by
  )
  SELECT v_new_visit, patient_id, medication, dosage, frequency, route, duration, instructions, auth.uid()
  FROM public.prescriptions WHERE visit_id = _source_visit;

  INSERT INTO public.visit_stages (visit_id, stage, entered_by, notes)
  VALUES (v_new_visit, 'admitted', auth.uid(),
          'Admitted from outpatient visit ' || _source_visit::text)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_admission, v_new_visit, v_bed.id, v_bed.code;
END;
$function$;

-- 3. Broaden RLS: invoices are created by billing triggers fired from
--    doctor/nurse/pharmacist/receptionist actions. Allow those roles to
--    INSERT/UPDATE invoices too. Read policy already covers them.
DROP POLICY IF EXISTS inv_write_billing ON public.invoices;
CREATE POLICY inv_write_billing ON public.invoices
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'cashier'::app_role)
    OR has_role(auth.uid(), 'billing_officer'::app_role)
    OR has_role(auth.uid(), 'insurance_officer'::app_role)
    OR has_role(auth.uid(), 'doctor'::app_role)
    OR has_role(auth.uid(), 'nurse'::app_role)
    OR has_role(auth.uid(), 'pharmacist'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'cashier'::app_role)
    OR has_role(auth.uid(), 'billing_officer'::app_role)
    OR has_role(auth.uid(), 'insurance_officer'::app_role)
    OR has_role(auth.uid(), 'doctor'::app_role)
    OR has_role(auth.uid(), 'nurse'::app_role)
    OR has_role(auth.uid(), 'pharmacist'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
  );

-- Ensure invoice_items writes align with the same clinical role set.
DROP POLICY IF EXISTS inv_items_write ON public.invoice_items;
CREATE POLICY inv_items_write ON public.invoice_items
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'cashier'::app_role)
    OR has_role(auth.uid(), 'billing_officer'::app_role)
    OR has_role(auth.uid(), 'insurance_officer'::app_role)
    OR has_role(auth.uid(), 'doctor'::app_role)
    OR has_role(auth.uid(), 'nurse'::app_role)
    OR has_role(auth.uid(), 'pharmacist'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'cashier'::app_role)
    OR has_role(auth.uid(), 'billing_officer'::app_role)
    OR has_role(auth.uid(), 'insurance_officer'::app_role)
    OR has_role(auth.uid(), 'doctor'::app_role)
    OR has_role(auth.uid(), 'nurse'::app_role)
    OR has_role(auth.uid(), 'pharmacist'::app_role)
    OR has_role(auth.uid(), 'receptionist'::app_role)
  );

-- 4. Broaden preauth insert to include nurses & admissions_officer.
DROP POLICY IF EXISTS "preauth doctors create" ON public.preauth_requests;
CREATE POLICY "preauth clinical create" ON public.preauth_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'doctor'::app_role)
    OR has_role(auth.uid(), 'nurse'::app_role)
    OR has_role(auth.uid(), 'insurance_officer'::app_role)
    OR has_role(auth.uid(), 'admissions_officer'::app_role)
  );

-- 5. Add unit price columns for drugs & inventory items so pharmacy/procurement
--    can attach Kenya-market prices per item.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS unit_price_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.drug_catalog
  ADD COLUMN IF NOT EXISTS unit_price_cents integer NOT NULL DEFAULT 0;

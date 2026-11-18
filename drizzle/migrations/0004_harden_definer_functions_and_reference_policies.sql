ALTER FUNCTION public.abp_marker_trend(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.controlled_drug_reconciliation(date, date) SECURITY INVOKER;

CREATE OR REPLACE FUNCTION public.find_duplicate_patients(_name text, _dob date, _phone text)
 RETURNS TABLE(id uuid, full_name text, date_of_birth date, phone text, medical_record_number text, score real)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.full_name, p.date_of_birth, p.phone, p.medical_record_number,
    (
      COALESCE(similarity(p.full_name, COALESCE(_name,'')),0) * 0.6
      + (CASE WHEN _dob IS NOT NULL AND p.date_of_birth = _dob THEN 0.3 ELSE 0 END)
      + (CASE WHEN _phone IS NOT NULL AND p.phone IS NOT NULL AND
              regexp_replace(p.phone,'\D','','g') = regexp_replace(_phone,'\D','','g') THEN 0.3 ELSE 0 END)
    )::real AS score
  FROM public.patients p
  WHERE public.is_staff_member() AND (
    (_name IS NOT NULL AND p.full_name % _name)
    OR (_phone IS NOT NULL AND regexp_replace(p.phone,'\D','','g') = regexp_replace(_phone,'\D','','g'))
    OR (_dob IS NOT NULL AND p.date_of_birth = _dob))
  ORDER BY score DESC
  LIMIT 10
$function$;

CREATE OR REPLACE FUNCTION public.is_thread_participant(_thread uuid, _user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT _user = auth.uid() AND EXISTS (SELECT 1 FROM thread_participants WHERE thread_id = _thread AND user_id = _user)
$function$;

CREATE OR REPLACE FUNCTION public.admit_patient_inpatient(_source_visit uuid, _ward_id uuid, _reason text DEFAULT NULL::text)
 RETURNS TABLE(admission_id uuid, inpatient_visit_id uuid, bed_id uuid, bed_code text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_src record; v_bed record; v_new_visit uuid; v_admission uuid; v_consultant uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse')) THEN
    RAISE EXCEPTION 'Not authorized to admit patients' USING ERRCODE = '42501';
  END IF;

  SELECT id, patient_id, assigned_doctor_id, doctor_id, reason, chief_complaint, notes
    INTO v_src FROM public.visits WHERE id = _source_visit AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source visit not found'; END IF;

  v_consultant := COALESCE(v_src.assigned_doctor_id, v_src.doctor_id, auth.uid());

  SELECT b.id, b.code INTO v_bed FROM public.beds b
  WHERE b.ward_id = _ward_id AND b.status IN ('free','available')
  ORDER BY b.code NULLS LAST, b.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RAISE EXCEPTION 'No available beds in this ward'; END IF;

  INSERT INTO public.visits (patient_id, doctor_id, assigned_doctor_id, opened_by, reason, chief_complaint, notes, status, current_stage)
  VALUES (v_src.patient_id, v_consultant, v_consultant, auth.uid(), COALESCE(_reason, 'Inpatient admission'), v_src.chief_complaint, v_src.notes, 'open', 'admitted')
  RETURNING id INTO v_new_visit;

  UPDATE public.beds SET status = 'occupied' WHERE id = v_bed.id;

  INSERT INTO public.admissions (patient_id, visit_id, bed_id, admitted_by, admitting_consultant, admission_reason, status)
  VALUES (v_src.patient_id, v_new_visit, v_bed.id, auth.uid(), v_consultant, COALESCE(_reason, 'Inpatient admission'), 'active')
  RETURNING id INTO v_admission;

  INSERT INTO public.visit_diagnoses (visit_id, icd_code, description, is_primary, added_by)
  SELECT v_new_visit, icd_code, description, is_primary, auth.uid() FROM public.visit_diagnoses WHERE visit_id = _source_visit;

  INSERT INTO public.prescriptions (visit_id, patient_id, medication, dosage, frequency, route, duration, instructions, created_by)
  SELECT v_new_visit, patient_id, medication, dosage, frequency, route, duration, instructions, auth.uid()
  FROM public.prescriptions WHERE visit_id = _source_visit;

  INSERT INTO public.visit_stages (visit_id, stage, entered_by, notes)
  VALUES (v_new_visit, 'admitted', auth.uid(), 'Admitted from outpatient visit ' || _source_visit::text)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_admission, v_new_visit, v_bed.id, v_bed.code;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.add_invoice_line(uuid,text,text,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_open_invoice(uuid) FROM PUBLIC, anon, authenticated;

-- Staff-only reference tables
DROP POLICY IF EXISTS "wards readable by staff" ON public.wards;
CREATE POLICY "wards readable by staff" ON public.wards FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "auth read item_categories" ON public.item_categories;
CREATE POLICY "auth read item_categories" ON public.item_categories FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "lrt_read" ON public.lab_result_templates;
CREATE POLICY "lrt_read" ON public.lab_result_templates FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "dar_read" ON public.drug_allergy_rules;
CREATE POLICY "dar_read" ON public.drug_allergy_rules FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "icd_read" ON public.icd11_codes;
CREATE POLICY "icd_read" ON public.icd11_codes FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "staff read kepi schedule" ON public.kepi_schedule;
CREATE POLICY "staff read kepi schedule" ON public.kepi_schedule FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "staff read qc_panels" ON public.qc_panels;
CREATE POLICY "staff read qc_panels" ON public.qc_panels FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "lab_catalog_read" ON public.lab_tests_catalog;
CREATE POLICY "lab_catalog_read" ON public.lab_tests_catalog FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "di_read" ON public.drug_interactions;
CREATE POLICY "di_read" ON public.drug_interactions FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "lt read" ON public.leave_types;
CREATE POLICY "lt read" ON public.leave_types FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "rrt_read" ON public.radiology_report_templates;
CREATE POLICY "rrt_read" ON public.radiology_report_templates FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "staff read vaccine catalog" ON public.vaccine_catalog;
CREATE POLICY "staff read vaccine catalog" ON public.vaccine_catalog FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "hr_dept read" ON public.hr_departments;
CREATE POLICY "hr_dept read" ON public.hr_departments FOR SELECT TO authenticated USING (public.is_staff_member());
DROP POLICY IF EXISTS "payers_read" ON public.insurance_payers;
CREATE POLICY "payers_read" ON public.insurance_payers FOR SELECT TO authenticated USING (public.is_staff_member());

-- Patient-facing reference tables: staff, patients and athletes
DROP POLICY IF EXISTS "consent_templates read" ON public.consent_templates;
CREATE POLICY "consent_templates read" ON public.consent_templates FOR SELECT TO authenticated
  USING (public.is_staff_member() OR public.has_role(auth.uid(),'patient') OR public.has_role(auth.uid(),'athlete'));
DROP POLICY IF EXISTS "eq_select" ON public.mobility_equipment_types;
CREATE POLICY "eq_select" ON public.mobility_equipment_types FOR SELECT TO authenticated
  USING (public.is_staff_member() OR public.has_role(auth.uid(),'patient') OR public.has_role(auth.uid(),'athlete'));
DROP POLICY IF EXISTS "auth read catalog" ON public.service_catalog;
DROP POLICY IF EXISTS "sc_read" ON public.service_catalog;
CREATE POLICY "sc_read" ON public.service_catalog FOR SELECT TO authenticated
  USING (public.is_staff_member() OR public.has_role(auth.uid(),'patient') OR public.has_role(auth.uid(),'athlete'));
DROP POLICY IF EXISTS "prc_select" ON public.mobility_pricing_rules;
CREATE POLICY "prc_select" ON public.mobility_pricing_rules FOR SELECT TO authenticated
  USING (public.is_staff_member() OR public.has_role(auth.uid(),'patient') OR public.has_role(auth.uid(),'athlete'));
DROP POLICY IF EXISTS "refill_policies_read" ON public.refill_policies;
CREATE POLICY "refill_policies_read" ON public.refill_policies FOR SELECT TO authenticated
  USING (public.is_staff_member() OR public.has_role(auth.uid(),'patient') OR public.has_role(auth.uid(),'athlete'));

CREATE OR REPLACE FUNCTION public.admit_patient_inpatient(
  _source_visit uuid,
  _ward_id uuid,
  _reason text DEFAULT NULL
)
RETURNS TABLE(admission_id uuid, inpatient_visit_id uuid, bed_id uuid, bed_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_src record;
  v_bed record;
  v_new_visit uuid;
  v_admission uuid;
BEGIN
  -- Load source visit
  SELECT id, patient_id, assigned_doctor_id, doctor_id, reason, chief_complaint, notes
    INTO v_src
  FROM public.visits
  WHERE id = _source_visit AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source visit not found';
  END IF;

  -- Pick first available bed in the ward
  SELECT b.id, b.code
    INTO v_bed
  FROM public.beds b
  WHERE b.ward_id = _ward_id
    AND b.status IN ('free','available')
  ORDER BY b.code NULLS LAST, b.created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No available beds in this ward';
  END IF;

  -- Create the NEW inpatient encounter on the same patient (same MRN)
  INSERT INTO public.visits (
    patient_id, doctor_id, assigned_doctor_id, opened_by,
    reason, chief_complaint, notes,
    status, current_stage
  ) VALUES (
    v_src.patient_id,
    COALESCE(v_src.doctor_id, v_src.assigned_doctor_id),
    COALESCE(v_src.assigned_doctor_id, v_src.doctor_id),
    auth.uid(),
    COALESCE(_reason, 'Inpatient admission'),
    v_src.chief_complaint,
    v_src.notes,
    'open',
    'admitted'
  )
  RETURNING id INTO v_new_visit;

  -- Mark bed occupied
  UPDATE public.beds SET status = 'occupied' WHERE id = v_bed.id;

  -- Create admission row
  INSERT INTO public.admissions (
    patient_id, visit_id, bed_id, admitted_by, admission_reason, status
  ) VALUES (
    v_src.patient_id, v_new_visit, v_bed.id, auth.uid(),
    COALESCE(_reason, 'Inpatient admission'), 'active'
  )
  RETURNING id INTO v_admission;

  -- Carry forward diagnoses from the source outpatient visit
  INSERT INTO public.visit_diagnoses (visit_id, icd_code, description, is_primary, added_by)
  SELECT v_new_visit, icd_code, description, is_primary, auth.uid()
  FROM public.visit_diagnoses
  WHERE visit_id = _source_visit;

  -- Carry forward active prescriptions (best-effort — copy medication text so
  -- the inpatient team can reconcile them on the MAR).
  INSERT INTO public.prescriptions (
    visit_id, patient_id, medication, dosage, frequency, route, duration, instructions, created_by
  )
  SELECT v_new_visit, patient_id, medication, dosage, frequency, route, duration, instructions, auth.uid()
  FROM public.prescriptions
  WHERE visit_id = _source_visit;

  -- Log a stage entry for the new inpatient encounter
  INSERT INTO public.visit_stages (visit_id, stage, entered_by, notes)
  VALUES (v_new_visit, 'admitted', auth.uid(),
          'Admitted from outpatient visit ' || _source_visit::text)
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT v_admission, v_new_visit, v_bed.id, v_bed.code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admit_patient_inpatient(uuid, uuid, text) TO authenticated;

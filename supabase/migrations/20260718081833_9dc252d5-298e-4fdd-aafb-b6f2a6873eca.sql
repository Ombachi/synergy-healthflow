CREATE OR REPLACE FUNCTION public.admit_patient(_visit_id uuid, _ward_id uuid, _reason text DEFAULT NULL::text)
 RETURNS TABLE(admission_id uuid, bed_id uuid, bed_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient uuid;
  v_bed_id uuid;
  v_bed_code text;
  v_adm_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'admin')) THEN
    RAISE EXCEPTION 'Only doctors or admins can admit patients';
  END IF;

  SELECT patient_id INTO v_patient FROM public.visits WHERE id = _visit_id;
  IF v_patient IS NULL THEN RAISE EXCEPTION 'Visit not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.admissions WHERE visit_id = _visit_id AND status = 'active') THEN
    RAISE EXCEPTION 'Patient already admitted for this visit';
  END IF;

  SELECT id, code INTO v_bed_id, v_bed_code
    FROM public.beds
   WHERE ward_id = _ward_id AND status IN ('free','available')
   ORDER BY code
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_bed_id IS NULL THEN
    RAISE EXCEPTION 'No available beds in this ward';
  END IF;

  INSERT INTO public.admissions(patient_id, visit_id, bed_id, admitted_at, status, admission_reason, admitted_by)
  VALUES (v_patient, _visit_id, v_bed_id, now(), 'active', _reason, auth.uid())
  RETURNING id INTO v_adm_id;

  UPDATE public.beds SET status = 'occupied' WHERE id = v_bed_id;

  RETURN QUERY SELECT v_adm_id, v_bed_id, v_bed_code;
END $function$;
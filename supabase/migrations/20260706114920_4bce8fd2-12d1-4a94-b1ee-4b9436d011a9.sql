
-- 1) Purge role data
DELETE FROM public.user_roles WHERE role IN ('coach'::public.app_role, 'team_manager'::public.app_role);
UPDATE public.profiles SET onboarded_as = 'patient'::public.app_role
  WHERE onboarded_as IN ('coach'::public.app_role, 'team_manager'::public.app_role);
DELETE FROM public.announcements
  WHERE audience_role IN ('coach'::public.app_role, 'team_manager'::public.app_role);
DELETE FROM public.access_review_items
  WHERE role IN ('coach'::public.app_role, 'team_manager'::public.app_role);

-- 2) Drop team-only tables (cascades their policies/FKs)
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.teams CASCADE;
DROP TABLE IF EXISTS public.coach_profiles CASCADE;

-- 3) Drop policies that name coach/team_manager
DROP POLICY IF EXISTS "Clinical staff manage abp alerts" ON public.abp_alerts;
DROP POLICY IF EXISTS "Clinical staff manage abp biomarkers" ON public.abp_biomarkers;
DROP POLICY IF EXISTS "Clinical staff manage abp samples" ON public.abp_samples;
DROP POLICY IF EXISTS "as_manage" ON public.assessments;
DROP POLICY IF EXISTS "Coaches/admins manage athletes" ON public.athletes;
DROP POLICY IF EXISTS "athletes_select_scoped" ON public.athletes;
DROP POLICY IF EXISTS "athletes_self_insert" ON public.athletes;
DROP POLICY IF EXISTS "att_manage" ON public.attendance;
DROP POLICY IF EXISTS "comp_manage" ON public.competitions;
DROP POLICY IF EXISTS "inj_manage" ON public.injuries;
DROP POLICY IF EXISTS "pr_manage" ON public.performance_records;
DROP POLICY IF EXISTS "Sports team manages physiology" ON public.sports_physiology;
DROP POLICY IF EXISTS "tp_manage" ON public.training_plans;
DROP POLICY IF EXISTS "ts_manage" ON public.training_sessions;

-- 4) Recreate without coach/team_manager
CREATE POLICY "Clinical staff manage abp alerts" ON public.abp_alerts FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio'));

CREATE POLICY "Clinical staff manage abp biomarkers" ON public.abp_biomarkers FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio'));

CREATE POLICY "Clinical staff manage abp samples" ON public.abp_samples FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio'));

CREATE POLICY "as_manage" ON public.assessments FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio'));

CREATE POLICY "Admins manage athletes" ON public.athletes FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "athletes_select_scoped" ON public.athletes FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'physio')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'nutritionist')
    OR public.has_role(auth.uid(),'nurse')
  );

CREATE POLICY "athletes_self_insert" ON public.athletes FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "att_manage" ON public.attendance FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_officer') OR public.has_role(auth.uid(),'hr_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_officer') OR public.has_role(auth.uid(),'hr_manager'));

CREATE POLICY "comp_manage" ON public.competitions FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "inj_manage" ON public.injuries FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio'));

CREATE POLICY "pr_manage" ON public.performance_records FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'physio'));

CREATE POLICY "Sports team manages physiology" ON public.sports_physiology FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'nutritionist'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'nutritionist'));

CREATE POLICY "tp_manage" ON public.training_plans FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'physio'));

CREATE POLICY "ts_manage" ON public.training_sessions FOR ALL
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'physio'));

-- 5) Admit action
CREATE OR REPLACE FUNCTION public.admit_patient(_visit_id uuid, _ward_id uuid, _reason text DEFAULT NULL)
RETURNS TABLE(admission_id uuid, bed_id uuid, bed_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
   WHERE ward_id = _ward_id AND status = 'available'
   ORDER BY code
   LIMIT 1
   FOR UPDATE SKIP LOCKED;

  IF v_bed_id IS NULL THEN
    RAISE EXCEPTION 'No available beds in this ward';
  END IF;

  INSERT INTO public.admissions(patient_id, visit_id, bed_id, admitted_at, status, admission_reason, admitted_by)
  VALUES (v_patient, _visit_id, v_bed_id, now(), 'active', _reason, auth.uid())
  RETURNING id INTO v_adm_id;

  RETURN QUERY SELECT v_adm_id, v_bed_id, v_bed_code;
END $$;

GRANT EXECUTE ON FUNCTION public.admit_patient(uuid, uuid, text) TO authenticated;

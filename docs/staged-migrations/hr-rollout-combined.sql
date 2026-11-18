-- APPLIED 2026-11-18 as drizzle migration 0005. Re-runnable (idempotent) SQL to push the staff portal changes to another database.
INSERT INTO public.user_facilities(user_id, facility_id, is_primary)
SELECT e.id, public.main_facility_id(), true FROM public.employees e
WHERE NOT EXISTS(SELECT 1 FROM public.user_facilities uf WHERE uf.user_id=e.id);

CREATE TABLE IF NOT EXISTS public.staff_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  council text NOT NULL,
  license_number text NOT NULL,
  issue_date date,
  expiry_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (council, license_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_licenses TO authenticated;
GRANT ALL ON public.staff_licenses TO service_role;
ALTER TABLE public.staff_licenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read own licenses" ON public.staff_licenses;
CREATE POLICY "Staff read own licenses" ON public.staff_licenses FOR SELECT TO authenticated USING (employee_id = auth.uid());
DROP POLICY IF EXISTS "HR manage licenses" ON public.staff_licenses;
CREATE POLICY "HR manage licenses" ON public.staff_licenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_officer') OR public.has_role(auth.uid(),'hr_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_officer') OR public.has_role(auth.uid(),'hr_manager'));
CREATE OR REPLACE FUNCTION public.staff_licenses_validate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.council NOT IN ('KMPDC','NCK','PPB','KMLTTB','COC','OTHER') THEN RAISE EXCEPTION 'Unknown council %', NEW.council; END IF;
  IF length(trim(NEW.license_number)) = 0 THEN RAISE EXCEPTION 'License number required'; END IF;
  IF NEW.issue_date IS NOT NULL AND NEW.expiry_date <= NEW.issue_date THEN RAISE EXCEPTION 'Expiry must be after issue date'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS staff_licenses_validate ON public.staff_licenses;
CREATE TRIGGER staff_licenses_validate BEFORE INSERT OR UPDATE ON public.staff_licenses FOR EACH ROW EXECUTE FUNCTION public.staff_licenses_validate();

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hr_onboarded_at timestamptz;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS balance_deducted_at timestamptz;
UPDATE public.leave_requests SET balance_deducted_at = COALESCE(hr_decision_at, supervisor_decision_at, updated_at) WHERE status = 'approved' AND balance_deducted_at IS NULL;

CREATE OR REPLACE FUNCTION public.hr_can_manage(_facility uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.facilities WHERE id=_facility AND is_active)
 AND NOT EXISTS(SELECT 1 FROM public.facility_modules WHERE facility_id=_facility AND module='hr' AND NOT enabled)
 AND (public.has_role(auth.uid(),'admin') OR EXISTS(
 SELECT 1 FROM public.user_facilities uf JOIN public.user_roles ur ON ur.user_id=uf.user_id
 WHERE uf.user_id=auth.uid() AND uf.facility_id=_facility AND ur.role IN ('hr_officer','hr_manager')
 AND (uf.role IS NULL OR uf.role IN ('hr_officer','hr_manager'))));
$$;
REVOKE ALL ON FUNCTION public.hr_can_manage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_can_manage(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_staff_options(_facility uuid)
RETURNS TABLE(id uuid, full_name text, onboarded boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.hr_can_manage(_facility) THEN RAISE EXCEPTION 'HR access to this branch is required'; END IF;
 RETURN QUERY SELECT p.id,p.full_name,e.hr_onboarded_at IS NOT NULL
 FROM public.profiles p JOIN public.user_facilities uf ON uf.user_id=p.id
 LEFT JOIN public.employees e ON e.id=p.id
 WHERE uf.facility_id=_facility AND (uf.role IS NULL OR uf.role NOT IN ('patient','athlete'))
 AND EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role NOT IN ('patient','athlete'))
 ORDER BY p.full_name;
END $$;
REVOKE ALL ON FUNCTION public.hr_staff_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_staff_options(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_onboard_employee(_facility uuid,_user uuid,_position text,_department uuid,_year int,_quotas jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q jsonb; v_name text; v_days numeric;
BEGIN
 IF NOT public.hr_can_manage(_facility) THEN RAISE EXCEPTION 'HR access to this branch is required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.user_facilities WHERE user_id=_user AND facility_id=_facility AND (role IS NULL OR role NOT IN ('patient','athlete')))
 OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user AND role NOT IN ('patient','athlete')) THEN RAISE EXCEPTION 'Select a staff account assigned to this branch'; END IF;
 IF _position IS NULL OR _year IS NULL OR length(trim(_position)) NOT BETWEEN 1 AND 150 OR _year NOT BETWEEN 2000 AND 2100 OR NOT EXISTS(SELECT 1 FROM public.hr_departments WHERE id=_department) THEN RAISE EXCEPTION 'A valid job title, department and quota year are required'; END IF;
 IF _quotas IS NULL OR jsonb_typeof(_quotas) <> 'array' THEN RAISE EXCEPTION 'Initial leave quotas are required'; END IF;
 IF jsonb_array_length(_quotas)=0 THEN RAISE EXCEPTION 'Initial leave quotas are required'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(_quotas)) <> (SELECT count(DISTINCT x->>'leave_type_id') FROM jsonb_array_elements(_quotas) x) THEN RAISE EXCEPTION 'Duplicate leave type'; END IF;
 SELECT full_name INTO v_name FROM public.profiles WHERE id=_user;
 IF v_name IS NULL OR trim(v_name)='' THEN RAISE EXCEPTION 'Staff account needs a full name before onboarding'; END IF;
 INSERT INTO public.employees(id,full_name,facility_id) VALUES(_user,v_name,_facility) ON CONFLICT(id) DO NOTHING;
 PERFORM 1 FROM public.employees WHERE id=_user FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.employees WHERE id=_user AND hr_onboarded_at IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.leave_balances WHERE employee_id=_user AND year=_year)
 THEN RAISE EXCEPTION 'Employee is already onboarded or has balances for this year; use the existing employee record'; END IF;
 FOR q IN SELECT * FROM jsonb_array_elements(_quotas) LOOP
  v_days := (q->>'days')::numeric;
  IF v_days IS NULL OR v_days NOT BETWEEN 0 AND 366 OR NOT EXISTS(SELECT 1 FROM public.leave_types WHERE id=(q->>'leave_type_id')::uuid) THEN RAISE EXCEPTION 'Invalid leave quota'; END IF;
  INSERT INTO public.leave_balances(employee_id,leave_type_id,year,balance_days,used_days) VALUES(_user,(q->>'leave_type_id')::uuid,_year,v_days,0);
 END LOOP;
 UPDATE public.employees SET position=trim(_position),department_id=_department,hr_onboarded_at=now() WHERE id=_user;
END $$;
REVOKE ALL ON FUNCTION public.hr_onboard_employee(uuid,uuid,text,uuid,int,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_onboard_employee(uuid,uuid,text,uuid,int,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.hr_guard_leave()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_year int; v_default numeric;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status='approved' OR NEW.balance_deducted_at IS NOT NULL THEN RAISE EXCEPTION 'Submit leave before approval'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.balance_deducted_at IS NOT NULL OR OLD.status='approved' THEN
  IF (NEW.status,NEW.employee_id,NEW.leave_type_id,NEW.start_date,NEW.end_date,NEW.days,NEW.balance_deducted_at)
   IS DISTINCT FROM (OLD.status,OLD.employee_id,OLD.leave_type_id,OLD.start_date,OLD.end_date,OLD.days,OLD.balance_deducted_at)
  THEN RAISE EXCEPTION 'Approved leave accounting cannot be edited or approved again'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.balance_deducted_at IS DISTINCT FROM OLD.balance_deducted_at THEN RAISE EXCEPTION 'Leave deduction marker is managed automatically'; END IF;
 IF NEW.status='approved' THEN
  IF NOT EXISTS(SELECT 1 FROM public.user_facilities uf WHERE uf.user_id=OLD.employee_id AND public.hr_can_manage(uf.facility_id)) THEN RAISE EXCEPTION 'Final approval requires branch HR access'; END IF;
  IF auth.uid()=OLD.employee_id THEN RAISE EXCEPTION 'You cannot approve your own leave'; END IF;
  IF OLD.status NOT IN ('submitted','pending','clarification') THEN RAISE EXCEPTION 'Only submitted leave can be approved'; END IF;
  IF (NEW.employee_id,NEW.leave_type_id,NEW.start_date,NEW.end_date,NEW.days) IS DISTINCT FROM (OLD.employee_id,OLD.leave_type_id,OLD.start_date,OLD.end_date,OLD.days) THEN RAISE EXCEPTION 'Leave details cannot change during approval'; END IF;
  IF NEW.days IS NULL OR NEW.days<=0 OR NEW.days>366 OR NEW.end_date<NEW.start_date OR NEW.days<>(NEW.end_date-NEW.start_date+1) THEN RAISE EXCEPTION 'Invalid leave dates or days'; END IF;
  v_year:=extract(year FROM NEW.start_date)::int;
  IF extract(year FROM NEW.end_date)::int<>v_year THEN RAISE EXCEPTION 'Split leave across calendar years before approval'; END IF;
  SELECT default_days_per_year INTO v_default FROM public.leave_types WHERE id=NEW.leave_type_id;
  INSERT INTO public.leave_balances(employee_id,leave_type_id,year,balance_days,used_days)
   VALUES(NEW.employee_id,NEW.leave_type_id,v_year,COALESCE(v_default,0),0) ON CONFLICT(employee_id,leave_type_id,year) DO NOTHING;
  UPDATE public.leave_balances SET balance_days=balance_days-NEW.days,used_days=used_days+NEW.days
   WHERE employee_id=NEW.employee_id AND leave_type_id=NEW.leave_type_id AND year=v_year AND balance_days>=NEW.days;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient leave balance'; END IF;
  NEW.balance_deducted_at:=now(); NEW.hr_id:=auth.uid(); NEW.hr_decision_at:=now();
 END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='trg_hr_guard_leave' AND tgrelid='public.leave_requests'::regclass) THEN
  CREATE TRIGGER trg_hr_guard_leave BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.hr_guard_leave();
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.apply_leave_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.hr_decide_leave(_facility uuid,_request uuid,_status text,_comment text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.leave_requests;
BEGIN
 IF NOT public.hr_can_manage(_facility) THEN RAISE EXCEPTION 'Final leave decisions require branch HR access'; END IF;
 IF _status IS NULL OR _status NOT IN ('approved','rejected','clarification') OR length(COALESCE(_comment,''))>2000 THEN RAISE EXCEPTION 'Invalid leave decision'; END IF;
 SELECT * INTO r FROM public.leave_requests WHERE id=_request FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.user_facilities WHERE user_id=r.employee_id AND facility_id=_facility) THEN RAISE EXCEPTION 'Leave request is not available in this branch'; END IF;
 IF r.employee_id=auth.uid() THEN RAISE EXCEPTION 'You cannot decide your own leave'; END IF;
 IF r.status=_status THEN RETURN; END IF;
 IF r.status NOT IN ('submitted','pending','clarification') THEN RAISE EXCEPTION 'This request has already been decided'; END IF;
 UPDATE public.leave_requests SET status=_status,hr_notes=NULLIF(_comment,''),hr_id=auth.uid(),hr_decision_at=now() WHERE id=_request;
END $$;
REVOKE ALL ON FUNCTION public.hr_decide_leave(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_decide_leave(uuid,uuid,text,text) TO authenticated;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.payroll_periods ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
UPDATE public.employees SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.attendance a SET facility_id = COALESCE((SELECT e.facility_id FROM public.employees e WHERE e.id=a.user_id), public.main_facility_id()) WHERE a.facility_id IS NULL;
UPDATE public.leave_requests r SET facility_id = COALESCE((SELECT e.facility_id FROM public.employees e WHERE e.id=r.employee_id), public.main_facility_id()) WHERE r.facility_id IS NULL;
UPDATE public.payslips p SET facility_id = COALESCE((SELECT e.facility_id FROM public.employees e WHERE e.id=p.employee_id), public.main_facility_id()) WHERE p.facility_id IS NULL;
UPDATE public.shifts SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.payroll_periods SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;

CREATE OR REPLACE FUNCTION public.hr_inherit_facility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner uuid; v_facility uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
  RAISE EXCEPTION 'HR records cannot be moved between facilities through ordinary edits';
 END IF;
 IF TG_TABLE_NAME IN ('attendance','leave_requests','payslips') THEN
  IF TG_TABLE_NAME='attendance' THEN v_owner:=NEW.user_id;
  ELSE v_owner:=NEW.employee_id; END IF;
  SELECT facility_id INTO v_facility FROM public.employees WHERE id=v_owner;
  IF v_facility IS NULL THEN RAISE EXCEPTION 'Employee branch onboarding is required'; END IF;
  IF NEW.facility_id IS NOT NULL AND NEW.facility_id<>v_facility THEN
   RAISE EXCEPTION 'Employee and record must belong to the same facility';
  END IF;
  NEW.facility_id:=v_facility;
 ELSIF TG_TABLE_NAME='employees' THEN
  IF NEW.facility_id IS NULL THEN
   SELECT facility_id INTO NEW.facility_id FROM public.user_facilities WHERE user_id=NEW.id ORDER BY is_primary DESC NULLS LAST, created_at LIMIT 1;
   NEW.facility_id:=COALESCE(NEW.facility_id, public.main_facility_id());
  END IF;
 ELSE
  IF NEW.facility_id IS NULL THEN RAISE EXCEPTION 'Select an explicit facility for this HR record'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.facilities WHERE id=NEW.facility_id AND is_active)
  THEN RAISE EXCEPTION 'Select an active facility'; END IF;
 IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_facility_access(NEW.facility_id))
  THEN RAISE EXCEPTION 'Facility membership is required'; END IF;
 IF TG_TABLE_NAME='payslips' AND NOT EXISTS(SELECT 1 FROM public.payroll_periods WHERE id=NEW.period_id AND facility_id=NEW.facility_id)
  THEN RAISE EXCEPTION 'Payroll period and payslip must belong to the same facility'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_inherit_facility() FROM PUBLIC, anon;

CREATE INDEX IF NOT EXISTS employees_facility_idx ON public.employees(facility_id);
DROP TRIGGER IF EXISTS employees_inherit_facility ON public.employees;
CREATE TRIGGER employees_inherit_facility BEFORE INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS employees_facility_fence ON public.employees;
CREATE POLICY employees_facility_fence ON public.employees AS RESTRICTIVE FOR ALL TO authenticated
 USING (id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id))
 WITH CHECK (id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id));

CREATE INDEX IF NOT EXISTS attendance_facility_idx ON public.attendance(facility_id);
DROP TRIGGER IF EXISTS attendance_inherit_facility ON public.attendance;
CREATE TRIGGER attendance_inherit_facility BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS attendance_facility_fence ON public.attendance;
CREATE POLICY attendance_facility_fence ON public.attendance AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id));

CREATE INDEX IF NOT EXISTS shifts_facility_idx ON public.shifts(facility_id);
DROP TRIGGER IF EXISTS shifts_inherit_facility ON public.shifts;
CREATE TRIGGER shifts_inherit_facility BEFORE INSERT OR UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS shifts_facility_fence ON public.shifts;
CREATE POLICY shifts_facility_fence ON public.shifts AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id));

CREATE INDEX IF NOT EXISTS leave_requests_facility_idx ON public.leave_requests(facility_id);
DROP TRIGGER IF EXISTS leave_requests_inherit_facility ON public.leave_requests;
CREATE TRIGGER leave_requests_inherit_facility BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS leave_requests_facility_fence ON public.leave_requests;
CREATE POLICY leave_requests_facility_fence ON public.leave_requests AS RESTRICTIVE FOR ALL TO authenticated
 USING (employee_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id))
 WITH CHECK (employee_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id));

CREATE INDEX IF NOT EXISTS payslips_facility_idx ON public.payslips(facility_id);
DROP TRIGGER IF EXISTS payslips_inherit_facility ON public.payslips;
CREATE TRIGGER payslips_inherit_facility BEFORE INSERT OR UPDATE ON public.payslips FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS payslips_facility_fence ON public.payslips;
CREATE POLICY payslips_facility_fence ON public.payslips AS RESTRICTIVE FOR ALL TO authenticated
 USING (employee_id=auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id));

CREATE INDEX IF NOT EXISTS payroll_periods_facility_idx ON public.payroll_periods(facility_id);
DROP TRIGGER IF EXISTS payroll_periods_inherit_facility ON public.payroll_periods;
CREATE TRIGGER payroll_periods_inherit_facility BEFORE INSERT OR UPDATE ON public.payroll_periods FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS payroll_periods_facility_fence ON public.payroll_periods;
CREATE POLICY payroll_periods_facility_fence ON public.payroll_periods AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id) OR EXISTS(SELECT 1 FROM public.payslips p WHERE p.period_id=payroll_periods.id AND p.employee_id=auth.uid()))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_access(facility_id));

DROP POLICY IF EXISTS attendance_privacy_fence ON public.attendance;
CREATE POLICY attendance_privacy_fence ON public.attendance AS RESTRICTIVE FOR SELECT TO authenticated
 USING (user_id=auth.uid() OR public.is_hr_staff() OR public.has_role(auth.uid(),'dept_manager'));
DROP POLICY IF EXISTS payslips_privacy_fence ON public.payslips;
CREATE POLICY payslips_privacy_fence ON public.payslips AS RESTRICTIVE FOR SELECT TO authenticated
 USING (public.is_hr_staff() OR (employee_id=auth.uid() AND published));

DROP POLICY IF EXISTS assignments_facility_fence ON public.shift_assignments;
CREATE POLICY assignments_facility_fence ON public.shift_assignments AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.shifts s WHERE s.id=shift_id AND (public.has_role(auth.uid(),'admin') OR public.has_facility_access(s.facility_id))))
 WITH CHECK (EXISTS(SELECT 1 FROM public.shifts s JOIN public.employees e ON e.id=user_id AND e.facility_id=s.facility_id WHERE s.id=shift_id AND (public.has_role(auth.uid(),'admin') OR public.has_facility_access(s.facility_id))));
DROP POLICY IF EXISTS leave_balances_facility_fence ON public.leave_balances;
CREATE POLICY leave_balances_facility_fence ON public.leave_balances AS RESTRICTIVE FOR ALL TO authenticated
 USING (employee_id=auth.uid() OR EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND (public.has_role(auth.uid(),'admin') OR public.has_facility_access(e.facility_id))))
 WITH CHECK (EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND (public.has_role(auth.uid(),'admin') OR public.has_facility_access(e.facility_id))));
-- Apply through the migration tool when Lovable Cloud is available.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS hr_onboarded_at timestamptz;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS balance_deducted_at timestamptz;
-- Existing approved requests already ran the old deduction trigger; never deduct again.
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
 INSERT INTO public.employees(id,full_name) VALUES(_user,v_name) ON CONFLICT(id) DO NOTHING;
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

-- The BEFORE trigger is the single atomic accounting boundary, including direct updates.
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
-- Keep the legacy trigger attached, but retire its flooring/double-deduction behavior.
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

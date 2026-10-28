-- Staged HR branch isolation. Apply after reviewing live schema and policies.
-- Uses employee_id on leave_requests (the replacement HR schema), not user_id.
-- Restrictive policies intersect existing role/self policies; permissive OR
-- policies alone cannot prevent the old global policies from exposing branches.
-- Legacy rows with no known branch retain MAIN ownership for manual review.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.payslips ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.payroll_periods ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
UPDATE public.employees SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.attendance a SET facility_id = COALESCE((SELECT e.facility_id FROM public.employees e WHERE e.id=a.user_id), public.main_facility_id()) WHERE a.facility_id IS NULL;
UPDATE public.leave_requests r SET facility_id = (SELECT e.facility_id FROM public.employees e WHERE e.id=r.employee_id) WHERE r.facility_id IS NULL;
UPDATE public.payslips p SET facility_id = (SELECT e.facility_id FROM public.employees e WHERE e.id=p.employee_id) WHERE p.facility_id IS NULL;
UPDATE public.shifts SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.payroll_periods SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;

-- Shifts require explicit selected-branch ownership, never the creator's home branch.
-- Linked records inherit from their authoritative employee; explicit mismatches fail.
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
 ELSE
  IF NEW.facility_id IS NULL THEN RAISE EXCEPTION 'Select an explicit facility for this HR record'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.facilities WHERE id=NEW.facility_id AND is_active)
  THEN RAISE EXCEPTION 'Select an active facility'; END IF;
 IF auth.uid() IS NOT NULL AND NOT (public.has_role(auth.uid(),'admin') OR public.has_facility_id(NEW.facility_id))
  THEN RAISE EXCEPTION 'Facility membership is required'; END IF;
 IF TG_TABLE_NAME='employees' AND NOT EXISTS(SELECT 1 FROM public.user_facilities WHERE user_id=NEW.id AND facility_id=NEW.facility_id)
  THEN RAISE EXCEPTION 'Staff must be assigned to their employee facility'; END IF;
 IF TG_TABLE_NAME='payslips' AND NOT EXISTS(SELECT 1 FROM public.payroll_periods WHERE id=NEW.period_id AND facility_id=NEW.facility_id)
  THEN RAISE EXCEPTION 'Payroll period and payslip must belong to the same facility'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hr_inherit_facility() FROM PUBLIC, anon;
CREATE INDEX IF NOT EXISTS employees_facility_idx ON public.employees(facility_id);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.employees TO service_role;
DROP TRIGGER IF EXISTS employees_inherit_facility ON public.employees;
CREATE TRIGGER employees_inherit_facility BEFORE INSERT OR UPDATE ON public.employees
 FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS employees_facility_fence ON public.employees;
CREATE POLICY employees_facility_fence ON public.employees AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id));
CREATE INDEX IF NOT EXISTS attendance_facility_idx ON public.attendance(facility_id);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.attendance TO service_role;
DROP TRIGGER IF EXISTS attendance_inherit_facility ON public.attendance;
CREATE TRIGGER attendance_inherit_facility BEFORE INSERT OR UPDATE ON public.attendance
 FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS attendance_facility_fence ON public.attendance;
CREATE POLICY attendance_facility_fence ON public.attendance AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id));
CREATE INDEX IF NOT EXISTS shifts_facility_idx ON public.shifts(facility_id);
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.shifts TO service_role;
DROP TRIGGER IF EXISTS shifts_inherit_facility ON public.shifts;
CREATE TRIGGER shifts_inherit_facility BEFORE INSERT OR UPDATE ON public.shifts
 FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS shifts_facility_fence ON public.shifts;
CREATE POLICY shifts_facility_fence ON public.shifts AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id));
CREATE INDEX IF NOT EXISTS leave_requests_facility_idx ON public.leave_requests(facility_id);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.leave_requests TO service_role;
DROP TRIGGER IF EXISTS leave_requests_inherit_facility ON public.leave_requests;
CREATE TRIGGER leave_requests_inherit_facility BEFORE INSERT OR UPDATE ON public.leave_requests
 FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS leave_requests_facility_fence ON public.leave_requests;
CREATE POLICY leave_requests_facility_fence ON public.leave_requests AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id));
CREATE INDEX IF NOT EXISTS payslips_facility_idx ON public.payslips(facility_id);
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.payslips TO service_role;
DROP TRIGGER IF EXISTS payslips_inherit_facility ON public.payslips;
CREATE TRIGGER payslips_inherit_facility BEFORE INSERT OR UPDATE ON public.payslips
 FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS payslips_facility_fence ON public.payslips;
CREATE POLICY payslips_facility_fence ON public.payslips AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id));
CREATE INDEX IF NOT EXISTS payroll_periods_facility_idx ON public.payroll_periods(facility_id);
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.payroll_periods TO service_role;
DROP TRIGGER IF EXISTS payroll_periods_inherit_facility ON public.payroll_periods;
CREATE TRIGGER payroll_periods_inherit_facility BEFORE INSERT OR UPDATE ON public.payroll_periods
 FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP POLICY IF EXISTS payroll_periods_facility_fence ON public.payroll_periods;
CREATE POLICY payroll_periods_facility_fence ON public.payroll_periods AS RESTRICTIVE FOR ALL TO authenticated
 USING (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id))
 WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_facility_id(facility_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_periods TO authenticated;
-- Keep broader old attendance policies from granting ordinary staff team access.
DROP POLICY IF EXISTS attendance_privacy_fence ON public.attendance;
CREATE POLICY attendance_privacy_fence ON public.attendance AS RESTRICTIVE FOR SELECT TO authenticated
 USING (user_id=auth.uid() OR public.is_hr_staff() OR public.has_role(auth.uid(),'dept_manager'));
-- Draft payslips must remain private even where an older ALL policy permits SELECT.
DROP POLICY IF EXISTS payslips_privacy_fence ON public.payslips;
CREATE POLICY payslips_privacy_fence ON public.payslips AS RESTRICTIVE FOR SELECT TO authenticated
 USING (public.is_hr_staff() OR (employee_id=auth.uid() AND published));
-- Child rows inherit the parent's fence; no duplicate facility column is needed.
DROP POLICY IF EXISTS assignments_facility_fence ON public.shift_assignments;
CREATE POLICY assignments_facility_fence ON public.shift_assignments AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.shifts s WHERE s.id=shift_id AND (public.has_role(auth.uid(),'admin') OR public.has_facility_id(s.facility_id))))
 WITH CHECK (EXISTS(SELECT 1 FROM public.shifts s JOIN public.employees e ON e.id=user_id AND e.facility_id=s.facility_id WHERE s.id=shift_id AND (public.has_role(auth.uid(),'admin') OR public.has_facility_id(s.facility_id))));
DROP POLICY IF EXISTS leave_balances_facility_fence ON public.leave_balances;
CREATE POLICY leave_balances_facility_fence ON public.leave_balances AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND (public.has_role(auth.uid(),'admin') OR public.has_facility_id(e.facility_id))))
 WITH CHECK (EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND (public.has_role(auth.uid(),'admin') OR public.has_facility_id(e.facility_id))));
DROP POLICY IF EXISTS payslip_lines_facility_fence ON public.payslip_lines;
CREATE POLICY payslip_lines_facility_fence ON public.payslip_lines AS RESTRICTIVE FOR ALL TO authenticated
 USING (EXISTS(SELECT 1 FROM public.payslips p WHERE p.id=payslip_id))
 WITH CHECK (EXISTS(SELECT 1 FROM public.payslips p WHERE p.id=payslip_id));
-- Deployment review: branch membership functions must use locked search_path,
-- grants must match current role policies, and policies must be tested with two
-- branch users via direct API requests (not only the UI). Branch-specific HR
-- departments and onboarding RPC changes remain a separate prerequisite review.

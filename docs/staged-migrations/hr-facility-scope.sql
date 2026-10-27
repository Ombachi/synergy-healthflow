-- Staged: facility isolation for HR tables (apply when the database is reachable).
-- Adds facility_id to employees, attendance, shifts, leave_requests, payslips;
-- backfills every existing row into the default MAIN facility; then tightens RLS
-- so a branch only sees its own HR records. Platform admins keep cross-branch read.
--
-- Depends on: public.facilities, public.user_facilities, public.has_facility_id(uuid),
-- public.main_facility_id() (migration facilities_modules_telematics).

-- 1) Columns (nullable first, backfill, then NOT NULL via default-only contract:
--    we keep them nullable but always set by app/RPC; making them NOT NULL is a
--    later migration once every writer sets facility_id).
ALTER TABLE public.employees      ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.attendance     ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.shifts         ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);
ALTER TABLE public.payslips       ADD COLUMN IF NOT EXISTS facility_id uuid REFERENCES public.facilities(id);

-- 2) Backfill: rows without a facility join the default MAIN facility.
UPDATE public.employees      SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.attendance     SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.shifts         SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.leave_requests SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.payslips       SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;

-- 3) Indexes for the branch-scoped list queries.
CREATE INDEX IF NOT EXISTS employees_facility_idx      ON public.employees (facility_id);
CREATE INDEX IF NOT EXISTS attendance_facility_idx     ON public.attendance (facility_id);
CREATE INDEX IF NOT EXISTS shifts_facility_idx         ON public.shifts (facility_id);
CREATE INDEX IF NOT EXISTS leave_requests_facility_idx ON public.leave_requests (facility_id);
CREATE INDEX IF NOT EXISTS payslips_facility_idx       ON public.payslips (facility_id);

-- 4) Keep child rows aligned with their employee's branch: a trigger copies
--    employees.facility_id onto attendance/shifts/leave_requests/payslips when
--    the writer did not set it, so HR screens cannot accidentally file a record
--    under the wrong branch.
CREATE OR REPLACE FUNCTION public.hr_inherit_facility() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.facility_id IS NULL AND NEW.employee_id IS NOT NULL THEN
    SELECT facility_id INTO NEW.facility_id FROM public.employees WHERE id = NEW.employee_id;
  END IF;
  IF NEW.facility_id IS NULL THEN
    NEW.facility_id := public.main_facility_id();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_inherit_facility ON public.attendance;
CREATE TRIGGER attendance_inherit_facility BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP TRIGGER IF EXISTS shifts_inherit_facility ON public.shifts;
CREATE TRIGGER shifts_inherit_facility BEFORE INSERT OR UPDATE ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP TRIGGER IF EXISTS leave_requests_inherit_facility ON public.leave_requests;
CREATE TRIGGER leave_requests_inherit_facility BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();
DROP TRIGGER IF EXISTS payslips_inherit_facility ON public.payslips;
CREATE TRIGGER payslips_inherit_facility BEFORE INSERT OR UPDATE ON public.payslips
  FOR EACH ROW EXECUTE FUNCTION public.hr_inherit_facility();

-- 5) RLS: replace permissive policies with branch-scoped ones.
--    Staff always read their OWN row regardless of branch (self-service pages).
--    Branch HR/managers read their branch's rows; platform admins read all.
--    Policy names use DROP IF EXISTS so re-running is safe; adjust names to match
--    the live policies before applying if they differ.

-- employees
DROP POLICY IF EXISTS "employees_select_facility" ON public.employees;
CREATE POLICY "employees_select_facility" ON public.employees FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_facility_id(facility_id));

-- attendance
DROP POLICY IF EXISTS "attendance_select_facility" ON public.attendance;
CREATE POLICY "attendance_select_facility" ON public.attendance FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_facility_id(facility_id));
DROP POLICY IF EXISTS "attendance_insert_own" ON public.attendance;
CREATE POLICY "attendance_insert_own" ON public.attendance FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.has_facility_id(facility_id));

-- shifts
DROP POLICY IF EXISTS "shifts_select_facility" ON public.shifts;
CREATE POLICY "shifts_select_facility" ON public.shifts FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_facility_id(facility_id));

-- leave_requests
DROP POLICY IF EXISTS "leave_requests_select_facility" ON public.leave_requests;
CREATE POLICY "leave_requests_select_facility" ON public.leave_requests FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_facility_id(facility_id));

-- payslips
DROP POLICY IF EXISTS "payslips_select_facility" ON public.payslips;
CREATE POLICY "payslips_select_facility" ON public.payslips FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_facility_id(facility_id));

-- Isolated PostgreSQL test fixture only; never run against application data.
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.user_id', true), '')::uuid;
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE TYPE public.app_role AS ENUM (
  'superadmin', 'facility_admin', 'admin', 'patient', 'athlete', 'doctor', 'nurse',
  'lab_tech', 'pharmacist', 'radiologist', 'receptionist', 'cashier', 'billing_officer',
  'insurance_officer', 'physio', 'nutritionist', 'store_keeper', 'procurement',
  'hr_officer', 'hr_manager', 'dept_manager', 'admissions_officer', 'fleet_manager', 'driver'
);
CREATE TABLE public.facilities (id uuid PRIMARY KEY, is_active boolean NOT NULL);
CREATE TABLE public.user_facilities (
  user_id uuid NOT NULL, facility_id uuid NOT NULL REFERENCES public.facilities(id),
  role public.app_role, PRIMARY KEY(user_id, facility_id)
);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, full_name text);
INSERT INTO public.facilities VALUES
  ('00000000-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000000002', true);
INSERT INTO public.user_facilities VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'facility_admin'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'nurse'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'lab_tech');
INSERT INTO public.profiles VALUES
  ('10000000-0000-0000-0000-000000000001', 'Branch administrator'),
  ('10000000-0000-0000-0000-000000000002', 'Departmental staff');
\ir ../../docs/staged-migrations/facility-staff-role-assignment.sql
-- Verify the migration can be run twice without signature/policy conflicts.
\ir ../../docs/staged-migrations/facility-staff-role-assignment.sql
SET ROLE authenticated;
SELECT set_config('test.user_id', '10000000-0000-0000-0000-000000000001', false);
SELECT public.set_facility_department_role('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'doctor');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_facilities) <> 2 THEN RAISE EXCEPTION 'Branch isolation failed'; END IF;
  IF (SELECT role FROM public.user_facilities WHERE user_id = '10000000-0000-0000-0000-000000000002') <> 'doctor' THEN RAISE EXCEPTION 'Role readback failed'; END IF;
  IF (SELECT count(*) FROM public.profiles) <> 2 THEN RAISE EXCEPTION 'Staff names not readable'; END IF;
  BEGIN
    PERFORM public.set_facility_department_role('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'doctor');
    RAISE EXCEPTION 'Cross-branch mutation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.set_facility_department_role('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'superadmin');
    RAISE EXCEPTION 'Administrative escalation allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.set_facility_department_role('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'doctor');
    RAISE EXCEPTION 'Protected administrator changed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('test.user_id', '10000000-0000-0000-0000-000000000002', false);
DO $$ BEGIN
  BEGIN
    PERFORM public.set_facility_department_role('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'nurse');
    RAISE EXCEPTION 'Staff self-promotion allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT role FROM public.user_facilities WHERE facility_id = '00000000-0000-0000-0000-000000000002') <> 'lab_tech' THEN RAISE EXCEPTION 'Other branch changed'; END IF;
END $$;
SELECT 'Facility staff SQL permissions passed' AS result;
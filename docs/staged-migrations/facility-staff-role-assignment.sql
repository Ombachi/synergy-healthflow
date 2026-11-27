-- Run in the external database used by this app. No global roles are changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_facility_department_role(
  _facility_id uuid, _user_id uuid, _role text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  caller_role text;
  target_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF _role IS NULL OR _role NOT IN (
    'doctor', 'nurse', 'lab_tech', 'pharmacist', 'radiologist', 'receptionist',
    'cashier', 'billing_officer', 'insurance_officer', 'physio', 'nutritionist',
    'store_keeper', 'procurement', 'hr_officer', 'hr_manager', 'dept_manager',
    'admissions_officer', 'fleet_manager', 'driver'
  ) THEN RAISE EXCEPTION 'Departmental role required' USING ERRCODE = '42501'; END IF;

  -- Lock the memberships in stable order, including the authorizing row.
  PERFORM 1 FROM public.user_facilities
    WHERE facility_id = _facility_id AND user_id IN (auth.uid(), _user_id)
    ORDER BY user_id FOR UPDATE;
  SELECT role::text INTO caller_role FROM public.user_facilities
    WHERE facility_id = _facility_id AND user_id = auth.uid();
  IF caller_role IS DISTINCT FROM 'facility_admin' THEN
    RAISE EXCEPTION 'Facility administrator access required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.facilities WHERE id = _facility_id AND is_active) THEN
    RAISE EXCEPTION 'Active facility required' USING ERRCODE = '42501';
  END IF;
  SELECT role::text INTO target_role FROM public.user_facilities
    WHERE facility_id = _facility_id AND user_id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff member not assigned to this facility' USING ERRCODE = '42501'; END IF;
  IF target_role IN ('superadmin', 'facility_admin', 'admin', 'patient', 'athlete') THEN
    RAISE EXCEPTION 'Protected account assignment cannot be changed here' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_facilities SET role = _role::public.app_role
    WHERE facility_id = _facility_id AND user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.set_facility_department_role(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_facility_department_role(uuid, uuid, text) TO authenticated;

-- Name reads remain scoped to staff in a branch administered by the caller.
CREATE OR REPLACE FUNCTION public.can_read_facility_staff_profile(_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_facilities caller
    JOIN public.user_facilities target ON target.facility_id = caller.facility_id
    JOIN public.facilities f ON f.id = caller.facility_id AND f.is_active
    WHERE caller.user_id = auth.uid() AND caller.role::text = 'facility_admin'
      AND target.user_id = _profile_id
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_facility_staff_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_facility_staff_profile(uuid) TO authenticated;
GRANT SELECT ON public.profiles, public.user_facilities TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facility_staff_names ON public.profiles;
CREATE POLICY facility_staff_names ON public.profiles FOR SELECT TO authenticated
  USING (public.can_read_facility_staff_profile(id));

-- No policies query user_facilities from its own RLS expression.
CREATE OR REPLACE FUNCTION public.can_administer_facility_staff(_facility_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_facilities uf
    JOIN public.facilities f ON f.id = uf.facility_id AND f.is_active
    WHERE uf.facility_id = _facility_id AND uf.user_id = auth.uid()
      AND uf.role::text = 'facility_admin'
  );
$$;
REVOKE ALL ON FUNCTION public.can_administer_facility_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_administer_facility_staff(uuid) TO authenticated;
ALTER TABLE public.user_facilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS facility_staff_roster ON public.user_facilities;
CREATE POLICY facility_staff_roster ON public.user_facilities FOR SELECT TO authenticated
  USING (public.can_administer_facility_staff(facility_id));
NOTIFY pgrst, 'reload schema';
COMMIT;
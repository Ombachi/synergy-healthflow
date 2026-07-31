CREATE OR REPLACE FUNCTION public.staff_patient_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id
  FROM public.patients p
  JOIN public.user_roles r ON r.user_id = p.user_id
  WHERE r.role NOT IN ('patient','athlete')
$$;

GRANT EXECUTE ON FUNCTION public.staff_patient_ids() TO authenticated;
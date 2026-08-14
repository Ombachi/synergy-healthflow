CREATE OR REPLACE FUNCTION public.driver_owns_request(_request uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mobility_trips t
    JOIN public.mobility_drivers d ON d.id = t.driver_id
    WHERE t.request_id = _request AND d.user_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS req_driver_select ON public.mobility_requests;
CREATE POLICY req_driver_select ON public.mobility_requests
FOR SELECT TO authenticated
USING (public.driver_owns_request(id));
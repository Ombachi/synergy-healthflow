CREATE POLICY req_driver_select ON public.mobility_requests
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.mobility_trips t
  JOIN public.mobility_drivers d ON d.id = t.driver_id
  WHERE t.request_id = mobility_requests.id AND d.user_id = auth.uid()
));
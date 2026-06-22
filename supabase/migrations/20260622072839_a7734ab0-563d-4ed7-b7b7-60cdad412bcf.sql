
DROP POLICY IF EXISTS "System inserts notifications" ON public.notifications;

CREATE POLICY "service_role_inserts_notifications"
ON public.notifications FOR INSERT
TO service_role
WITH CHECK (true);

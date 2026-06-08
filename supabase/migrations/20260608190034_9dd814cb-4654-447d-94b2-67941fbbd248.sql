
CREATE POLICY "Bootstrap: first user claims role" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
  );

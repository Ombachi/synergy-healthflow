DROP POLICY IF EXISTS "Clinical tasks: staff insert" ON public.clinical_tasks;
CREATE POLICY "Clinical tasks: staff insert" ON public.clinical_tasks
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role NOT IN ('patient'::app_role, 'athlete'::app_role)
  )
);
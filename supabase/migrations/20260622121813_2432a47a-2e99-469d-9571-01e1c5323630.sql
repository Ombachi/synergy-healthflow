DROP POLICY IF EXISTS visits_select ON public.visits;
CREATE POLICY visits_select ON public.visits
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'doctor')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'receptionist')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = visits.patient_id AND p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Assigned clinicians read visits" ON public.visits;
CREATE POLICY "Assigned clinicians read visits" ON public.visits
FOR SELECT TO authenticated
USING (
  assigned_doctor_id = auth.uid()
  OR assigned_nurse_id = auth.uid()
  OR opened_by = auth.uid()
);

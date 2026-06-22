DROP POLICY IF EXISTS appt_staff_update ON public.appointments;
CREATE POLICY appt_staff_update ON public.appointments
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'receptionist')
  OR public.has_role(auth.uid(), 'doctor')
  OR doctor_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'nurse')
  OR public.has_role(auth.uid(), 'receptionist')
  OR ((public.has_role(auth.uid(), 'doctor') OR doctor_id = auth.uid()) AND status IS DISTINCT FROM 'checked_in')
);

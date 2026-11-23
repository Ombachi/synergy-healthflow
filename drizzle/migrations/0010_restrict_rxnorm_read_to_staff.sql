DROP POLICY IF EXISTS "rxnorm_read" ON public.rxnorm_concepts;
CREATE POLICY "rxnorm_read" ON public.rxnorm_concepts FOR SELECT TO authenticated USING (public.is_staff_member());

CREATE POLICY "hr-docs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hr-documents');
CREATE POLICY "hr-docs write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hr-documents' AND public.is_hr_staff());
CREATE POLICY "hr-docs update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'hr-documents' AND public.is_hr_staff());
CREATE POLICY "hr-docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hr-documents' AND public.is_hr_staff());

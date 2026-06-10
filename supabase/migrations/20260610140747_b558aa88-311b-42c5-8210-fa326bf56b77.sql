
-- ICD-11 catalog
CREATE TABLE public.icd11_codes (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  chapter TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.icd11_codes TO authenticated;
GRANT ALL ON public.icd11_codes TO service_role;
ALTER TABLE public.icd11_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icd_read" ON public.icd11_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "icd_admin" ON public.icd11_codes FOR ALL TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Lab tests catalog
CREATE TABLE public.lab_tests_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  specimen TEXT,
  container TEXT,
  turnaround_hours INT DEFAULT 24,
  price NUMERIC(10,2) DEFAULT 0,
  reference_range TEXT,
  units TEXT,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_tests_catalog TO authenticated;
GRANT ALL ON public.lab_tests_catalog TO service_role;
ALTER TABLE public.lab_tests_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_catalog_read" ON public.lab_tests_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "lab_catalog_write" ON public.lab_tests_catalog FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'lab_tech'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'lab_tech'));
CREATE TRIGGER trg_lab_catalog_upd BEFORE UPDATE ON public.lab_tests_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lab orders
CREATE TABLE public.lab_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES lab_tests_catalog(id),
  ordered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'routine',
  status TEXT NOT NULL DEFAULT 'ordered',
  clinical_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_orders TO authenticated;
GRANT ALL ON public.lab_orders TO service_role;
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lab_orders_read" ON public.lab_orders FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'pharmacist')
  OR EXISTS (SELECT 1 FROM patients p WHERE p.id = lab_orders.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY "lab_orders_write" ON public.lab_orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'lab_tech'))
  WITH CHECK (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'lab_tech'));
CREATE TRIGGER trg_lab_orders_upd BEFORE UPDATE ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lab samples
CREATE TABLE public.lab_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  sample_code TEXT,
  collected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  collected_at TIMESTAMPTZ DEFAULT now(),
  condition TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_samples TO authenticated;
GRANT ALL ON public.lab_samples TO service_role;
ALTER TABLE public.lab_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "samples_read" ON public.lab_samples FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'lab_tech')
);
CREATE POLICY "samples_write" ON public.lab_samples FOR ALL TO authenticated
  USING (has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin'));

-- Lab results
CREATE TABLE public.lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  result_value TEXT,
  units TEXT,
  reference_range TEXT,
  abnormal_flag TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ DEFAULT now(),
  file_path TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_results TO authenticated;
GRANT ALL ON public.lab_results TO service_role;
ALTER TABLE public.lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "results_read" ON public.lab_results FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'lab_tech')
  OR EXISTS (
    SELECT 1 FROM lab_orders lo JOIN patients p ON p.id = lo.patient_id
    WHERE lo.id = lab_results.order_id AND p.user_id = auth.uid()
  )
);
CREATE POLICY "results_write" ON public.lab_results FOR ALL TO authenticated
  USING (has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_results_upd BEFORE UPDATE ON public.lab_results FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Imaging orders
CREATE TABLE public.imaging_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  modality TEXT NOT NULL,
  body_part TEXT,
  clinical_question TEXT,
  ordered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ordered',
  priority TEXT DEFAULT 'routine',
  scheduled_at TIMESTAMPTZ,
  performed_at TIMESTAMPTZ,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  findings TEXT,
  report TEXT,
  image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imaging_orders TO authenticated;
GRANT ALL ON public.imaging_orders TO service_role;
ALTER TABLE public.imaging_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "img_read" ON public.imaging_orders FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'radiologist')
  OR EXISTS (SELECT 1 FROM patients p WHERE p.id = imaging_orders.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY "img_write" ON public.imaging_orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'radiologist'))
  WITH CHECK (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'radiologist'));
CREATE TRIGGER trg_img_upd BEFORE UPDATE ON public.imaging_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pharmacy dispenses
CREATE TABLE public.pharmacy_dispenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  inventory_item_id UUID REFERENCES inventory_items(id),
  dispensed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  quantity INT NOT NULL DEFAULT 0,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'dispensed',
  dispensed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacy_dispenses TO authenticated;
GRANT ALL ON public.pharmacy_dispenses TO service_role;
ALTER TABLE public.pharmacy_dispenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disp_read" ON public.pharmacy_dispenses FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist')
  OR EXISTS (
    SELECT 1 FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id JOIN patients p ON p.id = v.patient_id
    WHERE rx.id = pharmacy_dispenses.prescription_id AND p.user_id = auth.uid()
  )
);
CREATE POLICY "disp_write" ON public.pharmacy_dispenses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin'));

-- Inventory movements
CREATE TABLE public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  change INT NOT NULL,
  reason TEXT,
  prescription_id UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  by_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mov_read" ON public.inventory_movements FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin')
);
CREATE POLICY "mov_write" ON public.inventory_movements FOR ALL TO authenticated
  USING (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'admin'));

-- Visit stages (timer)
CREATE TABLE public.visit_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ,
  by_user UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_stages TO authenticated;
GRANT ALL ON public.visit_stages TO service_role;
ALTER TABLE public.visit_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stages_read" ON public.visit_stages FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'radiologist')
  OR EXISTS (SELECT 1 FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = visit_stages.visit_id AND p.user_id = auth.uid())
);
CREATE POLICY "stages_write" ON public.visit_stages FOR ALL TO authenticated
  USING (
    has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'radiologist')
  )
  WITH CHECK (
    has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
    OR has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'pharmacist') OR has_role(auth.uid(),'radiologist')
  );

-- Message attachments
CREATE TABLE public.message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_read" ON public.message_attachments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM messages m WHERE m.id = message_attachments.message_id AND is_thread_participant(m.thread_id, auth.uid()))
);
CREATE POLICY "att_write" ON public.message_attachments FOR INSERT TO authenticated WITH CHECK (
  uploaded_by = auth.uid()
  AND EXISTS (SELECT 1 FROM messages m WHERE m.id = message_attachments.message_id AND is_thread_participant(m.thread_id, auth.uid()))
);

-- Storage RLS for buckets
CREATE POLICY "msg_att_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'message-attachments' AND EXISTS (
    SELECT 1 FROM message_attachments ma JOIN messages m ON m.id = ma.message_id
    WHERE ma.file_path = storage.objects.name AND is_thread_participant(m.thread_id, auth.uid())
  )
);
CREATE POLICY "msg_att_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'message-attachments' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "lab_files_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'lab-files' AND (
    has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'lab_tech')
  )
);
CREATE POLICY "lab_files_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'lab-files' AND (has_role(auth.uid(),'lab_tech') OR has_role(auth.uid(),'admin'))
);
CREATE POLICY "img_files_read" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'imaging-files' AND (
    has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'radiologist')
  )
);
CREATE POLICY "img_files_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'imaging-files' AND (has_role(auth.uid(),'radiologist') OR has_role(auth.uid(),'admin'))
);

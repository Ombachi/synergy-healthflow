
-- ============ NOTIFICATIONS TABLE ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  entity_type TEXT,
  entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient_unread ON public.notifications(recipient_id, read_at, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "System inserts notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ============ VISIT ASSIGNMENTS ============
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS assigned_doctor_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS assigned_nurse_id  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS current_stage TEXT;

CREATE INDEX IF NOT EXISTS idx_visits_assigned_doc ON public.visits(assigned_doctor_id) WHERE assigned_doctor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visits_assigned_nur ON public.visits(assigned_nurse_id) WHERE assigned_nurse_id IS NOT NULL;

CREATE TABLE public.visit_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'doctor' | 'nurse'
  user_id UUID NOT NULL REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES auth.users(id),
  unassigned_at TIMESTAMPTZ
);

CREATE INDEX idx_visit_assignments_visit ON public.visit_assignments(visit_id);
CREATE INDEX idx_visit_assignments_user ON public.visit_assignments(user_id) WHERE unassigned_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_assignments TO authenticated;
GRANT ALL ON public.visit_assignments TO service_role;

ALTER TABLE public.visit_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clinical staff view assignments" ON public.visit_assignments
  FOR SELECT TO authenticated USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR
    has_role(auth.uid(),'nurse') OR user_id = auth.uid()
  );
CREATE POLICY "Clinical staff manage assignments" ON public.visit_assignments
  FOR ALL TO authenticated USING (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse')
  ) WITH CHECK (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse')
  );

-- ============ RLS: assigned clinicians always have visit access ============
CREATE POLICY "Assigned clinicians read visits" ON public.visits
  FOR SELECT TO authenticated USING (
    assigned_doctor_id = auth.uid() OR assigned_nurse_id = auth.uid()
  );
CREATE POLICY "Assigned clinicians update visits" ON public.visits
  FOR UPDATE TO authenticated USING (
    assigned_doctor_id = auth.uid() OR assigned_nurse_id = auth.uid()
  );

CREATE POLICY "Assigned clinicians read vitals" ON public.vitals
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.visits v WHERE v.id = vitals.visit_id
            AND (v.assigned_doctor_id = auth.uid() OR v.assigned_nurse_id = auth.uid()))
  );
CREATE POLICY "Assigned clinicians write vitals" ON public.vitals
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.visits v WHERE v.id = vitals.visit_id
            AND (v.assigned_doctor_id = auth.uid() OR v.assigned_nurse_id = auth.uid()))
  );

-- ============ TRIGGER FUNCTIONS ============

-- Notify all users holding a given role
CREATE OR REPLACE FUNCTION public.notify_role(_role app_role, _type TEXT, _title TEXT, _body TEXT, _link TEXT, _entity_type TEXT, _entity_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications(recipient_id, type, title, body, link, entity_type, entity_id)
  SELECT ur.user_id, _type, _title, _body, _link, _entity_type, _entity_id
  FROM user_roles ur WHERE ur.role = _role;
END $$;

-- Lab orders → lab techs
CREATE OR REPLACE FUNCTION public.notify_lab_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM notify_role('lab_tech','lab_order','New lab order',
    'A new lab investigation has been ordered.',
    '/lab','lab_order', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_lab_order AFTER INSERT ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_lab_order();

-- Imaging orders → radiologists
CREATE OR REPLACE FUNCTION public.notify_imaging_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM notify_role('radiologist','imaging_order','New imaging order',
    'A new imaging study has been ordered.',
    '/radiology','imaging_order', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_imaging_order AFTER INSERT ON public.imaging_orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_imaging_order();

-- Prescriptions → pharmacists
CREATE OR REPLACE FUNCTION public.notify_prescription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM notify_role('pharmacist','prescription','New prescription',
    'A new prescription is ready for dispensing.',
    '/pharmacy','prescription', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_prescription AFTER INSERT ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.notify_prescription();

-- Messages → thread participants (excluding sender)
CREATE OR REPLACE FUNCTION public.notify_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_subject TEXT;
BEGIN
  SELECT subject INTO v_subject FROM message_threads WHERE id = NEW.thread_id;
  INSERT INTO notifications(recipient_id, type, title, body, link, entity_type, entity_id)
  SELECT tp.user_id, 'message', COALESCE(v_subject,'New message'),
         LEFT(NEW.body, 140), '/messages','message', NEW.id
  FROM thread_participants tp
  WHERE tp.thread_id = NEW.thread_id AND tp.user_id <> NEW.sender_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_message();

-- Visit stage changes → assigned doctor + nurse, and update visits.current_stage
CREATE OR REPLACE FUNCTION public.notify_visit_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc UUID; v_nur UUID;
BEGIN
  UPDATE visits SET current_stage = NEW.stage WHERE id = NEW.visit_id;
  SELECT assigned_doctor_id, assigned_nurse_id INTO v_doc, v_nur FROM visits WHERE id = NEW.visit_id;
  IF v_doc IS NOT NULL THEN
    INSERT INTO notifications(recipient_id,type,title,body,link,entity_type,entity_id)
    VALUES (v_doc,'visit_stage','Visit moved to '||NEW.stage,'Patient handed off to '||NEW.stage,
            '/visits/'||NEW.visit_id,'visit',NEW.visit_id);
  END IF;
  IF v_nur IS NOT NULL AND v_nur <> COALESCE(v_doc,'00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO notifications(recipient_id,type,title,body,link,entity_type,entity_id)
    VALUES (v_nur,'visit_stage','Visit moved to '||NEW.stage,'Patient handed off to '||NEW.stage,
            '/visits/'||NEW.visit_id,'visit',NEW.visit_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_visit_stage AFTER INSERT ON public.visit_stages
  FOR EACH ROW EXECUTE FUNCTION public.notify_visit_stage();

-- Out-of-range vitals → assigned doctor
CREATE OR REPLACE FUNCTION public.notify_abnormal_vitals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc UUID; v_abn TEXT := '';
BEGIN
  SELECT assigned_doctor_id INTO v_doc FROM visits WHERE id = NEW.visit_id;
  IF v_doc IS NULL THEN RETURN NEW; END IF;
  IF NEW.heart_rate IS NOT NULL AND (NEW.heart_rate < 50 OR NEW.heart_rate > 120) THEN v_abn := v_abn||'HR '||NEW.heart_rate||' '; END IF;
  IF NEW.systolic_bp IS NOT NULL AND (NEW.systolic_bp < 90 OR NEW.systolic_bp > 160) THEN v_abn := v_abn||'SBP '||NEW.systolic_bp||' '; END IF;
  IF NEW.diastolic_bp IS NOT NULL AND (NEW.diastolic_bp < 60 OR NEW.diastolic_bp > 100) THEN v_abn := v_abn||'DBP '||NEW.diastolic_bp||' '; END IF;
  IF NEW.spo2 IS NOT NULL AND NEW.spo2 < 92 THEN v_abn := v_abn||'SpO2 '||NEW.spo2||'% '; END IF;
  IF NEW.temperature_c IS NOT NULL AND (NEW.temperature_c < 35 OR NEW.temperature_c > 38.5) THEN v_abn := v_abn||'Temp '||NEW.temperature_c||'C '; END IF;
  IF NEW.respiratory_rate IS NOT NULL AND (NEW.respiratory_rate < 10 OR NEW.respiratory_rate > 24) THEN v_abn := v_abn||'RR '||NEW.respiratory_rate||' '; END IF;
  IF length(v_abn) > 0 THEN
    INSERT INTO notifications(recipient_id,type,title,body,link,entity_type,entity_id)
    VALUES (v_doc,'abnormal_vitals','Abnormal vitals recorded', trim(v_abn),
            '/visits/'||NEW.visit_id,'vitals',NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_abnormal_vitals AFTER INSERT ON public.vitals
  FOR EACH ROW EXECUTE FUNCTION public.notify_abnormal_vitals();

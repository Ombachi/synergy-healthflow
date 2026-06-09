
-- ============ AUDIT LOG ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users ON DELETE SET NULL,
  visit_id UUID,
  patient_id UUID,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_visit ON public.audit_logs(visit_id);
CREATE INDEX idx_audit_patient ON public.audit_logs(patient_id);
CREATE INDEX idx_audit_entity ON public.audit_logs(entity_type, entity_id);

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_select_clinical" ON public.audit_logs FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
  OR (patient_id IS NOT NULL AND EXISTS (SELECT 1 FROM patients p WHERE p.id = audit_logs.patient_id AND p.user_id = auth.uid()))
);
CREATE POLICY "audit_insert_self" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

-- Trigger function: log inserts/updates on key clinical tables
CREATE OR REPLACE FUNCTION public.log_clinical_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_visit UUID;
  v_patient UUID;
  v_action TEXT;
  v_changes JSONB;
BEGIN
  v_action := lower(TG_OP);
  IF TG_TABLE_NAME = 'visits' THEN
    v_visit := NEW.id; v_patient := NEW.patient_id;
  ELSIF TG_TABLE_NAME = 'vitals' THEN
    v_visit := NEW.visit_id; v_patient := NEW.patient_id;
  ELSIF TG_TABLE_NAME = 'prescriptions' OR TG_TABLE_NAME = 'visit_diagnoses' OR TG_TABLE_NAME = 'discharge_summaries' THEN
    v_visit := NEW.visit_id;
    SELECT patient_id INTO v_patient FROM visits WHERE id = NEW.visit_id;
  ELSIF TG_TABLE_NAME = 'patients' THEN
    v_patient := NEW.id;
  ELSIF TG_TABLE_NAME = 'intake_forms' OR TG_TABLE_NAME = 'consents' THEN
    v_patient := NEW.patient_id;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_changes := jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW));
  ELSE
    v_changes := to_jsonb(NEW);
  END IF;
  INSERT INTO audit_logs(entity_type, entity_id, action, actor_id, visit_id, patient_id, changes)
  VALUES (TG_TABLE_NAME, NEW.id, v_action, auth.uid(), v_visit, v_patient, v_changes);
  RETURN NEW;
END $$;

-- ============ DIAGNOSES ============
CREATE TABLE public.visit_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  diagnosis TEXT NOT NULL,
  icd_code TEXT,
  notes TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_diagnoses TO authenticated;
GRANT ALL ON public.visit_diagnoses TO service_role;
ALTER TABLE public.visit_diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "diag_select" ON public.visit_diagnoses FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = visit_diagnoses.visit_id AND p.user_id = auth.uid())
);
CREATE POLICY "diag_write" ON public.visit_diagnoses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_diag_updated BEFORE UPDATE ON public.visit_diagnoses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_diag_audit AFTER INSERT OR UPDATE ON public.visit_diagnoses FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

-- ============ PRESCRIPTIONS ============
CREATE TABLE public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  medication TEXT NOT NULL,
  dose TEXT,
  frequency TEXT,
  duration TEXT,
  instructions TEXT,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescriptions TO authenticated;
GRANT ALL ON public.prescriptions TO service_role;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rx_select" ON public.prescriptions FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = prescriptions.visit_id AND p.user_id = auth.uid())
);
CREATE POLICY "rx_write" ON public.prescriptions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_rx_updated BEFORE UPDATE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_rx_audit AFTER INSERT OR UPDATE ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

-- ============ DISCHARGE SUMMARIES ============
CREATE TABLE public.discharge_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  treatment_plan TEXT,
  follow_up TEXT,
  finalized BOOLEAN NOT NULL DEFAULT false,
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discharge_summaries TO authenticated;
GRANT ALL ON public.discharge_summaries TO service_role;
ALTER TABLE public.discharge_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dis_select" ON public.discharge_summaries FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM visits v JOIN patients p ON p.id = v.patient_id WHERE v.id = discharge_summaries.visit_id AND p.user_id = auth.uid())
);
CREATE POLICY "dis_write" ON public.discharge_summaries FOR ALL TO authenticated
  USING (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_dis_updated BEFORE UPDATE ON public.discharge_summaries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_dis_audit AFTER INSERT OR UPDATE ON public.discharge_summaries FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

-- Add audit triggers for existing tables
CREATE TRIGGER trg_visits_audit AFTER INSERT OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION log_clinical_change();
CREATE TRIGGER trg_vitals_audit AFTER INSERT OR UPDATE ON public.vitals FOR EACH ROW EXECUTE FUNCTION log_clinical_change();
CREATE TRIGGER trg_patients_audit AFTER INSERT OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

-- ============ CONSENTS ============
CREATE TABLE public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  document_version TEXT NOT NULL DEFAULT 'v1',
  accepted BOOLEAN NOT NULL DEFAULT false,
  accepted_at TIMESTAMPTZ,
  signed_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consents TO authenticated;
GRANT ALL ON public.consents TO service_role;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consent_select" ON public.consents FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM patients p WHERE p.id = consents.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY "consent_write_self" ON public.consents FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM patients p WHERE p.id = consents.patient_id AND p.user_id = auth.uid())
  OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin')
);
CREATE POLICY "consent_update_self" ON public.consents FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM patients p WHERE p.id = consents.patient_id AND p.user_id = auth.uid())
  OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin')
);
CREATE TRIGGER trg_consent_updated BEFORE UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_consent_audit AFTER INSERT OR UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

-- ============ INTAKE FORMS ============
CREATE TABLE public.intake_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES visits(id) ON DELETE SET NULL,
  allergies TEXT,
  conditions TEXT,
  current_medications TEXT,
  reason_for_visit TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_forms TO authenticated;
GRANT ALL ON public.intake_forms TO service_role;
ALTER TABLE public.intake_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intake_select" ON public.intake_forms FOR SELECT TO authenticated USING (
  has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM patients p WHERE p.id = intake_forms.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY "intake_insert" ON public.intake_forms FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM patients p WHERE p.id = intake_forms.patient_id AND p.user_id = auth.uid())
  OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin')
);
CREATE TRIGGER trg_intake_updated BEFORE UPDATE ON public.intake_forms FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_intake_audit AFTER INSERT OR UPDATE ON public.intake_forms FOR EACH ROW EXECUTE FUNCTION log_clinical_change();

-- ============ MESSAGING ============
CREATE TABLE public.message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.thread_participants (
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (thread_id, user_id)
);
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_thread ON public.messages(thread_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.thread_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.message_threads, public.thread_participants, public.messages TO service_role;
ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_thread_participant(_thread UUID, _user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM thread_participants WHERE thread_id = _thread AND user_id = _user)
$$;

CREATE POLICY "thread_select" ON public.message_threads FOR SELECT TO authenticated USING (
  is_thread_participant(id, auth.uid()) OR created_by = auth.uid()
);
CREATE POLICY "thread_insert" ON public.message_threads FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "thread_update" ON public.message_threads FOR UPDATE TO authenticated USING (created_by = auth.uid());

CREATE POLICY "tp_select" ON public.thread_participants FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR is_thread_participant(thread_id, auth.uid())
);
CREATE POLICY "tp_insert" ON public.thread_participants FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM message_threads t WHERE t.id = thread_id AND t.created_by = auth.uid())
  OR user_id = auth.uid()
);
CREATE POLICY "tp_update_self" ON public.thread_participants FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tp_delete" ON public.thread_participants FOR DELETE TO authenticated USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM message_threads t WHERE t.id = thread_id AND t.created_by = auth.uid())
);

CREATE POLICY "msg_select" ON public.messages FOR SELECT TO authenticated USING (is_thread_participant(thread_id, auth.uid()));
CREATE POLICY "msg_insert" ON public.messages FOR INSERT TO authenticated WITH CHECK (
  sender_id = auth.uid() AND is_thread_participant(thread_id, auth.uid())
);

CREATE TRIGGER trg_thread_updated BEFORE UPDATE ON public.message_threads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- bump thread updated_at when a new message arrives
CREATE OR REPLACE FUNCTION public.touch_thread()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE message_threads SET updated_at = now() WHERE id = NEW.thread_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_msg_touch AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION touch_thread();

-- Helper view: profiles directory for messaging participant pickers (read-only of names)
CREATE OR REPLACE FUNCTION public.list_messageable_users()
RETURNS TABLE(id UUID, full_name TEXT, role app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.full_name, ur.role
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id
  WHERE p.id <> auth.uid()
$$;
GRANT EXECUTE ON FUNCTION public.list_messageable_users() TO authenticated;

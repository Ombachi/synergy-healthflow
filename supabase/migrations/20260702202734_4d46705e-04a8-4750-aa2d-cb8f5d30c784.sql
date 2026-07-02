
-- =====================================================================
-- TURN 2: Compliance & Audit
-- =====================================================================

-- ---------- 1. SOFT-DELETE for patients & visits ---------------------
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_patients_not_deleted ON public.patients(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_visits_not_deleted ON public.visits(id) WHERE deleted_at IS NULL;

-- Soft-delete RPCs (admin-only) log to audit_logs automatically via trigger,
-- but we also insert an explicit "delete" entry so the timeline is unambiguous.
CREATE OR REPLACE FUNCTION public.soft_delete_patient(_patient UUID, _reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admin can soft-delete patients';
  END IF;
  UPDATE public.patients
     SET deleted_at = now(), deleted_by = auth.uid(), deletion_reason = _reason
   WHERE id = _patient;
  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, patient_id, changes)
  VALUES ('patients', _patient, 'soft_delete', auth.uid(), _patient,
          jsonb_build_object('reason', _reason, 'at', now()));
END $$;

CREATE OR REPLACE FUNCTION public.restore_patient(_patient UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admin can restore patients';
  END IF;
  UPDATE public.patients
     SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL
   WHERE id = _patient;
  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, patient_id, changes)
  VALUES ('patients', _patient, 'restore', auth.uid(), _patient, jsonb_build_object('at', now()));
END $$;

CREATE OR REPLACE FUNCTION public.soft_delete_visit(_visit UUID, _reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pat UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admin can soft-delete visits';
  END IF;
  SELECT patient_id INTO v_pat FROM public.visits WHERE id = _visit;
  UPDATE public.visits
     SET deleted_at = now(), deleted_by = auth.uid(), deletion_reason = _reason
   WHERE id = _visit;
  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, visit_id, patient_id, changes)
  VALUES ('visits', _visit, 'soft_delete', auth.uid(), _visit, v_pat,
          jsonb_build_object('reason', _reason, 'at', now()));
END $$;

CREATE OR REPLACE FUNCTION public.restore_visit(_visit UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pat UUID;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admin can restore visits';
  END IF;
  SELECT patient_id INTO v_pat FROM public.visits WHERE id = _visit;
  UPDATE public.visits
     SET deleted_at = NULL, deleted_by = NULL, deletion_reason = NULL
   WHERE id = _visit;
  INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, visit_id, patient_id, changes)
  VALUES ('visits', _visit, 'restore', auth.uid(), _visit, v_pat, jsonb_build_object('at', now()));
END $$;

-- ---------- 2. CONSENT VERSIONING ------------------------------------
CREATE TABLE IF NOT EXISTS public.consent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,             -- e.g. 'general_treatment', 'data_sharing'
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE (code, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consent_templates TO authenticated;
GRANT ALL ON public.consent_templates TO service_role;
ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consent_templates read" ON public.consent_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "consent_templates admin write" ON public.consent_templates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.consent_templates(id),
  template_code TEXT NOT NULL,
  template_version INT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('granted','withdrawn','superseded')),
  actor_id UUID REFERENCES auth.users(id),
  signature_hash TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.consent_events TO authenticated;
GRANT ALL ON public.consent_events TO service_role;
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "consent_events staff read" ON public.consent_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'doctor')
      OR public.has_role(auth.uid(),'nurse')
      OR public.has_role(auth.uid(),'receptionist')
      OR EXISTS(SELECT 1 FROM public.patients p WHERE p.id = consent_events.patient_id AND p.user_id = auth.uid()));
CREATE POLICY "consent_events staff insert" ON public.consent_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'doctor')
      OR public.has_role(auth.uid(),'nurse')
      OR public.has_role(auth.uid(),'receptionist'));

CREATE INDEX IF NOT EXISTS idx_consent_events_patient ON public.consent_events(patient_id, created_at DESC);

-- Effective consent view: latest event per (patient, code)
CREATE OR REPLACE VIEW public.v_effective_consent AS
SELECT DISTINCT ON (patient_id, template_code)
  patient_id, template_code, template_version, action, created_at, actor_id
FROM public.consent_events
ORDER BY patient_id, template_code, created_at DESC;

GRANT SELECT ON public.v_effective_consent TO authenticated;

-- Seed a couple of baseline templates
INSERT INTO public.consent_templates (code, title, body, version)
VALUES
  ('general_treatment','General Treatment Consent','I consent to receive medical evaluation and treatment at this facility.',1),
  ('data_sharing','Data Sharing Consent','I consent to sharing my health data with other providers involved in my care.',1),
  ('research','Research Participation','I consent to anonymized use of my data for approved research.',1)
ON CONFLICT DO NOTHING;

-- ---------- 3. BREACH NOTIFICATIONS ----------------------------------
CREATE TABLE IF NOT EXISTS public.breach_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','assessing','notifying','closed')),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  affected_patient_count INT DEFAULT 0,
  notified_at TIMESTAMPTZ,
  notification_channel TEXT,
  dpa_reference TEXT,
  root_cause TEXT,
  remediation TEXT,
  closed_at TIMESTAMPTZ,
  reported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.breach_incidents TO authenticated;
GRANT ALL ON public.breach_incidents TO service_role;
ALTER TABLE public.breach_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "breach_incidents admin all" ON public.breach_incidents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.breach_incident_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.breach_incidents(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL,      -- created / status_change / note / notification_sent / closed
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.breach_incident_events TO authenticated;
GRANT ALL ON public.breach_incident_events TO service_role;
ALTER TABLE public.breach_incident_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "breach_events admin" ON public.breach_incident_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.tg_breach_status_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.breach_incident_events(incident_id, actor_id, event_type, to_status, note)
    VALUES (NEW.id, auth.uid(), 'created', NEW.status, 'Incident logged');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.breach_incident_events(incident_id, actor_id, event_type, from_status, to_status)
    VALUES (NEW.id, auth.uid(), 'status_change', OLD.status, NEW.status);
    IF NEW.status = 'closed' THEN
      NEW.closed_at := now();
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_breach_status_audit ON public.breach_incidents;
CREATE TRIGGER trg_breach_status_audit
  BEFORE INSERT OR UPDATE ON public.breach_incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_breach_status_audit();

-- ---------- 4. QUARTERLY USER ACCESS REVIEWS -------------------------
CREATE TABLE IF NOT EXISTS public.access_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label TEXT NOT NULL,           -- e.g. 'Q3 2026'
  quarter INT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed')),
  opened_by UUID REFERENCES auth.users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  UNIQUE (year, quarter)
);
GRANT SELECT, INSERT, UPDATE ON public.access_reviews TO authenticated;
GRANT ALL ON public.access_reviews TO service_role;
ALTER TABLE public.access_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_reviews admin" ON public.access_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.access_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.access_reviews(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','keep','revoke')),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (review_id, user_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_review_items TO authenticated;
GRANT ALL ON public.access_review_items TO service_role;
ALTER TABLE public.access_review_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access_review_items admin" ON public.access_review_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Snapshot every current user_roles row into the review
CREATE OR REPLACE FUNCTION public.open_access_review(_quarter INT, _year INT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID; v_label TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admin can open access reviews';
  END IF;
  v_label := 'Q'||_quarter||' '||_year;
  INSERT INTO public.access_reviews(period_label, quarter, year, opened_by)
  VALUES (v_label, _quarter, _year, auth.uid())
  ON CONFLICT (year, quarter) DO UPDATE SET status = 'open'
  RETURNING id INTO v_id;

  INSERT INTO public.access_review_items(review_id, user_id, role)
  SELECT v_id, ur.user_id, ur.role FROM public.user_roles ur
  ON CONFLICT DO NOTHING;
  RETURN v_id;
END $$;

-- Apply revocations at completion time
CREATE OR REPLACE FUNCTION public.complete_access_review(_review UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admin can complete access reviews';
  END IF;
  DELETE FROM public.user_roles ur
   USING public.access_review_items ari
  WHERE ari.review_id = _review
    AND ari.decision = 'revoke'
    AND ur.user_id = ari.user_id
    AND ur.role = ari.role;

  UPDATE public.access_reviews
     SET status = 'completed', completed_at = now(), completed_by = auth.uid()
   WHERE id = _review;
END $$;

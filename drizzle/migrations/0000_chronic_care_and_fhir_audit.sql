-- Chronic care medication register
CREATE TABLE IF NOT EXISTS public.chronic_medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id UUID,
  encounter_type TEXT,
  condition TEXT,
  medication TEXT NOT NULL,
  dose TEXT,
  route TEXT,
  frequency TEXT,
  quantity NUMERIC,
  duration_days INTEGER,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_completion DATE,
  prescriber UUID,
  status TEXT NOT NULL DEFAULT 'active',
  refill_threshold_days INTEGER NOT NULL DEFAULT 7,
  refills_allowed INTEGER NOT NULL DEFAULT 5,
  refills_used INTEGER NOT NULL DEFAULT 0,
  controlled BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chronic_medications_patient_idx ON public.chronic_medications(patient_id);
CREATE INDEX IF NOT EXISTS chronic_medications_status_idx ON public.chronic_medications(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chronic_medications TO authenticated;
GRANT ALL ON public.chronic_medications TO service_role;
ALTER TABLE public.chronic_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chronic_meds_staff_all" ON public.chronic_medications
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'pharmacist')
    OR public.has_role(auth.uid(),'physio')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'pharmacist')
    OR public.has_role(auth.uid(),'physio')
  );

CREATE POLICY "chronic_meds_own_read" ON public.chronic_medications
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.user_id = auth.uid()));

-- Refill fulfillment requests
CREATE TABLE IF NOT EXISTS public.refill_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES public.chronic_medications(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id UUID,
  medication TEXT NOT NULL,
  dose TEXT,
  frequency TEXT,
  quantity NUMERIC,
  status TEXT NOT NULL DEFAULT 'requested',
  decision TEXT,
  reason TEXT,
  requested_by UUID,
  requested_on TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  dispensed_by UUID,
  dispensed_at TIMESTAMPTZ,
  inventory_item_id UUID,
  dispensed_quantity NUMERIC,
  notes TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS refill_requests_open_unique
  ON public.refill_requests(medication_id)
  WHERE status IN ('requested','pharmacy_review','clinician_review','approved');
CREATE INDEX IF NOT EXISTS refill_requests_patient_idx ON public.refill_requests(patient_id);
CREATE INDEX IF NOT EXISTS refill_requests_status_idx ON public.refill_requests(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refill_requests TO authenticated;
GRANT ALL ON public.refill_requests TO service_role;
ALTER TABLE public.refill_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refill_requests_staff_all" ON public.refill_requests
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'pharmacist')
    OR public.has_role(auth.uid(),'physio')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'pharmacist')
    OR public.has_role(auth.uid(),'physio')
  );

CREATE POLICY "refill_requests_own_read" ON public.refill_requests
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.user_id = auth.uid()));

-- Configurable refill policies
CREATE TABLE IF NOT EXISTS public.refill_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL UNIQUE DEFAULT 'default',
  reminder_days_before INTEGER NOT NULL DEFAULT 7,
  earliest_refill_days_before INTEGER NOT NULL DEFAULT 5,
  max_refills_without_review INTEGER NOT NULL DEFAULT 3,
  controlled_requires_review BOOLEAN NOT NULL DEFAULT true,
  review_after_days INTEGER NOT NULL DEFAULT 180,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.refill_policies TO authenticated;
GRANT ALL ON public.refill_policies TO service_role;
ALTER TABLE public.refill_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "refill_policies_read" ON public.refill_policies
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "refill_policies_admin_write" ON public.refill_policies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.refill_policies (scope) VALUES ('default') ON CONFLICT (scope) DO NOTHING;

-- FHIR API access audit log
CREATE TABLE IF NOT EXISTS public.fhir_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  resource_type TEXT,
  resource_id TEXT,
  interaction TEXT,
  query TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  status_code INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fhir_access_log_created_idx ON public.fhir_access_log(created_at DESC);

GRANT SELECT ON public.fhir_access_log TO authenticated;
GRANT ALL ON public.fhir_access_log TO service_role;
ALTER TABLE public.fhir_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fhir_log_admin_read" ON public.fhir_access_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

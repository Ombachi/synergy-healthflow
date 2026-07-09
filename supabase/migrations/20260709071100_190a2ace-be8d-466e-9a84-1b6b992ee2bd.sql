
-- ============ Extend existing tables ============
ALTER TABLE public.beds
  ADD COLUMN IF NOT EXISTS bed_type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_isolation boolean NOT NULL DEFAULT false;

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS acuity text,
  ADD COLUMN IF NOT EXISTS admitting_consultant uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS isolation_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expected_discharge_date date,
  ADD COLUMN IF NOT EXISTS primary_diagnosis text;

-- ============ Admission requests (pre-bed allocation) ============
CREATE TABLE IF NOT EXISTS public.admission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id),
  requesting_consultant uuid REFERENCES auth.users(id),
  reason text NOT NULL,
  preferred_ward_id uuid REFERENCES public.wards(id),
  requested_bed_type text NOT NULL DEFAULT 'general',
  acuity text,
  isolation_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending', -- pending, allocated, cancelled
  admission_id uuid REFERENCES public.admissions(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admission_requests TO authenticated;
GRANT ALL ON public.admission_requests TO service_role;
ALTER TABLE public.admission_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_adm_req" ON public.admission_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_adm_req" ON public.admission_requests FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'receptionist') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse'));
CREATE POLICY "clin_update_adm_req" ON public.admission_requests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'receptionist') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse'));

-- ============ Ward rounds / SOAP notes ============
CREATE TABLE IF NOT EXISTS public.ward_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  round_at timestamptz NOT NULL DEFAULT now(),
  performed_by uuid REFERENCES auth.users(id),
  round_type text NOT NULL DEFAULT 'consultant', -- consultant, registrar, nurse, allied
  subjective text,
  objective text,
  assessment text,
  plan text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ward_rounds TO authenticated;
GRANT ALL ON public.ward_rounds TO service_role;
ALTER TABLE public.ward_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_rounds" ON public.ward_rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_rounds" ON public.ward_rounds FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'nurse'));
CREATE POLICY "clin_update_rounds" ON public.ward_rounds FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'nurse'));

-- ============ Warning scores (NEWS2, MEWS, GCS, Braden, Morse) ============
CREATE TABLE IF NOT EXISTS public.warning_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  scored_at timestamptz NOT NULL DEFAULT now(),
  scored_by uuid REFERENCES auth.users(id),
  scale text NOT NULL, -- news2, mews, gcs, braden, morse
  total_score numeric NOT NULL,
  risk_level text, -- low, medium, high
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_warning_scores_adm ON public.warning_scores(admission_id, scored_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warning_scores TO authenticated;
GRANT ALL ON public.warning_scores TO service_role;
ALTER TABLE public.warning_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_scores" ON public.warning_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_scores" ON public.warning_scores FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio'));

-- ============ Fluid balance ============
CREATE TABLE IF NOT EXISTS public.fluid_balance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id),
  direction text NOT NULL, -- intake, output
  route text NOT NULL, -- oral, iv, ng, urine, drain, stool, vomit, other
  volume_ml integer NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fluid_adm ON public.fluid_balance_entries(admission_id, recorded_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fluid_balance_entries TO authenticated;
GRANT ALL ON public.fluid_balance_entries TO service_role;
ALTER TABLE public.fluid_balance_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_fluid" ON public.fluid_balance_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_fluid" ON public.fluid_balance_entries FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor'));

-- ============ Care plans ============
CREATE TABLE IF NOT EXISTS public.care_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  plan_type text NOT NULL, -- nursing, nutrition, physio, ot, discharge
  title text NOT NULL,
  problem text,
  status text NOT NULL DEFAULT 'active', -- active, resolved, discontinued
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.care_plans TO authenticated;
GRANT ALL ON public.care_plans TO service_role;
ALTER TABLE public.care_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_care" ON public.care_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_care" ON public.care_plans FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'nutritionist'));
CREATE POLICY "clin_update_care" ON public.care_plans FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'nutritionist'));

CREATE TABLE IF NOT EXISTS public.care_plan_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_plan_id uuid NOT NULL REFERENCES public.care_plans(id) ON DELETE CASCADE,
  goal text NOT NULL,
  intervention text,
  target_date date,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.care_plan_goals TO authenticated;
GRANT ALL ON public.care_plan_goals TO service_role;
ALTER TABLE public.care_plan_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_goals" ON public.care_plan_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_goals" ON public.care_plan_goals FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'nutritionist'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'nutritionist'));

-- ============ Inpatient medication orders + eMAR ============
CREATE TABLE IF NOT EXISTS public.medication_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  prescribed_by uuid REFERENCES auth.users(id),
  medication text NOT NULL,
  dose text NOT NULL,
  route text NOT NULL, -- po, iv, im, sc, pr, top, neb, other
  frequency text NOT NULL, -- e.g. q6h, bd, tds, prn
  start_at timestamptz NOT NULL DEFAULT now(),
  stop_at timestamptz,
  indication text,
  status text NOT NULL DEFAULT 'active', -- active, held, discontinued, completed
  prn boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medorders_adm ON public.medication_orders(admission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medication_orders TO authenticated;
GRANT ALL ON public.medication_orders TO service_role;
ALTER TABLE public.medication_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_meds" ON public.medication_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_meds" ON public.medication_orders FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio'));
CREATE POLICY "clin_update_meds" ON public.medication_orders FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'pharmacist'));

CREATE TABLE IF NOT EXISTS public.mar_administrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_order_id uuid NOT NULL REFERENCES public.medication_orders(id) ON DELETE CASCADE,
  administered_at timestamptz NOT NULL DEFAULT now(),
  administered_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'given', -- given, held, refused, missed, self_administered
  dose_given text,
  reason_not_given text,
  witness_id uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mar_order ON public.mar_administrations(medication_order_id, administered_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mar_administrations TO authenticated;
GRANT ALL ON public.mar_administrations TO service_role;
ALTER TABLE public.mar_administrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_mar" ON public.mar_administrations FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_mar" ON public.mar_administrations FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'pharmacist'));

-- ============ Inpatient procedures ============
CREATE TABLE IF NOT EXISTS public.inpatient_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  procedure_name text NOT NULL,
  performed_by uuid REFERENCES auth.users(id),
  performed_at timestamptz,
  scheduled_at timestamptz,
  consent_obtained boolean NOT NULL DEFAULT false,
  location text,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled
  notes text,
  complications text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inpatient_procedures TO authenticated;
GRANT ALL ON public.inpatient_procedures TO service_role;
ALTER TABLE public.inpatient_procedures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_iproc" ON public.inpatient_procedures FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_iproc" ON public.inpatient_procedures FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'physio'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'physio'));

-- ============ Allied health notes ============
CREATE TABLE IF NOT EXISTS public.allied_health_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  discipline text NOT NULL, -- physio, nutrition, ot, speech, social
  session_at timestamptz NOT NULL DEFAULT now(),
  clinician_id uuid REFERENCES auth.users(id),
  assessment text,
  intervention text,
  plan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allied_health_notes TO authenticated;
GRANT ALL ON public.allied_health_notes TO service_role;
ALTER TABLE public.allied_health_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_allied" ON public.allied_health_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_allied" ON public.allied_health_notes FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'nutritionist') OR has_role(auth.uid(),'doctor'));

-- ============ Infection prevention & control ============
CREATE TABLE IF NOT EXISTS public.infection_control_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  organism text,
  precaution_type text NOT NULL, -- contact, droplet, airborne, protective, standard
  onset_date date,
  is_hospital_acquired boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.infection_control_alerts TO authenticated;
GRANT ALL ON public.infection_control_alerts TO service_role;
ALTER TABLE public.infection_control_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_ipc" ON public.infection_control_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_ipc" ON public.infection_control_alerts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse'));

-- ============ Surgery placeholder ============
CREATE TABLE IF NOT EXISTS public.surgery_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid REFERENCES public.admissions(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  procedure_name text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  theatre text,
  surgeon_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.surgery_bookings TO authenticated;
GRANT ALL ON public.surgery_bookings TO service_role;
ALTER TABLE public.surgery_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_surg" ON public.surgery_bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_surg" ON public.surgery_bookings FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse'));

-- ============ Quality events (falls, HAI, pressure injury) ============
CREATE TABLE IF NOT EXISTS public.quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_id uuid REFERENCES public.admissions(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- fall, hai, pressure_injury, medication_error, near_miss
  severity text NOT NULL DEFAULT 'minor', -- minor, moderate, major, sentinel
  occurred_at timestamptz NOT NULL DEFAULT now(),
  reported_by uuid REFERENCES auth.users(id),
  description text,
  actions_taken text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_events TO authenticated;
GRANT ALL ON public.quality_events TO service_role;
ALTER TABLE public.quality_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clin_read_qual" ON public.quality_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "clin_write_qual" ON public.quality_events FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'physio'));

-- ============ updated_at triggers ============
DO $$ BEGIN
  CREATE TRIGGER trg_adm_req_updated BEFORE UPDATE ON public.admission_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_rounds_updated BEFORE UPDATE ON public.ward_rounds
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_care_updated BEFORE UPDATE ON public.care_plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_med_updated BEFORE UPDATE ON public.medication_orders
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_iproc_updated BEFORE UPDATE ON public.inpatient_procedures
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_surg_updated BEFORE UPDATE ON public.surgery_bookings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

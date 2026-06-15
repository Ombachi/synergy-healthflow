
CREATE TABLE IF NOT EXISTS public.service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  unit_price_cents integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_catalog TO authenticated;
GRANT ALL ON public.service_catalog TO service_role;
ALTER TABLE public.service_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read catalog" ON public.service_catalog;
CREATE POLICY "auth read catalog" ON public.service_catalog FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin/cashier manage catalog" ON public.service_catalog;
CREATE POLICY "admin/cashier manage catalog" ON public.service_catalog FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'cashier'));
DROP TRIGGER IF EXISTS trg_service_catalog_updated ON public.service_catalog;
CREATE TRIGGER trg_service_catalog_updated BEFORE UPDATE ON public.service_catalog
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.service_catalog (code, name, category, unit_price_cents) VALUES
  ('CONSULT_GP', 'General consultation', 'consultation', 3000),
  ('CONSULT_SPEC', 'Specialist consultation', 'consultation', 5000),
  ('TRIAGE', 'Triage assessment', 'consultation', 500),
  ('LAB_GEN', 'Lab investigation (general)', 'lab', 500),
  ('IMG_GEN', 'Imaging study (general)', 'imaging', 2000),
  ('RX_DISPENSE', 'Pharmacy dispense', 'pharmacy', 500),
  ('PROCEDURE_MINOR', 'Minor procedure', 'procedure', 1500)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS duration_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS department text;

CREATE OR REPLACE FUNCTION public.appointment_checkin_to_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_visit uuid;
BEGIN
  IF NEW.status = 'checked_in' AND COALESCE(OLD.status,'') <> 'checked_in' AND NEW.visit_id IS NULL THEN
    INSERT INTO visits (patient_id, assigned_doctor_id, reason, status, current_stage, created_by)
    VALUES (NEW.patient_id, NEW.doctor_id, NEW.reason, 'open', 'triage', auth.uid())
    RETURNING id INTO v_visit;
    NEW.visit_id := v_visit;
    INSERT INTO visit_queue (visit_id, queue_type, priority, entered_at)
    VALUES (v_visit, 'triage', 5, now());
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointment_checkin ON public.appointments;
CREATE TRIGGER trg_appointment_checkin
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointment_checkin_to_visit();

DROP POLICY IF EXISTS "patient read own appts" ON public.appointments;
CREATE POLICY "patient read own appts" ON public.appointments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM patients p WHERE p.id = appointments.patient_id AND p.user_id = auth.uid()));

DROP POLICY IF EXISTS "patient book own appts" ON public.appointments;
CREATE POLICY "patient book own appts" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM patients p WHERE p.id = appointments.patient_id AND p.user_id = auth.uid()));

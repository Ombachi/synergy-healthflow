
-- ============ Clinical Safety: e-signatures, controlled drugs, verification ============

-- 1) E-signatures
CREATE TABLE public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('discharge_summary','prescription')),
  entity_id UUID NOT NULL,
  signer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signer_name TEXT NOT NULL,
  signer_role TEXT,
  signature_hash TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);
GRANT SELECT, INSERT ON public.signatures TO authenticated;
GRANT ALL ON public.signatures TO service_role;
ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signatures readable by clinical staff" ON public.signatures FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pharmacist'));
CREATE POLICY "Signer creates own signature" ON public.signatures FOR INSERT TO authenticated
  WITH CHECK (signer_id = auth.uid());

-- Lock signed records
CREATE OR REPLACE FUNCTION public.block_signed_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_locked BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.signatures WHERE entity_type=TG_ARGV[0] AND entity_id=OLD.id) INTO v_locked;
  IF v_locked AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Record is signed and locked. Only admin can override.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_discharge_signed_lock BEFORE UPDATE ON public.discharge_summaries
  FOR EACH ROW EXECUTE FUNCTION public.block_signed_update('discharge_summary');
CREATE TRIGGER trg_rx_signed_lock BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.block_signed_update('prescription');

-- 2) Controlled drugs
ALTER TABLE public.drug_catalog
  ADD COLUMN IF NOT EXISTS controlled_schedule TEXT CHECK (controlled_schedule IN ('I','II','III','IV','V'));

CREATE TABLE public.controlled_drug_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('receipt','dispense','waste','return','adjustment')),
  qty NUMERIC NOT NULL,
  units TEXT,
  balance_after NUMERIC,
  patient_id UUID REFERENCES public.patients(id),
  prescriber_id UUID REFERENCES auth.users(id),
  dispenser_id UUID REFERENCES auth.users(id),
  witness_id UUID REFERENCES auth.users(id),
  ref_table TEXT,
  ref_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.controlled_drug_register TO authenticated;
GRANT ALL ON public.controlled_drug_register TO service_role;
ALTER TABLE public.controlled_drug_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CDR readable by pharmacy/admin" ON public.controlled_drug_register FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'pharmacist') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "CDR insertable by pharmacy/admin" ON public.controlled_drug_register FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'pharmacist') OR public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_cdr_drug_created ON public.controlled_drug_register(drug_name, created_at DESC);

-- Auto-post on pharmacy dispense of a scheduled drug
CREATE OR REPLACE FUNCTION public.post_cdr_on_dispense() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_med TEXT; v_sched TEXT; v_patient UUID; v_prescriber UUID; v_bal NUMERIC;
BEGIN
  SELECT rx.medication, v.patient_id, rx.prescribed_by
    INTO v_med, v_patient, v_prescriber
    FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id
    WHERE rx.id = NEW.prescription_id;
  SELECT controlled_schedule INTO v_sched FROM drug_catalog WHERE name ILIKE v_med LIMIT 1;
  IF v_sched IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(balance_after,0) - COALESCE(NEW.quantity,1)
    INTO v_bal FROM controlled_drug_register
    WHERE drug_name = v_med ORDER BY created_at DESC LIMIT 1;
  INSERT INTO controlled_drug_register(drug_name, schedule, direction, qty, balance_after,
    patient_id, prescriber_id, dispenser_id, ref_table, ref_id)
  VALUES (v_med, v_sched, 'dispense', COALESCE(NEW.quantity,1), COALESCE(v_bal, -COALESCE(NEW.quantity,1)),
    v_patient, v_prescriber, auth.uid(), 'pharmacy_dispenses', NEW.id);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cdr_dispense AFTER INSERT ON public.pharmacy_dispenses
  FOR EACH ROW EXECUTE FUNCTION public.post_cdr_on_dispense();

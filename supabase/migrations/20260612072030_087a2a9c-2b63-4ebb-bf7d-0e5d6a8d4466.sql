
-- Phase 1: Patient flow completion + Billing/Insurance

-- 1. New roles (added value cannot be used in same tx; reference later via user_roles join)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'receptionist';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'insurance_officer';

-- 2. Extend visits
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS billing_cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pharmacy_cleared_at TIMESTAMPTZ;

-- 3. Appointments
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'booked',
  notes TEXT,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appt_select ON public.appointments FOR SELECT TO authenticated
  USING (true);
CREATE POLICY appt_insert ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY appt_update ON public.appointments FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);
CREATE POLICY appt_delete ON public.appointments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_appt_upd BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Visit queue
CREATE TABLE IF NOT EXISTS public.visit_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  queue_type TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 3,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  served_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_queue TO authenticated;
GRANT ALL ON public.visit_queue TO service_role;
ALTER TABLE public.visit_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY q_select ON public.visit_queue FOR SELECT TO authenticated USING (true);
CREATE POLICY q_write ON public.visit_queue FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 5. Triage records
CREATE TABLE IF NOT EXISTS public.triage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  nurse_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  chief_complaint TEXT,
  acuity INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.triage_records TO authenticated;
GRANT ALL ON public.triage_records TO service_role;
ALTER TABLE public.triage_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY tri_select ON public.triage_records FOR SELECT TO authenticated USING (true);
CREATE POLICY tri_write ON public.triage_records FOR ALL TO authenticated
  USING (has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'));

-- 6. Procedure orders
CREATE TABLE IF NOT EXISTS public.procedure_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  ordered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  procedure_name TEXT NOT NULL,
  code TEXT,
  status TEXT NOT NULL DEFAULT 'ordered',
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedure_orders TO authenticated;
GRANT ALL ON public.procedure_orders TO service_role;
ALTER TABLE public.procedure_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY proc_select ON public.procedure_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY proc_write ON public.procedure_orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_proc_upd BEFORE UPDATE ON public.procedure_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Invoices
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID REFERENCES public.visits(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  total_cents INT NOT NULL DEFAULT 0,
  paid_cents INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY inv_select ON public.invoices FOR SELECT TO authenticated USING (
  auth.uid() IS NOT NULL
);
CREATE POLICY inv_write ON public.invoices FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_inv_upd BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8. Invoice items
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_table TEXT,
  ref_id UUID,
  description TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  unit_price_cents INT NOT NULL DEFAULT 0,
  amount_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY invi_select ON public.invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY invi_write ON public.invoice_items FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 9. Payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount_cents INT NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pay_select ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY pay_write ON public.payments FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- 10. Insurance policies
CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  insurer TEXT NOT NULL,
  member_number TEXT NOT NULL,
  scheme TEXT,
  valid_from DATE,
  valid_to DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY ipol_select ON public.insurance_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY ipol_write ON public.insurance_policies FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_ipol_upd BEFORE UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 11. Insurance claims
CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.insurance_policies(id) ON DELETE SET NULL,
  preauth_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_amount_cents INT,
  notes TEXT,
  processed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_claims TO authenticated;
GRANT ALL ON public.insurance_claims TO service_role;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY icl_select ON public.insurance_claims FOR SELECT TO authenticated USING (true);
CREATE POLICY icl_write ON public.insurance_claims FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER trg_icl_upd BEFORE UPDATE ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 12. Auto-bill helpers + triggers
CREATE OR REPLACE FUNCTION public.ensure_open_invoice(_visit UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_inv UUID; v_pat UUID;
BEGIN
  SELECT id INTO v_inv FROM invoices WHERE visit_id = _visit AND status IN ('draft','issued','partially_paid') LIMIT 1;
  IF v_inv IS NOT NULL THEN RETURN v_inv; END IF;
  SELECT patient_id INTO v_pat FROM visits WHERE id = _visit;
  INSERT INTO invoices(visit_id, patient_id, status) VALUES (_visit, v_pat, 'draft') RETURNING id INTO v_inv;
  RETURN v_inv;
END $$;

CREATE OR REPLACE FUNCTION public.add_invoice_line(_visit UUID, _kind TEXT, _ref_table TEXT, _ref_id UUID, _desc TEXT, _qty INT, _unit INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_inv UUID;
BEGIN
  IF _visit IS NULL THEN RETURN; END IF;
  v_inv := ensure_open_invoice(_visit);
  INSERT INTO invoice_items(invoice_id, kind, ref_table, ref_id, description, qty, unit_price_cents, amount_cents)
  VALUES (v_inv, _kind, _ref_table, _ref_id, _desc, _qty, _unit, _qty * _unit);
  UPDATE invoices SET total_cents = total_cents + (_qty * _unit) WHERE id = v_inv;
END $$;

CREATE OR REPLACE FUNCTION public.bill_prescription() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM add_invoice_line(NEW.visit_id,'pharmacy','prescriptions',NEW.id,'Rx: '||NEW.medication,1,500); RETURN NEW; END $$;
CREATE TRIGGER trg_bill_rx AFTER INSERT ON public.prescriptions FOR EACH ROW EXECUTE FUNCTION bill_prescription();

CREATE OR REPLACE FUNCTION public.bill_lab_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM add_invoice_line(NEW.visit_id,'lab','lab_orders',NEW.id,'Lab order',1,500); RETURN NEW; END $$;
CREATE TRIGGER trg_bill_lab AFTER INSERT ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION bill_lab_order();

CREATE OR REPLACE FUNCTION public.bill_imaging_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM add_invoice_line(NEW.visit_id,'imaging','imaging_orders',NEW.id,'Imaging study',1,2000); RETURN NEW; END $$;
CREATE TRIGGER trg_bill_img AFTER INSERT ON public.imaging_orders FOR EACH ROW EXECUTE FUNCTION bill_imaging_order();

CREATE OR REPLACE FUNCTION public.bill_procedure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM add_invoice_line(NEW.visit_id,'procedure','procedure_orders',NEW.id,'Procedure: '||NEW.procedure_name,1,1500); RETURN NEW; END $$;
CREATE TRIGGER trg_bill_proc AFTER INSERT ON public.procedure_orders FOR EACH ROW EXECUTE FUNCTION bill_procedure();

-- 13. Payment trigger updates invoice + visit clearance
CREATE OR REPLACE FUNCTION public.on_payment_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_inv RECORD;
BEGIN
  UPDATE invoices SET paid_cents = paid_cents + NEW.amount_cents,
    status = CASE WHEN paid_cents + NEW.amount_cents >= total_cents THEN 'paid'
                  WHEN paid_cents + NEW.amount_cents > 0 THEN 'partially_paid' ELSE status END
  WHERE id = NEW.invoice_id RETURNING * INTO v_inv;
  IF v_inv.status = 'paid' AND v_inv.visit_id IS NOT NULL THEN
    UPDATE visits SET billing_cleared_at = now(), pharmacy_cleared_at = COALESCE(pharmacy_cleared_at, now())
    WHERE id = v_inv.visit_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_on_payment AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION on_payment_insert();

-- 14. Insurance approval clears billing
CREATE OR REPLACE FUNCTION public.on_claim_update() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_visit UUID;
BEGIN
  IF NEW.status IN ('approved','paid') AND OLD.status <> NEW.status THEN
    SELECT visit_id INTO v_visit FROM invoices WHERE id = NEW.invoice_id;
    IF v_visit IS NOT NULL THEN
      UPDATE visits SET billing_cleared_at = COALESCE(billing_cleared_at, now()),
                        pharmacy_cleared_at = COALESCE(pharmacy_cleared_at, now())
      WHERE id = v_visit;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_on_claim_upd AFTER UPDATE ON public.insurance_claims FOR EACH ROW EXECUTE FUNCTION on_claim_update();

-- 15. Notify on invoice status change to issued
CREATE OR REPLACE FUNCTION public.notify_invoice_issued() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'issued' AND (OLD.status IS DISTINCT FROM 'issued') THEN
    PERFORM notify_role('cashier','invoice','New invoice ready','Invoice issued for collection','/billing','invoice',NEW.id);
    PERFORM notify_role('admin','invoice','New invoice ready','Invoice issued for collection','/billing','invoice',NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_invoice AFTER UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION notify_invoice_issued();

-- 16. Notify reception on appointment
CREATE OR REPLACE FUNCTION public.notify_appointment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM notify_role('receptionist','appointment','New appointment',
    'Appointment booked for '||to_char(NEW.scheduled_at,'YYYY-MM-DD HH24:MI'),'/reception','appointment',NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_appt AFTER INSERT ON public.appointments FOR EACH ROW EXECUTE FUNCTION notify_appointment();

-- 17. can_discharge helper
CREATE OR REPLACE FUNCTION public.can_discharge(_visit UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM invoices WHERE visit_id = _visit AND status NOT IN ('paid','void')
  );
$$;

-- 18. Pharmacy dispense gate: require billing cleared OR claim approved
CREATE OR REPLACE FUNCTION public.gate_pharmacy_dispense() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_visit UUID; v_clear TIMESTAMPTZ;
BEGIN
  SELECT v.id, v.pharmacy_cleared_at INTO v_visit, v_clear
    FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id
    WHERE rx.id = NEW.prescription_id;
  IF v_clear IS NULL THEN
    RAISE EXCEPTION 'Pharmacy dispense blocked: visit not cleared by billing/insurance';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_gate_dispense BEFORE INSERT ON public.pharmacy_dispenses
  FOR EACH ROW EXECUTE FUNCTION gate_pharmacy_dispense();

-- 19. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.visit_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;

-- 20. Indexes
CREATE INDEX IF NOT EXISTS idx_appt_doctor ON public.appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appt_sched ON public.appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_queue_visit ON public.visit_queue(visit_id);
CREATE INDEX IF NOT EXISTS idx_queue_type ON public.visit_queue(queue_type) WHERE served_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_visit ON public.invoices(visit_id);
CREATE INDEX IF NOT EXISTS idx_inv_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invi_inv ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pay_inv ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ipol_pat ON public.insurance_policies(patient_id);
CREATE INDEX IF NOT EXISTS idx_icl_inv ON public.insurance_claims(invoice_id);
CREATE INDEX IF NOT EXISTS idx_proc_visit ON public.procedure_orders(visit_id);
CREATE INDEX IF NOT EXISTS idx_tri_visit ON public.triage_records(visit_id);

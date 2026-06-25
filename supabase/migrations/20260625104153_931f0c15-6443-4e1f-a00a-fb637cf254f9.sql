
-- ============================================================
-- OUTBOX EVENT BUS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx ON public.outbox_events (status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS outbox_events_agg_idx ON public.outbox_events (aggregate_type, aggregate_id);

GRANT SELECT, UPDATE ON public.outbox_events TO authenticated;
GRANT ALL ON public.outbox_events TO service_role;
ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbox_read_admin" ON public.outbox_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "outbox_service_write" ON public.outbox_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.emit_outbox(_agg_type text, _agg_id uuid, _event text, _payload jsonb)
RETURNS void AS $$
BEGIN
  INSERT INTO public.outbox_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES (_agg_type, _agg_id, _event, COALESCE(_payload, '{}'::jsonb));
EXCEPTION WHEN OTHERS THEN
  -- never break the originating transaction
  NULL;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger functions
CREATE OR REPLACE FUNCTION public.tg_outbox_lab_value() RETURNS trigger AS $$
BEGIN
  PERFORM emit_outbox('lab_result', NEW.order_id, 'lab.value.upserted',
    jsonb_build_object('order_id', NEW.order_id, 'parameter', NEW.parameter_name, 'value', NEW.value_text, 'flag', NEW.abnormal_flag));
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.tg_outbox_invoice() RETURNS trigger AS $$
BEGIN
  PERFORM emit_outbox('invoice', NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'invoice.created' ELSE 'invoice.updated' END,
    jsonb_build_object('id', NEW.id, 'status', NEW.status, 'total_cents', NEW.total_cents, 'paid_cents', NEW.paid_cents, 'patient_id', NEW.patient_id));
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.tg_outbox_stock_movement() RETURNS trigger AS $$
BEGIN
  PERFORM emit_outbox('stock_movement', NEW.id, 'stock.movement',
    jsonb_build_object('id', NEW.id, 'item_id', NEW.item_id, 'qty', NEW.qty, 'direction', NEW.direction));
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.tg_outbox_claim() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM emit_outbox('insurance_claim', NEW.id, 'claim.' || NEW.status,
      jsonb_build_object('id', NEW.id, 'status', NEW.status, 'invoice_id', NEW.invoice_id, 'approved_amount_cents', NEW.approved_amount_cents));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_outbox_lab_value ON public.lab_result_values;
CREATE TRIGGER trg_outbox_lab_value AFTER INSERT OR UPDATE ON public.lab_result_values
  FOR EACH ROW EXECUTE FUNCTION public.tg_outbox_lab_value();

DROP TRIGGER IF EXISTS trg_outbox_invoice ON public.invoices;
CREATE TRIGGER trg_outbox_invoice AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_outbox_invoice();

DROP TRIGGER IF EXISTS trg_outbox_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_outbox_stock_movement AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.tg_outbox_stock_movement();

DROP TRIGGER IF EXISTS trg_outbox_claim ON public.insurance_claims;
CREATE TRIGGER trg_outbox_claim AFTER INSERT OR UPDATE ON public.insurance_claims
  FOR EACH ROW EXECUTE FUNCTION public.tg_outbox_claim();

-- ============================================================
-- CLAIM SUBMISSIONS (live tracker)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.claim_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  payer_code text,
  external_ref text,
  status text NOT NULL DEFAULT 'queued',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES auth.users(id),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS claim_submissions_claim_idx ON public.claim_submissions (claim_id);
CREATE INDEX IF NOT EXISTS claim_submissions_ref_idx ON public.claim_submissions (external_ref);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_submissions TO authenticated;
GRANT ALL ON public.claim_submissions TO service_role;
ALTER TABLE public.claim_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "claim_sub_read" ON public.claim_submissions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'insurance_officer'::app_role)
      OR has_role(auth.uid(), 'billing_officer'::app_role) OR has_role(auth.uid(), 'cashier'::app_role));
CREATE POLICY "claim_sub_write" ON public.claim_submissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'insurance_officer'::app_role) OR has_role(auth.uid(), 'billing_officer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'insurance_officer'::app_role) OR has_role(auth.uid(), 'billing_officer'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.claim_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.insurance_claims;

-- ============================================================
-- REMITTANCE / RECONCILIATION
-- ============================================================
CREATE TABLE IF NOT EXISTS public.remittance_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_id uuid REFERENCES public.insurance_payers(id) ON DELETE SET NULL,
  payer_code text,
  filename text,
  rows_total int NOT NULL DEFAULT 0,
  rows_matched int NOT NULL DEFAULT 0,
  rows_unmatched int NOT NULL DEFAULT 0,
  total_paid_cents bigint NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.remittance_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.remittance_batches(id) ON DELETE CASCADE,
  claim_id uuid REFERENCES public.insurance_claims(id) ON DELETE SET NULL,
  external_claim_ref text,
  invoice_no text,
  member_number text,
  paid_cents int NOT NULL DEFAULT 0,
  approved_cents int,
  status text,
  paid_at date,
  reason text,
  matched boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remittance_batches, public.remittance_lines TO authenticated;
GRANT ALL ON public.remittance_batches, public.remittance_lines TO service_role;
ALTER TABLE public.remittance_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remittance_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "remit_batch_rw" ON public.remittance_batches FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'insurance_officer'::app_role) OR has_role(auth.uid(), 'billing_officer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'insurance_officer'::app_role) OR has_role(auth.uid(), 'billing_officer'::app_role));
CREATE POLICY "remit_line_rw" ON public.remittance_lines FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'insurance_officer'::app_role) OR has_role(auth.uid(), 'billing_officer'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'insurance_officer'::app_role) OR has_role(auth.uid(), 'billing_officer'::app_role));

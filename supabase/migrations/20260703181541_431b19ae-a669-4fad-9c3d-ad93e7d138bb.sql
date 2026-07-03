
-- =========================
-- CASH SESSIONS
-- =========================
CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashier_id uuid NOT NULL REFERENCES auth.users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_float_cents integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  declared_cash_cents integer,
  system_cash_cents integer,
  variance_cents integer,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.cash_sessions TO authenticated;
GRANT ALL ON public.cash_sessions TO service_role;

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cashiers view own sessions, admins/billing view all"
ON public.cash_sessions FOR SELECT TO authenticated
USING (
  cashier_id = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'billing_officer')
);

CREATE POLICY "Cashiers open own sessions"
ON public.cash_sessions FOR INSERT TO authenticated
WITH CHECK (
  cashier_id = auth.uid()
  AND (has_role(auth.uid(),'cashier') OR has_role(auth.uid(),'billing_officer') OR has_role(auth.uid(),'admin'))
);

CREATE POLICY "Cashiers close own sessions"
ON public.cash_sessions FOR UPDATE TO authenticated
USING (cashier_id = auth.uid() OR has_role(auth.uid(),'admin'))
WITH CHECK (cashier_id = auth.uid() OR has_role(auth.uid(),'admin'));

-- Only one open session per cashier at a time
CREATE UNIQUE INDEX cash_sessions_one_open_per_cashier
  ON public.cash_sessions(cashier_id) WHERE status = 'open';

-- Close a session: computes expected cash from payments in window
CREATE OR REPLACE FUNCTION public.close_cash_session(
  _session_id uuid,
  _declared_cents integer,
  _notes text DEFAULT NULL
) RETURNS public.cash_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.cash_sessions;
  expected integer;
BEGIN
  SELECT * INTO s FROM public.cash_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF s.status = 'closed' THEN RAISE EXCEPTION 'Session already closed'; END IF;
  IF s.cashier_id <> auth.uid() AND NOT has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only the cashier or an admin can close this session';
  END IF;

  SELECT COALESCE(SUM(amount_cents),0) INTO expected
  FROM public.payments
  WHERE method = 'cash'
    AND received_by = s.cashier_id
    AND received_at >= s.opened_at
    AND received_at <= now();

  UPDATE public.cash_sessions
    SET closed_at = now(),
        declared_cash_cents = _declared_cents,
        system_cash_cents = s.opening_float_cents + expected,
        variance_cents = _declared_cents - (s.opening_float_cents + expected),
        status = 'closed',
        notes = COALESCE(_notes, notes)
  WHERE id = _session_id
  RETURNING * INTO s;

  RETURN s;
END;
$$;

-- =========================
-- CREDIT NOTES / REFUNDS
-- =========================
CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  review_notes text,
  refund_method text,
  refund_reference text
);

GRANT SELECT, INSERT, UPDATE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Billing/cashier/admin can view credit notes"
ON public.credit_notes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'cashier')
);

CREATE POLICY "Billing/cashier/admin can create credit notes"
ON public.credit_notes FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'billing_officer') OR has_role(auth.uid(),'cashier'))
);

CREATE POLICY "Billing/admin can review credit notes"
ON public.credit_notes FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'billing_officer'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'billing_officer'));

-- Approve credit note: validates against paid amount and inserts negative payment
CREATE OR REPLACE FUNCTION public.approve_credit_note(
  _credit_note_id uuid,
  _refund_method text,
  _refund_reference text DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS public.credit_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cn public.credit_notes;
  inv public.invoices;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'billing_officer')) THEN
    RAISE EXCEPTION 'Only billing officers or admins can approve credit notes';
  END IF;

  SELECT * INTO cn FROM public.credit_notes WHERE id = _credit_note_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit note not found'; END IF;
  IF cn.status <> 'pending' THEN RAISE EXCEPTION 'Credit note already %', cn.status; END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = cn.invoice_id FOR UPDATE;
  IF cn.amount_cents > inv.paid_cents THEN
    RAISE EXCEPTION 'Refund amount (%) exceeds paid amount (%)', cn.amount_cents, inv.paid_cents;
  END IF;

  -- Negative payment line
  INSERT INTO public.payments (invoice_id, amount_cents, method, reference, received_by)
  VALUES (cn.invoice_id, -cn.amount_cents, _refund_method, _refund_reference, auth.uid());

  UPDATE public.credit_notes
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = _notes,
        refund_method = _refund_method,
        refund_reference = _refund_reference
  WHERE id = _credit_note_id
  RETURNING * INTO cn;

  RETURN cn;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_credit_note(
  _credit_note_id uuid,
  _notes text
) RETURNS public.credit_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cn public.credit_notes;
BEGIN
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'billing_officer')) THEN
    RAISE EXCEPTION 'Only billing officers or admins can reject credit notes';
  END IF;

  UPDATE public.credit_notes
    SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = _notes
  WHERE id = _credit_note_id AND status = 'pending'
  RETURNING * INTO cn;

  IF NOT FOUND THEN RAISE EXCEPTION 'Credit note not found or not pending'; END IF;
  RETURN cn;
END;
$$;

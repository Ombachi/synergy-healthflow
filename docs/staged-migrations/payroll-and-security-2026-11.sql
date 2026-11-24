-- Litu Vault: security hardening + one-click payroll. Idempotent; run in external Supabase SQL editor.
CREATE OR REPLACE FUNCTION public.close_cash_session(_session_id uuid, _declared_cents integer, _notes text DEFAULT NULL::text)
 RETURNS cash_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.cash_sessions; expected integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO s FROM public.cash_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF s.status = 'closed' THEN RAISE EXCEPTION 'Session already closed'; END IF;
  IF s.cashier_id IS DISTINCT FROM auth.uid() AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only the cashier or an admin can close this session';
  END IF;
  SELECT COALESCE(SUM(amount_cents),0) INTO expected FROM public.payments
  WHERE method = 'cash' AND received_by = s.cashier_id AND received_at >= s.opened_at AND received_at <= now();
  UPDATE public.cash_sessions SET closed_at = now(), declared_cash_cents = _declared_cents,
    system_cash_cents = s.opening_float_cents + expected,
    variance_cents = _declared_cents - (s.opening_float_cents + expected),
    status = 'closed', notes = COALESCE(_notes, notes)
  WHERE id = _session_id RETURNING * INTO s;
  RETURN s;
END; $function$;
REVOKE EXECUTE ON FUNCTION public.close_cash_session(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.patient_pay_invoice(_invoice uuid, _amount_cents integer, _method text, _reference text DEFAULT NULL::text)
 RETURNS payments LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Self-recorded payments are disabled. Please pay via M-Pesa prompt or at the cashier so the payment can be confirmed.';
END; $function$;
REVOKE EXECUTE ON FUNCTION public.patient_pay_invoice(uuid,integer,text,text) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.refresh_admin_kpis() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "leave_balances_no_self_insert" ON public.leave_balances;
DROP POLICY IF EXISTS "leave_balances_no_self_update" ON public.leave_balances;
DROP POLICY IF EXISTS "leave_balances_no_self_delete" ON public.leave_balances;
CREATE POLICY "leave_balances_no_self_insert" ON public.leave_balances AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.is_hr_staff() AND employee_id <> auth.uid());
CREATE POLICY "leave_balances_no_self_update" ON public.leave_balances AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.is_hr_staff() AND employee_id <> auth.uid()) WITH CHECK (public.is_hr_staff() AND employee_id <> auth.uid());
CREATE POLICY "leave_balances_no_self_delete" ON public.leave_balances AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.is_hr_staff() AND employee_id <> auth.uid());
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS basic_salary_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS allowances_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS kra_pin text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tax_resident boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS payslips_employee_period_uniq ON public.payslips(employee_id, period_id);
NOTIFY pgrst, 'reload schema';

ALTER TABLE public.wards ADD COLUMN IF NOT EXISTS daily_bed_rate_cents integer NOT NULL DEFAULT 250000;

ALTER TABLE public.instruments ADD COLUMN IF NOT EXISTS qc_profile text NOT NULL DEFAULT 'chemistry';
ALTER TABLE public.instruments ADD COLUMN IF NOT EXISTS qc_panel_codes text[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.post_inpatient_daily_charges(_day date DEFAULT (now() AT TIME ZONE 'Africa/Nairobi')::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  inv uuid;
  rate integer;
  posted integer := 0;
  desc_text text;
BEGIN
  FOR r IN
    SELECT a.id, a.visit_id, w.name AS ward_name, w.daily_bed_rate_cents
    FROM public.admissions a
    JOIN public.beds b ON b.id = a.bed_id
    JOIN public.wards w ON w.id = b.ward_id
    WHERE a.visit_id IS NOT NULL
      AND (a.admitted_at AT TIME ZONE 'Africa/Nairobi')::date <= _day
      AND (a.discharged_at IS NULL OR (a.discharged_at AT TIME ZONE 'Africa/Nairobi')::date >= _day)
  LOOP
    rate := COALESCE(r.daily_bed_rate_cents, 0);
    CONTINUE WHEN rate <= 0;
    desc_text := 'Bed charge - ' || r.ward_name || ' (' || to_char(_day, 'DD/MM/YYYY') || ')';

    IF EXISTS (
      SELECT 1 FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      WHERE ii.ref_table = 'admissions_daily'
        AND ii.ref_id = r.id
        AND ii.description = desc_text
        AND i.visit_id = r.visit_id
    ) THEN
      CONTINUE;
    END IF;

    inv := public.ensure_open_invoice(r.visit_id);
    INSERT INTO public.invoice_items (invoice_id, kind, ref_table, ref_id, description, qty, unit_price_cents, amount_cents)
    VALUES (inv, 'bed', 'admissions_daily', r.id, desc_text, 1, rate, rate);
    posted := posted + 1;
  END LOOP;
  RETURN posted;
END;
$$;

REVOKE ALL ON FUNCTION public.post_inpatient_daily_charges(date) FROM public;
GRANT EXECUTE ON FUNCTION public.post_inpatient_daily_charges(date) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('inpatient-daily-charges');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('inpatient-daily-charges', '5 21 * * *', $$SELECT public.post_inpatient_daily_charges();$$);

CREATE OR REPLACE FUNCTION public.route_critical_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  doc uuid;
  pname text;
BEGIN
  SELECT COALESCE(v.assigned_doctor_id, v.doctor_id) INTO doc FROM public.visits v WHERE v.id = NEW.visit_id;
  SELECT full_name INTO pname FROM public.patients WHERE id = NEW.patient_id;

  IF doc IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link, entity_type, entity_id)
    VALUES (doc, 'critical_result',
            'Critical result: ' || COALESCE(NEW.parameter_name, 'lab'),
            COALESCE(pname, 'Patient') || ' - ' || COALESCE(NEW.value_text, '') || ' ' || COALESCE(NEW.units, ''),
            '/critical-results', 'critical_result_alerts', NEW.id);
  END IF;

  PERFORM public.notify_role('nurse', 'critical_result',
    'Critical result: ' || COALESCE(NEW.parameter_name, 'lab'),
    COALESCE(pname, 'Patient') || ' - ' || COALESCE(NEW.value_text, '') || ' ' || COALESCE(NEW.units, ''),
    '/critical-results', 'critical_result_alerts', NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_critical_result ON public.critical_result_alerts;
CREATE TRIGGER trg_route_critical_result
AFTER INSERT ON public.critical_result_alerts
FOR EACH ROW EXECUTE FUNCTION public.route_critical_result();
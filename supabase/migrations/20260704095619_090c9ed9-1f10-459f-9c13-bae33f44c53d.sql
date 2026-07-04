
-- Error events
CREATE TABLE public.error_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  env text NOT NULL DEFAULT 'prod',
  route text,
  message text NOT NULL,
  stack text,
  user_id uuid,
  context jsonb
);
GRANT SELECT ON public.error_events TO authenticated;
GRANT ALL ON public.error_events TO service_role;
ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read errors" ON public.error_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_error_events_occurred ON public.error_events(occurred_at DESC);

-- Log error RPC (callable by anyone, inserts with SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.log_error(
  _message text,
  _stack text DEFAULT NULL,
  _route text DEFAULT NULL,
  _context jsonb DEFAULT NULL,
  _env text DEFAULT 'prod'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.error_events(message, stack, route, context, user_id, env)
  VALUES (left(coalesce(_message, '(no message)'), 2000),
          left(_stack, 8000),
          left(_route, 500),
          _context,
          auth.uid(),
          coalesce(_env, 'prod'))
  RETURNING id INTO new_id;
  RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.log_error(text, text, text, jsonb, text) TO anon, authenticated;

-- SLA view: lab turnaround
CREATE OR REPLACE VIEW public.v_lab_tat AS
SELECT
  lo.id AS order_id,
  lo.patient_id,
  lo.priority,
  lo.status,
  lo.created_at AS ordered_at,
  MAX(lr.performed_at) AS completed_at,
  ROUND(EXTRACT(EPOCH FROM (COALESCE(MAX(lr.performed_at), now()) - lo.created_at))/60)::int AS minutes_elapsed,
  CASE WHEN lo.priority = 'stat' THEN 60 ELSE 240 END AS threshold_minutes,
  CASE
    WHEN MAX(lr.performed_at) IS NULL
      AND EXTRACT(EPOCH FROM (now() - lo.created_at))/60
        > CASE WHEN lo.priority='stat' THEN 60 ELSE 240 END THEN 'breached'
    WHEN MAX(lr.performed_at) IS NULL THEN 'in_progress'
    WHEN EXTRACT(EPOCH FROM (MAX(lr.performed_at) - lo.created_at))/60
        > CASE WHEN lo.priority='stat' THEN 60 ELSE 240 END THEN 'late'
    ELSE 'on_time'
  END AS sla_status
FROM public.lab_orders lo
LEFT JOIN public.lab_results lr ON lr.order_id = lo.id
GROUP BY lo.id;
GRANT SELECT ON public.v_lab_tat TO authenticated;

-- SLA view: radiology turnaround
CREATE OR REPLACE VIEW public.v_radiology_tat AS
SELECT
  io.id AS order_id,
  io.patient_id,
  io.priority,
  io.status,
  io.modality,
  io.created_at AS ordered_at,
  io.performed_at,
  CASE WHEN io.report IS NOT NULL THEN io.updated_at END AS reported_at,
  ROUND(EXTRACT(EPOCH FROM (COALESCE(
    CASE WHEN io.report IS NOT NULL THEN io.updated_at END, now()) - io.created_at))/60)::int AS minutes_elapsed,
  CASE WHEN io.priority = 'stat' THEN 120 ELSE 1440 END AS threshold_minutes,
  CASE
    WHEN io.report IS NULL
      AND EXTRACT(EPOCH FROM (now() - io.created_at))/60
        > CASE WHEN io.priority='stat' THEN 120 ELSE 1440 END THEN 'breached'
    WHEN io.report IS NULL THEN 'in_progress'
    WHEN EXTRACT(EPOCH FROM (io.updated_at - io.created_at))/60
        > CASE WHEN io.priority='stat' THEN 120 ELSE 1440 END THEN 'late'
    ELSE 'on_time'
  END AS sla_status
FROM public.imaging_orders io;
GRANT SELECT ON public.v_radiology_tat TO authenticated;

-- Public queue display RPC (no PHI)
CREATE OR REPLACE FUNCTION public.get_public_queue()
RETURNS TABLE(ticket text, queue_type text, priority int, status text, entered_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    upper(substr(replace(vq.id::text, '-', ''), 1, 6)) AS ticket,
    vq.queue_type,
    vq.priority,
    CASE
      WHEN vq.served_at IS NOT NULL THEN 'served'
      WHEN vq.called_at IS NOT NULL THEN 'now_serving'
      ELSE 'waiting'
    END AS status,
    vq.entered_at
  FROM public.visit_queue vq
  WHERE vq.entered_at::date = CURRENT_DATE
  ORDER BY
    (vq.called_at IS NOT NULL AND vq.served_at IS NULL) DESC,
    vq.served_at NULLS FIRST,
    vq.priority DESC,
    vq.entered_at ASC
  LIMIT 60;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_queue() TO anon, authenticated;

-- Cron: scan SLA breaches every 15 minutes and log summary
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cron_sla_breach_scan() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lab_breached int; rad_breached int;
BEGIN
  SELECT count(*) INTO lab_breached FROM public.v_lab_tat WHERE sla_status = 'breached';
  SELECT count(*) INTO rad_breached FROM public.v_radiology_tat WHERE sla_status = 'breached';
  IF lab_breached > 0 OR rad_breached > 0 THEN
    INSERT INTO public.error_events(message, route, env, context)
    VALUES (
      'SLA breach scan: lab=' || lab_breached || ' radiology=' || rad_breached,
      '/sla', 'cron',
      jsonb_build_object('lab_breached', lab_breached, 'radiology_breached', rad_breached)
    );
  END IF;
END; $$;

SELECT cron.schedule(
  'sla-breach-scan',
  '*/15 * * * *',
  $$SELECT public.cron_sla_breach_scan();$$
);

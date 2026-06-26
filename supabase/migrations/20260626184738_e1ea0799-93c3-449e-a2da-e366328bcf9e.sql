
-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- 1. WARDS / BEDS / ADMISSIONS
-- ============================================================
CREATE TABLE public.wards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  department TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wards TO authenticated;
GRANT ALL ON public.wards TO service_role;
ALTER TABLE public.wards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wards readable by staff" ON public.wards FOR SELECT TO authenticated USING (true);
CREATE POLICY "wards write by admin" ON public.wards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.beds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ward_id UUID NOT NULL REFERENCES public.wards(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free','occupied','cleaning','blocked')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ward_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beds TO authenticated;
GRANT ALL ON public.beds TO service_role;
ALTER TABLE public.beds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "beds readable by staff" ON public.beds FOR SELECT TO authenticated USING (true);
CREATE POLICY "beds write by admin or nurse" ON public.beds FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor'));

CREATE TABLE public.admissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  bed_id UUID REFERENCES public.beds(id) ON DELETE SET NULL,
  admitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  discharged_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','discharged','transferred_out')),
  admission_reason TEXT,
  admitted_by UUID REFERENCES auth.users(id),
  discharged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX adm_active_idx ON public.admissions(status) WHERE status='active';
CREATE INDEX adm_bed_idx ON public.admissions(bed_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admissions TO authenticated;
GRANT ALL ON public.admissions TO service_role;
ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adm read staff" ON public.admissions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'receptionist')
);
CREATE POLICY "adm write clinical" ON public.admissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse'));

CREATE TABLE public.bed_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admission_id UUID NOT NULL REFERENCES public.admissions(id) ON DELETE CASCADE,
  from_bed_id UUID REFERENCES public.beds(id),
  to_bed_id UUID NOT NULL REFERENCES public.beds(id),
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  transferred_by UUID REFERENCES auth.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.bed_transfers TO authenticated;
GRANT ALL ON public.bed_transfers TO service_role;
ALTER TABLE public.bed_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers read staff" ON public.bed_transfers FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse')
);
CREATE POLICY "transfers write clinical" ON public.bed_transfers FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse')
);

-- Trigger: keep bed status in sync with admission lifecycle
CREATE OR REPLACE FUNCTION public.sync_bed_status() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' AND NEW.status='active' AND NEW.bed_id IS NOT NULL THEN
    UPDATE public.beds SET status='occupied', updated_at=now() WHERE id=NEW.bed_id;
  ELSIF TG_OP='UPDATE' THEN
    IF NEW.status IN ('discharged','transferred_out') AND OLD.status='active' AND OLD.bed_id IS NOT NULL THEN
      UPDATE public.beds SET status='cleaning', updated_at=now() WHERE id=OLD.bed_id;
    END IF;
    IF NEW.bed_id IS DISTINCT FROM OLD.bed_id AND NEW.bed_id IS NOT NULL THEN
      UPDATE public.beds SET status='occupied', updated_at=now() WHERE id=NEW.bed_id;
      IF OLD.bed_id IS NOT NULL THEN
        UPDATE public.beds SET status='cleaning', updated_at=now() WHERE id=OLD.bed_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_admission_bed_sync AFTER INSERT OR UPDATE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.sync_bed_status();

CREATE OR REPLACE FUNCTION public.set_updated_at_generic() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE TRIGGER tg_wards_touch BEFORE UPDATE ON public.wards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
CREATE TRIGGER tg_beds_touch BEFORE UPDATE ON public.beds FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
CREATE TRIGGER tg_adm_touch BEFORE UPDATE ON public.admissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- ============================================================
-- 2. PRE-AUTHORIZATION
-- ============================================================
ALTER TABLE public.insurance_payers ADD COLUMN IF NOT EXISTS requires_preauth BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.procedure_orders ADD COLUMN IF NOT EXISTS requires_preauth BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.procedure_orders ADD COLUMN IF NOT EXISTS preauth_id UUID;

CREATE TABLE public.preauth_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  visit_id UUID REFERENCES public.visits(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.insurance_policies(id) ON DELETE SET NULL,
  payer_id UUID REFERENCES public.insurance_payers(id) ON DELETE SET NULL,
  procedure_name TEXT NOT NULL,
  procedure_code TEXT,
  clinical_justification TEXT,
  estimated_cost_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  reference_number TEXT,
  approved_amount_cents INTEGER,
  decision_notes TEXT,
  requested_by UUID REFERENCES auth.users(id),
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX preauth_status_idx ON public.preauth_requests(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preauth_requests TO authenticated;
GRANT ALL ON public.preauth_requests TO service_role;
ALTER TABLE public.preauth_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preauth read" ON public.preauth_requests FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'insurance_officer') OR public.has_role(auth.uid(),'billing_officer')
);
CREATE POLICY "preauth doctors create" ON public.preauth_requests FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
);
CREATE POLICY "preauth officer decide" ON public.preauth_requests FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'insurance_officer') OR public.has_role(auth.uid(),'doctor')
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'insurance_officer') OR public.has_role(auth.uid(),'doctor')
);
CREATE TRIGGER tg_preauth_touch BEFORE UPDATE ON public.preauth_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

ALTER TABLE public.procedure_orders
  ADD CONSTRAINT procedure_orders_preauth_fk FOREIGN KEY (preauth_id) REFERENCES public.preauth_requests(id) ON DELETE SET NULL;

-- Replace bill_procedure with PA-gated version
CREATE OR REPLACE FUNCTION public.bill_procedure() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_pa RECORD;
BEGIN
  IF NEW.requires_preauth THEN
    IF NEW.preauth_id IS NULL THEN
      RAISE EXCEPTION 'Procedure requires pre-authorization but none is attached';
    END IF;
    SELECT status INTO v_pa FROM public.preauth_requests WHERE id = NEW.preauth_id;
    IF v_pa.status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Pre-authorization for this procedure is % (must be approved before billing)', COALESCE(v_pa.status,'missing');
    END IF;
  END IF;
  PERFORM add_invoice_line(NEW.visit_id,'procedure','procedure_orders',NEW.id,'Procedure: '||NEW.procedure_name,1,
    COALESCE(NULLIF(catalog_price('procedure'),0),1500));
  RETURN NEW;
END $$;

-- ============================================================
-- 3. ROSTERING (shifts, assignments, leave)
-- ============================================================
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shifts read all staff" ON public.shifts FOR SELECT TO authenticated USING (true);
CREATE POLICY "shifts admin write" ON public.shifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tg_shifts_touch BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

CREATE TABLE public.shift_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (shift_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_assignments TO authenticated;
GRANT ALL ON public.shift_assignments TO service_role;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shift_assign read" ON public.shift_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "shift_assign admin write" ON public.shift_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER tg_sa_touch BEFORE UPDATE ON public.shift_assignments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL DEFAULT 'annual' CHECK (kind IN ('annual','sick','unpaid','study','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','cancelled')),
  reason TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leave self or admin read" ON public.leave_requests FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "leave self insert" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "leave admin decide" ON public.leave_requests FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR user_id = auth.uid()
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR user_id = auth.uid()
);
CREATE TRIGGER tg_leave_touch BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- Conflict detection RPC: returns overlapping assignments / leave for a user+window
CREATE OR REPLACE FUNCTION public.roster_conflicts(_user UUID, _starts TIMESTAMPTZ, _ends TIMESTAMPTZ)
RETURNS TABLE(kind TEXT, ref_id UUID, label TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT 'shift'::text, s.id, s.name, s.starts_at, s.ends_at
    FROM shift_assignments sa JOIN shifts s ON s.id=sa.shift_id
    WHERE sa.user_id=_user AND sa.status<>'cancelled'
      AND tstzrange(s.starts_at,s.ends_at,'[)') && tstzrange(_starts,_ends,'[)')
  UNION ALL
  SELECT 'leave'::text, lr.id, lr.kind, lr.starts_at, lr.ends_at
    FROM leave_requests lr
    WHERE lr.user_id=_user AND lr.status IN ('pending','approved')
      AND tstzrange(lr.starts_at,lr.ends_at,'[)') && tstzrange(_starts,_ends,'[)')
$$;

-- ============================================================
-- 4. DUPLICATE PATIENT DETECTOR
-- ============================================================
CREATE INDEX IF NOT EXISTS patients_fullname_trgm ON public.patients USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS patients_phone_trgm ON public.patients USING gin (phone gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.find_duplicate_patients(_name TEXT, _dob DATE, _phone TEXT)
RETURNS TABLE(id UUID, full_name TEXT, date_of_birth DATE, phone TEXT, medical_record_number TEXT, score REAL)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p.id, p.full_name, p.date_of_birth, p.phone, p.medical_record_number,
    (
      COALESCE(similarity(p.full_name, COALESCE(_name,'')),0) * 0.6
      + (CASE WHEN _dob IS NOT NULL AND p.date_of_birth = _dob THEN 0.3 ELSE 0 END)
      + (CASE WHEN _phone IS NOT NULL AND p.phone IS NOT NULL AND
              regexp_replace(p.phone,'\D','','g') = regexp_replace(_phone,'\D','','g') THEN 0.3 ELSE 0 END)
    )::real AS score
  FROM public.patients p
  WHERE
    (_name IS NOT NULL AND p.full_name % _name)
    OR (_phone IS NOT NULL AND regexp_replace(p.phone,'\D','','g') = regexp_replace(_phone,'\D','','g'))
    OR (_dob IS NOT NULL AND p.date_of_birth = _dob)
  ORDER BY score DESC
  LIMIT 10
$$;

-- ============================================================
-- 5. ADMIN KPI MATERIALIZED VIEWS
-- ============================================================
CREATE MATERIALIZED VIEW public.mv_kpi_revenue_by_dept AS
SELECT
  COALESCE(ii.kind,'other') AS dept,
  date_trunc('day', ii.created_at)::date AS day,
  SUM(ii.amount_cents)::bigint AS revenue_cents,
  COUNT(*)::bigint AS line_count
FROM public.invoice_items ii
WHERE ii.created_at >= now() - interval '90 days'
GROUP BY 1,2;
CREATE UNIQUE INDEX mv_rev_dept_idx ON public.mv_kpi_revenue_by_dept(dept, day);

CREATE MATERIALIZED VIEW public.mv_kpi_occupancy AS
SELECT
  w.id AS ward_id, w.name AS ward,
  COUNT(b.*) FILTER (WHERE b.id IS NOT NULL)::int AS total_beds,
  COUNT(b.*) FILTER (WHERE b.status='occupied')::int AS occupied,
  COUNT(b.*) FILTER (WHERE b.status='free')::int AS free,
  COUNT(b.*) FILTER (WHERE b.status='cleaning')::int AS cleaning,
  COUNT(b.*) FILTER (WHERE b.status='blocked')::int AS blocked,
  CASE WHEN COUNT(b.*)>0
    THEN ROUND(100.0 * COUNT(b.*) FILTER (WHERE b.status='occupied') / COUNT(b.*),1)
    ELSE 0 END AS occupancy_pct
FROM public.wards w LEFT JOIN public.beds b ON b.ward_id=w.id
GROUP BY w.id, w.name;
CREATE UNIQUE INDEX mv_occ_idx ON public.mv_kpi_occupancy(ward_id);

CREATE MATERIALIZED VIEW public.mv_kpi_alos AS
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (a.discharged_at - a.admitted_at))/86400.0)::numeric,2) AS alos_days,
  COUNT(*)::int AS discharges_30d
FROM public.admissions a
WHERE a.discharged_at IS NOT NULL AND a.discharged_at >= now() - interval '30 days';
CREATE UNIQUE INDEX mv_alos_idx ON public.mv_kpi_alos((1));

CREATE MATERIALIZED VIEW public.mv_kpi_denial AS
SELECT
  COUNT(*) FILTER (WHERE status='denied')::int AS denied_count,
  COUNT(*) FILTER (WHERE status IN ('approved','denied','paid'))::int AS decided_count,
  CASE WHEN COUNT(*) FILTER (WHERE status IN ('approved','denied','paid'))>0
    THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status='denied')
         / COUNT(*) FILTER (WHERE status IN ('approved','denied','paid')),1)
    ELSE 0 END AS denial_pct
FROM public.insurance_claims
WHERE created_at >= now() - interval '90 days';
CREATE UNIQUE INDEX mv_den_idx ON public.mv_kpi_denial((1));

CREATE MATERIALIZED VIEW public.mv_kpi_lab_tat AS
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (lr.created_at - lo.created_at))/60.0)::numeric,1) AS tat_minutes,
  COUNT(*)::int AS samples_30d
FROM public.lab_orders lo
JOIN public.lab_results lr ON lr.order_id = lo.id
WHERE lo.created_at >= now() - interval '30 days';
CREATE UNIQUE INDEX mv_tat_idx ON public.mv_kpi_lab_tat((1));

GRANT SELECT ON public.mv_kpi_revenue_by_dept TO authenticated;
GRANT SELECT ON public.mv_kpi_occupancy TO authenticated;
GRANT SELECT ON public.mv_kpi_alos TO authenticated;
GRANT SELECT ON public.mv_kpi_denial TO authenticated;
GRANT SELECT ON public.mv_kpi_lab_tat TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_admin_kpis() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_kpi_revenue_by_dept;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_kpi_occupancy;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_kpi_alos;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_kpi_denial;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_kpi_lab_tat;
END $$;
GRANT EXECUTE ON FUNCTION public.refresh_admin_kpis() TO authenticated;

-- Schedule cron refresh every 5 minutes
SELECT cron.schedule('refresh-admin-kpis','*/5 * * * *', $$SELECT public.refresh_admin_kpis();$$);

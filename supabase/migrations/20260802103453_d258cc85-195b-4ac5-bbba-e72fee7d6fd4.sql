-- 1. clinical_tasks UPDATE: assigned user, assigned role, or admin only
DROP POLICY IF EXISTS "Clinical tasks: assignee/creator/admin update" ON public.clinical_tasks;
CREATE POLICY "Clinical tasks: assignee/role/admin update"
ON public.clinical_tasks FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR assigned_to = auth.uid()
  OR (assigned_role IS NOT NULL AND public.has_role(auth.uid(), assigned_role))
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR assigned_to = auth.uid()
  OR (assigned_role IS NOT NULL AND public.has_role(auth.uid(), assigned_role))
);

-- 2. version/audit tables: insert only via SECURITY DEFINER triggers
DROP POLICY IF EXISTS "system inserts lab result versions" ON public.lab_result_versions;
DROP POLICY IF EXISTS "system inserts lab result value versions" ON public.lab_result_value_versions;
DROP POLICY IF EXISTS "system inserts imaging order versions" ON public.imaging_order_versions;
DROP POLICY IF EXISTS "system inserts prescription versions" ON public.prescription_versions;
DROP POLICY IF EXISTS "system inserts pharmacy dispense versions" ON public.pharmacy_dispense_versions;

REVOKE INSERT, UPDATE, DELETE ON public.lab_result_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.lab_result_value_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.imaging_order_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.prescription_versions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pharmacy_dispense_versions FROM authenticated;

GRANT ALL ON public.lab_result_versions TO service_role;
GRANT ALL ON public.lab_result_value_versions TO service_role;
GRANT ALL ON public.imaging_order_versions TO service_role;
GRANT ALL ON public.prescription_versions TO service_role;
GRANT ALL ON public.pharmacy_dispense_versions TO service_role;

-- 3. materialized KPI views: remove from Data API, expose via admin-only functions
REVOKE ALL ON public.mv_kpi_revenue_by_dept FROM anon, authenticated;
REVOKE ALL ON public.mv_kpi_occupancy FROM anon, authenticated;
REVOKE ALL ON public.mv_kpi_alos FROM anon, authenticated;
REVOKE ALL ON public.mv_kpi_denial FROM anon, authenticated;
REVOKE ALL ON public.mv_kpi_lab_tat FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.kpi_revenue_by_dept(_since date DEFAULT (CURRENT_DATE - 30))
RETURNS TABLE(dept text, day date, revenue_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN QUERY SELECT m.dept::text, m.day::date, m.revenue_cents::bigint
  FROM public.mv_kpi_revenue_by_dept m WHERE m.day >= _since;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_occupancy()
RETURNS TABLE(ward text, total_beds bigint, occupied bigint, free bigint, cleaning bigint, occupancy_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN QUERY SELECT m.ward::text, m.total_beds::bigint, m.occupied::bigint, m.free::bigint,
                      m.cleaning::bigint, m.occupancy_pct::numeric
  FROM public.mv_kpi_occupancy m ORDER BY m.ward;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_alos()
RETURNS TABLE(alos_days numeric, discharges_30d bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN QUERY SELECT m.alos_days::numeric, m.discharges_30d::bigint FROM public.mv_kpi_alos m;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_denial()
RETURNS TABLE(denied_count bigint, decided_count bigint, denial_pct numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN QUERY SELECT m.denied_count::bigint, m.decided_count::bigint, m.denial_pct::numeric FROM public.mv_kpi_denial m;
END $$;

CREATE OR REPLACE FUNCTION public.kpi_lab_tat()
RETURNS TABLE(tat_minutes numeric, samples_30d bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  RETURN QUERY SELECT m.tat_minutes::numeric, m.samples_30d::bigint FROM public.mv_kpi_lab_tat m;
END $$;

GRANT EXECUTE ON FUNCTION public.kpi_revenue_by_dept(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_occupancy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_alos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_denial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_lab_tat() TO authenticated;

-- 4. SECURITY DEFINER view -> security_invoker
ALTER VIEW public.v_effective_consent SET (security_invoker = on);

-- 5. pin search_path on the three remaining functions
ALTER FUNCTION public.block_version_mutation() SET search_path = public;
ALTER FUNCTION public.set_updated_at_generic() SET search_path = public;
ALTER FUNCTION public.calc_leave_days(date, date) SET search_path = public;
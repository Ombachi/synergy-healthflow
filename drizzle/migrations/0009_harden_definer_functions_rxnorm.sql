CREATE OR REPLACE FUNCTION public.patient_directory()
 RETURNS TABLE(id uuid, full_name text, medical_record_number text, date_of_birth date, gender text, phone text, allergies text, id_number text, id_type text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.medical_record_number, p.date_of_birth, p.gender, p.phone,
         p.allergies, p.id_number, p.id_type
  FROM public.patients p
  WHERE public.is_staff_member()
    AND p.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.user_id AND r.role NOT IN ('patient','athlete'))
  ORDER BY p.full_name
$$;
REVOKE EXECUTE ON FUNCTION public.patient_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_directory() TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_patient_ids()
 RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.id FROM public.patients p
  JOIN public.user_roles r ON r.user_id = p.user_id
  WHERE public.is_staff_member() AND r.role NOT IN ('patient','athlete')
$$;
REVOKE EXECUTE ON FUNCTION public.staff_patient_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_patient_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_suggestions()
 RETURNS TABLE(item_id uuid, name text, sku text, category text, quantity integer, reorder_threshold integer, suggested_qty integer, supplier text, unit_price_cents integer)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$
  SELECT i.id, i.name, i.sku, i.category, i.quantity, i.reorder_threshold,
         GREATEST(coalesce(i.reorder_threshold,0) * 2 - coalesce(i.quantity,0), 1)::int,
         i.supplier, i.unit_price_cents
  FROM public.inventory_items i
  WHERE coalesce(i.quantity,0) <= coalesce(i.reorder_threshold,0)
  ORDER BY (coalesce(i.quantity,0) - coalesce(i.reorder_threshold,0)) ASC, i.name;
$$;
REVOKE EXECUTE ON FUNCTION public.reorder_suggestions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_suggestions() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_messageable_users()
 RETURNS TABLE(id uuid, full_name text, role app_role)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, ur.role
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (public.is_staff_member() OR ur.role NOT IN ('patient','athlete'))
$$;
REVOKE EXECUTE ON FUNCTION public.list_messageable_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_messageable_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.recompute_abp_baseline(_athlete uuid, _marker text, _n integer DEFAULT 6)
 RETURNS abp_baselines LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _mean numeric; _sd numeric; _cnt int; _units text; _row public.abp_baselines;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
       OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'lab_tech')) THEN
    RAISE EXCEPTION 'Not authorised to recompute baselines' USING ERRCODE = '42501';
  END IF;
  SELECT avg(value), coalesce(stddev_samp(value),0), count(*), max(units)
    INTO _mean, _sd, _cnt, _units
  FROM (SELECT value, units FROM public.abp_biomarkers
        WHERE athlete_id = _athlete AND marker = _marker
        ORDER BY measured_at DESC LIMIT GREATEST(_n, 2)) t;
  IF _cnt IS NULL OR _cnt = 0 THEN RAISE EXCEPTION 'No % values recorded for this athlete', _marker; END IF;
  INSERT INTO public.abp_baselines (athlete_id, marker, units, n_samples, mean_value, sd_value, personal_low, personal_high, status)
  VALUES (_athlete, _marker, _units, _cnt, round(_mean,3), round(_sd,3), round(_mean - 3*_sd, 3), round(_mean + 3*_sd, 3), 'draft')
  ON CONFLICT (athlete_id, marker) DO UPDATE SET
    units = EXCLUDED.units, n_samples = EXCLUDED.n_samples, mean_value = EXCLUDED.mean_value,
    sd_value = EXCLUDED.sd_value, personal_low = EXCLUDED.personal_low,
    personal_high = EXCLUDED.personal_high, status = 'draft', approved_at = NULL, approved_by = NULL, updated_at = now()
  RETURNING * INTO _row;
  RETURN _row;
END; $$;
REVOKE EXECUTE ON FUNCTION public.recompute_abp_baseline(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_abp_baseline(uuid, text, integer) TO authenticated;

DROP POLICY IF EXISTS rxnorm_insert ON public.rxnorm_concepts;
CREATE POLICY rxnorm_insert ON public.rxnorm_concepts FOR INSERT TO authenticated WITH CHECK (public.is_staff_member());
DROP POLICY IF EXISTS rxnorm_update ON public.rxnorm_concepts;
CREATE POLICY rxnorm_update ON public.rxnorm_concepts FOR UPDATE TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());
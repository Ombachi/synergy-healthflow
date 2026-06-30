
CREATE OR REPLACE FUNCTION public.abp_marker_trend(_athlete uuid, _marker text)
RETURNS TABLE(n int, first_value numeric, last_value numeric, mean_value numeric,
              pct_change numeric, slope_per_day numeric, rolling3 numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
WITH s AS (
  SELECT value, measured_at,
         row_number() OVER (ORDER BY measured_at) AS rn
  FROM public.abp_biomarkers WHERE athlete_id=_athlete AND marker=_marker
), c AS (SELECT count(*)::int AS cnt FROM s),
last3 AS (SELECT avg(value) AS r3 FROM (SELECT value FROM s ORDER BY rn DESC LIMIT 3) t)
SELECT
  (SELECT cnt FROM c),
  (SELECT value FROM s WHERE rn=1),
  (SELECT value FROM s ORDER BY rn DESC LIMIT 1),
  (SELECT avg(value) FROM s),
  CASE WHEN (SELECT value FROM s WHERE rn=1) IS NULL OR (SELECT value FROM s WHERE rn=1)=0 THEN NULL
       ELSE (((SELECT value FROM s ORDER BY rn DESC LIMIT 1) - (SELECT value FROM s WHERE rn=1))
             / (SELECT value FROM s WHERE rn=1))*100 END,
  (SELECT regr_slope(value, EXTRACT(EPOCH FROM measured_at)/86400.0) FROM s),
  (SELECT r3 FROM last3)
$$;

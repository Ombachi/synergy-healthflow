-- 1. Patient identity document
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS id_type text NOT NULL DEFAULT 'national_id',
  ADD COLUMN IF NOT EXISTS id_number text;
CREATE UNIQUE INDEX IF NOT EXISTS patients_id_number_unique
  ON public.patients (lower(id_number)) WHERE id_number IS NOT NULL AND deleted_at IS NULL;

-- 2. MRN continues across months
CREATE OR REPLACE FUNCTION public.assign_patient_mrn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE ym text; prefix text; seq int; candidate text;
BEGIN
  IF NEW.medical_record_number IS NOT NULL AND length(trim(NEW.medical_record_number)) > 0 THEN RETURN NEW; END IF;
  ym := to_char(COALESCE(NEW.created_at, now()), 'YYYYMM');
  prefix := 'LITU-' || ym || '-';
  -- global running counter across every month
  SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(medical_record_number, '-', 3), '[^0-9]', '', 'g'), '')::int), 0) + 1
    INTO seq
  FROM public.patients WHERE medical_record_number LIKE 'LITU-%';
  candidate := prefix || lpad(seq::text, 3, '0');
  WHILE EXISTS (SELECT 1 FROM public.patients WHERE medical_record_number = candidate) LOOP
    seq := seq + 1; candidate := prefix || lpad(seq::text, 3, '0');
  END LOOP;
  NEW.medical_record_number := candidate;
  RETURN NEW;
END; $function$;

-- 3. Temperature log in_range auto-computed
CREATE OR REPLACE FUNCTION public.set_temperature_in_range()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.in_range := COALESCE(
    (NEW.min_c IS NULL OR NEW.temperature_c >= NEW.min_c)
    AND (NEW.max_c IS NULL OR NEW.temperature_c <= NEW.max_c), true);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_temp_in_range ON public.instrument_temperature_logs;
CREATE TRIGGER trg_temp_in_range BEFORE INSERT OR UPDATE ON public.instrument_temperature_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_temperature_in_range();
ALTER TABLE public.instrument_temperature_logs ALTER COLUMN in_range SET DEFAULT true;

-- 4. ABP baselines
CREATE TABLE IF NOT EXISTS public.abp_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  marker text NOT NULL,
  units text,
  n_samples integer NOT NULL DEFAULT 0,
  mean_value numeric,
  sd_value numeric,
  personal_low numeric,
  personal_high numeric,
  population_low numeric,
  population_high numeric,
  status text NOT NULL DEFAULT 'draft',
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, marker)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abp_baselines TO authenticated;
GRANT ALL ON public.abp_baselines TO service_role;
ALTER TABLE public.abp_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read abp_baselines" ON public.abp_baselines FOR SELECT TO authenticated USING (true);
CREATE POLICY "clinical write abp_baselines" ON public.abp_baselines FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'lab_tech'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'lab_tech'));
DROP TRIGGER IF EXISTS trg_abp_baselines_updated ON public.abp_baselines;
CREATE TRIGGER trg_abp_baselines_updated BEFORE UPDATE ON public.abp_baselines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

CREATE OR REPLACE FUNCTION public.recompute_abp_baseline(_athlete uuid, _marker text, _n integer DEFAULT 6)
RETURNS public.abp_baselines LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mean numeric; _sd numeric; _cnt int; _units text; _row public.abp_baselines;
BEGIN
  SELECT avg(value), coalesce(stddev_samp(value),0), count(*), max(units)
    INTO _mean, _sd, _cnt, _units
  FROM (
    SELECT value, units FROM public.abp_biomarkers
    WHERE athlete_id = _athlete AND marker = _marker
    ORDER BY measured_at DESC LIMIT GREATEST(_n, 2)
  ) t;
  IF _cnt IS NULL OR _cnt = 0 THEN RAISE EXCEPTION 'No % values recorded for this athlete', _marker; END IF;

  INSERT INTO public.abp_baselines (athlete_id, marker, units, n_samples, mean_value, sd_value, personal_low, personal_high, status)
  VALUES (_athlete, _marker, _units, _cnt, round(_mean,3), round(_sd,3),
          round(_mean - 3*_sd, 3), round(_mean + 3*_sd, 3), 'draft')
  ON CONFLICT (athlete_id, marker) DO UPDATE SET
    units = EXCLUDED.units, n_samples = EXCLUDED.n_samples, mean_value = EXCLUDED.mean_value,
    sd_value = EXCLUDED.sd_value, personal_low = EXCLUDED.personal_low,
    personal_high = EXCLUDED.personal_high, status = 'draft', approved_at = NULL, approved_by = NULL,
    updated_at = now()
  RETURNING * INTO _row;
  RETURN _row;
END; $$;
GRANT EXECUTE ON FUNCTION public.recompute_abp_baseline(uuid, text, integer) TO authenticated;

-- 5. Auto OFF-score + ABPS from HGB / RET%
CREATE OR REPLACE FUNCTION public.compute_abp_derived()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _hgb numeric; _ret numeric; _off numeric; _abps numeric;
BEGIN
  IF NEW.marker NOT IN ('HGB','RET%') THEN RETURN NEW; END IF;
  SELECT max(value) FILTER (WHERE marker='HGB'), max(value) FILTER (WHERE marker='RET%')
    INTO _hgb, _ret FROM public.abp_biomarkers WHERE sample_id = NEW.sample_id;
  IF _hgb IS NULL OR _ret IS NULL OR _ret <= 0 THEN RETURN NEW; END IF;

  -- OFF-score = Hb(g/L) - 60 * sqrt(RET%)
  _off := round((_hgb * 10) - 60 * sqrt(_ret), 2);
  -- ABPS (approximation): standardised composite of Hb and reticulocyte deviation
  _abps := round(abs((_hgb - 15.0) / 1.2) * 0.5 + abs((_ret - 1.2) / 0.5) * 0.5, 3);

  INSERT INTO public.abp_biomarkers (sample_id, athlete_id, marker, value, units, reference_low, reference_high, measured_at)
  VALUES (NEW.sample_id, NEW.athlete_id, 'OFF-score', _off, '', 60, 130, NEW.measured_at)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.abp_biomarkers (sample_id, athlete_id, marker, value, units, reference_low, reference_high, measured_at)
  VALUES (NEW.sample_id, NEW.athlete_id, 'ABPS', _abps, '', 0, 1, NEW.measured_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_abp_derived ON public.abp_biomarkers;
CREATE TRIGGER trg_abp_derived AFTER INSERT ON public.abp_biomarkers
  FOR EACH ROW EXECUTE FUNCTION public.compute_abp_derived();

-- 6. Patient directory excluding staff
CREATE OR REPLACE FUNCTION public.patient_directory()
RETURNS TABLE (id uuid, full_name text, medical_record_number text, date_of_birth date, gender text, phone text, allergies text, id_number text, id_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.full_name, p.medical_record_number, p.date_of_birth, p.gender, p.phone,
         p.allergies, p.id_number, p.id_type
  FROM public.patients p
  WHERE p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = p.user_id AND r.role NOT IN ('patient','athlete')
    )
  ORDER BY p.full_name
$$;
GRANT EXECUTE ON FUNCTION public.patient_directory() TO authenticated;

-- 7. QC panels for analysers
ALTER TABLE public.instrument_qc_runs
  ADD COLUMN IF NOT EXISTS panel text;

CREATE TABLE IF NOT EXISTS public.qc_panels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  section text NOT NULL,
  analytes jsonb NOT NULL DEFAULT '[]'::jsonb,
  levels text[] NOT NULL DEFAULT ARRAY['low','normal','high'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.qc_panels TO authenticated;
GRANT ALL ON public.qc_panels TO service_role;
ALTER TABLE public.qc_panels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read qc_panels" ON public.qc_panels FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write qc_panels" ON public.qc_panels FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

INSERT INTO public.qc_panels (code, name, section, analytes) VALUES
('FBC','Full Haemogram (FBC)','Hematology','[
 {"analyte":"WBC","units":"10^9/L","target":7.5,"sd":0.8},
 {"analyte":"RBC","units":"10^12/L","target":4.8,"sd":0.3},
 {"analyte":"HGB","units":"g/dL","target":14.0,"sd":0.5},
 {"analyte":"HCT","units":"%","target":42.0,"sd":1.5},
 {"analyte":"MCV","units":"fL","target":88.0,"sd":2.0},
 {"analyte":"MCH","units":"pg","target":29.5,"sd":1.0},
 {"analyte":"MCHC","units":"g/dL","target":33.5,"sd":1.0},
 {"analyte":"RDW","units":"%","target":13.0,"sd":0.7},
 {"analyte":"PLT","units":"10^9/L","target":250,"sd":20},
 {"analyte":"MPV","units":"fL","target":9.5,"sd":0.6},
 {"analyte":"NEUT%","units":"%","target":55,"sd":3},
 {"analyte":"LYMPH%","units":"%","target":33,"sd":3},
 {"analyte":"MONO%","units":"%","target":7,"sd":1},
 {"analyte":"EO%","units":"%","target":3,"sd":0.6},
 {"analyte":"BASO%","units":"%","target":0.6,"sd":0.2}
]'::jsonb),
('UEC','Urea, Electrolytes & Creatinine','Chemistry','[
 {"analyte":"Sodium","units":"mmol/L","target":140,"sd":2},
 {"analyte":"Potassium","units":"mmol/L","target":4.2,"sd":0.2},
 {"analyte":"Chloride","units":"mmol/L","target":102,"sd":2},
 {"analyte":"Bicarbonate","units":"mmol/L","target":25,"sd":1.5},
 {"analyte":"Urea","units":"mmol/L","target":5.0,"sd":0.4},
 {"analyte":"Creatinine","units":"umol/L","target":90,"sd":6}
]'::jsonb),
('LFT','Liver Function Tests','Chemistry','[
 {"analyte":"Total Bilirubin","units":"umol/L","target":12,"sd":1.5},
 {"analyte":"Direct Bilirubin","units":"umol/L","target":4,"sd":0.6},
 {"analyte":"ALT","units":"U/L","target":35,"sd":3},
 {"analyte":"AST","units":"U/L","target":32,"sd":3},
 {"analyte":"ALP","units":"U/L","target":95,"sd":7},
 {"analyte":"GGT","units":"U/L","target":38,"sd":4},
 {"analyte":"Total Protein","units":"g/L","target":72,"sd":3},
 {"analyte":"Albumin","units":"g/L","target":42,"sd":2}
]'::jsonb),
('LIPID','Lipid Profile','Chemistry','[
 {"analyte":"Total Cholesterol","units":"mmol/L","target":4.8,"sd":0.25},
 {"analyte":"Triglycerides","units":"mmol/L","target":1.4,"sd":0.15},
 {"analyte":"HDL","units":"mmol/L","target":1.3,"sd":0.1},
 {"analyte":"LDL","units":"mmol/L","target":2.9,"sd":0.2}
]'::jsonb),
('GLU','Glucose & HbA1c','Chemistry','[
 {"analyte":"Glucose","units":"mmol/L","target":5.5,"sd":0.3},
 {"analyte":"HbA1c","units":"%","target":5.6,"sd":0.2}
]'::jsonb)
ON CONFLICT (code) DO NOTHING;
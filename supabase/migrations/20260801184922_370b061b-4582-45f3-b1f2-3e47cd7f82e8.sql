-- ============ CRITICAL RESULTS REGISTER ============
CREATE TABLE public.critical_result_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.lab_orders(id) ON DELETE CASCADE,
  value_id uuid,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id uuid,
  parameter_name text NOT NULL,
  value_text text,
  units text,
  reference_range text,
  abnormal_flag text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  notified_to text,
  notified_at timestamptz,
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cra_status ON public.critical_result_alerts(status, detected_at DESC);
CREATE INDEX idx_cra_patient ON public.critical_result_alerts(patient_id);
CREATE UNIQUE INDEX idx_cra_value ON public.critical_result_alerts(value_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.critical_result_alerts TO authenticated;
GRANT ALL ON public.critical_result_alerts TO service_role;
ALTER TABLE public.critical_result_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read critical alerts" ON public.critical_result_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "clinical staff write critical alerts" ON public.critical_result_alerts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_cra_updated BEFORE UPDATE ON public.critical_result_alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- auto-register critical lab values
CREATE OR REPLACE FUNCTION public.register_critical_result()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _patient uuid; _visit uuid;
BEGIN
  IF NEW.abnormal_flag IS NULL OR NEW.abnormal_flag NOT IN ('critical low','critical high') THEN
    RETURN NEW;
  END IF;
  SELECT o.patient_id, o.visit_id INTO _patient, _visit FROM public.lab_orders o WHERE o.id = NEW.order_id;
  INSERT INTO public.critical_result_alerts
    (order_id, value_id, patient_id, visit_id, parameter_name, value_text, units, reference_range, abnormal_flag)
  VALUES (NEW.order_id, NEW.id, _patient, _visit, NEW.parameter_name, NEW.value_text, NEW.units, NEW.reference_range, NEW.abnormal_flag)
  ON CONFLICT (value_id) DO UPDATE
    SET value_text = EXCLUDED.value_text, abnormal_flag = EXCLUDED.abnormal_flag, updated_at = now();
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_register_critical_value
AFTER INSERT OR UPDATE OF abnormal_flag, value_text ON public.lab_result_values
FOR EACH ROW EXECUTE FUNCTION public.register_critical_result();

-- backfill existing critical values
INSERT INTO public.critical_result_alerts
  (order_id, value_id, patient_id, visit_id, parameter_name, value_text, units, reference_range, abnormal_flag, detected_at)
SELECT v.order_id, v.id, o.patient_id, o.visit_id, v.parameter_name, v.value_text, v.units, v.reference_range, v.abnormal_flag, COALESCE(v.created_at, now())
FROM public.lab_result_values v
JOIN public.lab_orders o ON o.id = v.order_id
WHERE v.abnormal_flag IN ('critical low','critical high')
ON CONFLICT (value_id) DO NOTHING;

-- ============ INSTRUMENTS / ANALYZERS ============
CREATE TABLE public.instruments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  manufacturer text,
  model text,
  serial_number text,
  asset_tag text,
  location text,
  lab_section text NOT NULL DEFAULT 'Chemistry',
  modality text NOT NULL DEFAULT 'laboratory',
  status text NOT NULL DEFAULT 'active',
  commissioned_on date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instruments TO authenticated;
GRANT ALL ON public.instruments TO service_role;
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read instruments" ON public.instruments FOR SELECT TO authenticated USING (true);
CREATE POLICY "lab staff write instruments" ON public.instruments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'radiologist') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'radiologist') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_instruments_updated BEFORE UPDATE ON public.instruments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

CREATE TABLE public.instrument_qc_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  analyte text NOT NULL,
  qc_level text NOT NULL DEFAULT 'Level 1',
  lot_number text,
  target_value numeric,
  sd numeric,
  observed_value numeric,
  z_score numeric,
  result text NOT NULL DEFAULT 'pass',
  performed_by uuid,
  comments text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instrument_calibrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  calibrated_at timestamptz NOT NULL DEFAULT now(),
  analyte text,
  method text,
  calibrator_lot text,
  outcome text NOT NULL DEFAULT 'passed',
  next_due date,
  performed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instrument_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  performed_at timestamptz NOT NULL DEFAULT now(),
  task_type text NOT NULL DEFAULT 'daily',
  description text NOT NULL,
  outcome text,
  next_due date,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instrument_reagents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  name text NOT NULL,
  lot_number text,
  quantity numeric NOT NULL DEFAULT 0,
  unit text,
  received_on date,
  expiry_date date,
  status text NOT NULL DEFAULT 'in_use',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instrument_temperature_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  temperature_c numeric NOT NULL,
  min_c numeric,
  max_c numeric,
  in_range boolean NOT NULL DEFAULT true,
  recorded_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instrument_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'minor',
  downtime_minutes integer NOT NULL DEFAULT 0,
  resolved_at timestamptz,
  resolution text,
  reported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.instrument_service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id uuid NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  service_date date NOT NULL DEFAULT current_date,
  vendor text,
  engineer text,
  service_type text NOT NULL DEFAULT 'preventive',
  cost_cents integer NOT NULL DEFAULT 0,
  report_ref text,
  next_service_due date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instrument_qc_runs','instrument_calibrations','instrument_maintenance','instrument_reagents','instrument_temperature_logs','instrument_incidents','instrument_service_history']
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "staff read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format($p$CREATE POLICY "lab staff write %1$s" ON public.%1$I FOR ALL TO authenticated
      USING (public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'radiologist') OR public.has_role(auth.uid(),'admin'))
      WITH CHECK (public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'radiologist') OR public.has_role(auth.uid(),'admin'))$p$, t);
    EXECUTE format('CREATE INDEX idx_%1$s_instrument ON public.%1$I(instrument_id)', t);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic()', t);
  END LOOP;
END $$;

-- link lab orders to the analyzer that ran them (for testing statistics)
ALTER TABLE public.lab_orders ADD COLUMN IF NOT EXISTS instrument_id uuid REFERENCES public.instruments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_lab_orders_instrument ON public.lab_orders(instrument_id);

-- seed a starter analyzer fleet
INSERT INTO public.instruments (name, manufacturer, model, serial_number, asset_tag, location, lab_section, modality, status, commissioned_on)
VALUES
  ('Hematology Analyzer 1','Sysmex','XN-550','SYS-XN550-0142','LAB-AST-001','Main Laboratory','Hematology','laboratory','active','2023-03-14'),
  ('Chemistry Analyzer 1','Roche','Cobas c311','ROC-C311-8871','LAB-AST-002','Main Laboratory','Chemistry','laboratory','active','2022-11-02'),
  ('Immunoassay Analyzer','Abbott','Architect i1000SR','ABB-I1000-3390','LAB-AST-003','Serology Bench','Immunology','laboratory','active','2024-01-20'),
  ('Blood Culture System','BioMerieux','BacT/ALERT 3D','BMX-BA3D-2210','LAB-AST-004','Microbiology Room','Microbiology','laboratory','active','2021-08-09'),
  ('Coagulation Analyzer','Stago','START Max','STG-SMAX-5521','LAB-AST-005','Main Laboratory','Coagulation','laboratory','maintenance','2020-06-17'),
  ('Reagent Refrigerator','Haier','HYC-360','HAI-360-1188','LAB-AST-006','Cold Store','Chemistry','laboratory','active','2023-05-30'),
  ('Digital X-Ray Unit','Siemens','Ysio Max','SIE-YSIO-7742','RAD-AST-001','Radiology Suite 1','Radiography','radiology','active','2022-02-11'),
  ('Ultrasound Scanner','GE Healthcare','Voluson S8','GE-VS8-6650','RAD-AST-002','Radiology Suite 2','Ultrasound','radiology','active','2023-09-05'),
  ('CT Scanner','Philips','Incisive CT','PHI-INC-9001','RAD-AST-003','Imaging Wing','CT','radiology','active','2024-04-18');

-- 1. Fix dispense CDR trigger (rx.prescribed_by does not exist on prescriptions)
CREATE OR REPLACE FUNCTION public.post_cdr_on_dispense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_med TEXT; v_sched TEXT; v_patient UUID; v_prescriber UUID; v_bal NUMERIC;
BEGIN
  SELECT rx.medication, v.patient_id, rx.created_by
    INTO v_med, v_patient, v_prescriber
    FROM prescriptions rx JOIN visits v ON v.id = rx.visit_id
    WHERE rx.id = NEW.prescription_id;
  SELECT controlled_schedule INTO v_sched FROM drug_catalog WHERE name ILIKE v_med LIMIT 1;
  IF v_sched IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(balance_after,0) - COALESCE(NEW.quantity,1)
    INTO v_bal FROM controlled_drug_register
    WHERE drug_name = v_med ORDER BY created_at DESC LIMIT 1;
  INSERT INTO controlled_drug_register(drug_name, schedule, direction, qty, balance_after,
    patient_id, prescriber_id, dispenser_id, ref_table, ref_id)
  VALUES (v_med, v_sched, 'dispense', COALESCE(NEW.quantity,1), COALESCE(v_bal, -COALESCE(NEW.quantity,1)),
    v_patient, v_prescriber, auth.uid(), 'pharmacy_dispenses', NEW.id);
  RETURN NEW;
END $$;

-- 2. Add missing updated_at on service_catalog (trigger fires without column)
ALTER TABLE public.service_catalog ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Extend lab template with dimensions and auto-formula
ALTER TABLE public.lab_result_templates
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS age_group TEXT,
  ADD COLUMN IF NOT EXISTS auto_formula TEXT;

-- Helper: seed template rows keyed by test code (idempotent per (test_id, parameter_name, gender, age_group))
CREATE OR REPLACE FUNCTION public.seed_lab_tpl(
  p_code TEXT, p_param TEXT, p_units TEXT, p_ref TEXT,
  p_low NUMERIC, p_high NUMERIC, p_clow NUMERIC, p_chigh NUMERIC,
  p_input TEXT, p_options TEXT, p_gender TEXT, p_age TEXT,
  p_order INT, p_formula TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_test_id UUID;
BEGIN
  SELECT id INTO v_test_id FROM lab_tests_catalog WHERE code = p_code LIMIT 1;
  IF v_test_id IS NULL THEN RETURN; END IF;
  DELETE FROM lab_result_templates
    WHERE test_id = v_test_id
      AND parameter_name = p_param
      AND COALESCE(gender,'') = COALESCE(p_gender,'')
      AND COALESCE(age_group,'') = COALESCE(p_age,'');
  INSERT INTO lab_result_templates
    (test_id, parameter_name, units, reference_range, reference_low, reference_high,
     critical_low, critical_high, input_type, select_options, gender, age_group, display_order, auto_formula)
  VALUES (v_test_id, p_param, p_units, p_ref, p_low, p_high, p_clow, p_chigh,
     p_input, p_options, p_gender, p_age, p_order, p_formula);
END $$;

-- 4. Blood group (create catalog entry if missing)
INSERT INTO public.lab_tests_catalog (code, name, specimen, container)
SELECT 'BGRP', 'Blood Group & Rh', 'Whole blood', 'EDTA'
WHERE NOT EXISTS (SELECT 1 FROM public.lab_tests_catalog WHERE code = 'BGRP');

SELECT seed_lab_tpl('BGRP','ABO Group',NULL,NULL,NULL,NULL,NULL,NULL,'select','A, B, AB, O',NULL,NULL,0,NULL);
SELECT seed_lab_tpl('BGRP','Rh(D) Factor',NULL,NULL,NULL,NULL,NULL,NULL,'select','Positive, Negative',NULL,NULL,1,NULL);
SELECT seed_lab_tpl('BGRP','Blood Group (Combined)',NULL,NULL,NULL,NULL,NULL,NULL,'select','A+, A-, B+, B-, AB+, AB-, O+, O-',NULL,NULL,2,NULL);

-- 5. HbA1c IFCC auto-calc (IFCC mmol/mol = (HbA1c% - 2.15) * 10.929)
DELETE FROM public.lab_result_templates rt
USING public.lab_tests_catalog t
WHERE rt.test_id = t.id AND t.code = 'HBA1C';
SELECT seed_lab_tpl('HBA1C','HbA1c','%','4.0 - 5.6',4.0,5.6,NULL,15.0,'numeric',NULL,NULL,NULL,0,NULL);
SELECT seed_lab_tpl('HBA1C','HbA1c IFCC','mmol/mol','20 - 38',20,38,NULL,140,'numeric',NULL,NULL,NULL,1,'ifcc_from_hba1c');
SELECT seed_lab_tpl('HBA1C','Estimated Average Glucose','mg/dL','80 - 120',80,120,NULL,300,'numeric',NULL,NULL,NULL,2,'eag_from_hba1c');

-- 6. Haemoglobin dimension-aware (adult M, adult F, child)
DELETE FROM public.lab_result_templates rt
USING public.lab_tests_catalog t
WHERE rt.test_id = t.id AND t.code = 'HB';
SELECT seed_lab_tpl('HB','Haemoglobin','g/dL','13.5 - 17.5',13.5,17.5,7,20,'numeric',NULL,'male','adult',0,NULL);
SELECT seed_lab_tpl('HB','Haemoglobin','g/dL','12.0 - 15.5',12.0,15.5,7,20,'numeric',NULL,'female','adult',0,NULL);
SELECT seed_lab_tpl('HB','Haemoglobin','g/dL','11.0 - 14.0',11.0,14.0,7,20,'numeric',NULL,NULL,'child',0,NULL);

-- 7. Reactive / Non-reactive serology templates
INSERT INTO public.lab_tests_catalog (code, name, specimen, container)
SELECT v.code, v.name, 'Serum', 'SST'
FROM (VALUES
  ('HBSAG','Hepatitis B Surface Antigen (HBsAg)'),
  ('HCVAB','Hepatitis C Antibody'),
  ('VDRL','VDRL / RPR (Syphilis)'),
  ('WIDAL','Widal Test'),
  ('HPYL','H. pylori Antibody')
) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM public.lab_tests_catalog WHERE code = v.code);

SELECT seed_lab_tpl('HBSAG','HBsAg',NULL,NULL,NULL,NULL,NULL,NULL,'select','Reactive, Non-reactive, Indeterminate',NULL,NULL,0,NULL);
SELECT seed_lab_tpl('HCVAB','Anti-HCV',NULL,NULL,NULL,NULL,NULL,NULL,'select','Reactive, Non-reactive, Indeterminate',NULL,NULL,0,NULL);
SELECT seed_lab_tpl('VDRL','VDRL/RPR',NULL,NULL,NULL,NULL,NULL,NULL,'select','Reactive, Non-reactive',NULL,NULL,0,NULL);
SELECT seed_lab_tpl('VDRL','Titre',NULL,NULL,NULL,NULL,NULL,NULL,'select','1:1, 1:2, 1:4, 1:8, 1:16, 1:32, 1:64, 1:128, 1:256, Not applicable',NULL,NULL,1,NULL);
SELECT seed_lab_tpl('HPYL','H. pylori Antibody',NULL,NULL,NULL,NULL,NULL,NULL,'select','Positive, Negative, Equivocal',NULL,NULL,0,NULL);

-- Widal antigens
SELECT seed_lab_tpl('WIDAL','S. typhi O',NULL,NULL,NULL,NULL,NULL,NULL,'select','Negative, 1:80, 1:160, 1:320, 1:640',NULL,NULL,0,NULL);
SELECT seed_lab_tpl('WIDAL','S. typhi H',NULL,NULL,NULL,NULL,NULL,NULL,'select','Negative, 1:80, 1:160, 1:320, 1:640',NULL,NULL,1,NULL);
SELECT seed_lab_tpl('WIDAL','S. paratyphi AH',NULL,NULL,NULL,NULL,NULL,NULL,'select','Negative, 1:80, 1:160, 1:320',NULL,NULL,2,NULL);
SELECT seed_lab_tpl('WIDAL','S. paratyphi BH',NULL,NULL,NULL,NULL,NULL,NULL,'select','Negative, 1:80, 1:160, 1:320',NULL,NULL,3,NULL);

-- HIV5 as reactive/non-reactive select (replace numeric if any)
DELETE FROM public.lab_result_templates rt USING public.lab_tests_catalog t
WHERE rt.test_id = t.id AND t.code = 'HIV5';
SELECT seed_lab_tpl('HIV5','HIV Ag/Ab (5th Gen)',NULL,NULL,NULL,NULL,NULL,NULL,'select','Reactive, Non-reactive, Indeterminate',NULL,NULL,0,NULL);

-- 8. Positive/Negative RDTs
INSERT INTO public.lab_tests_catalog (code, name, specimen, container)
SELECT v.code, v.name, v.spec, v.cont
FROM (VALUES
  ('PSTRIP','Pregnancy strip (urine hCG)','Urine','Sterile container'),
  ('MRDT','Malaria RDT','Whole blood','EDTA'),
  ('FOB','Stool occult blood','Stool','Stool container')
) AS v(code, name, spec, cont)
WHERE NOT EXISTS (SELECT 1 FROM public.lab_tests_catalog WHERE code = v.code);
SELECT seed_lab_tpl('PSTRIP','Urine hCG',NULL,NULL,NULL,NULL,NULL,NULL,'select','Positive, Negative',NULL,NULL,0,NULL);
SELECT seed_lab_tpl('MRDT','Malaria RDT',NULL,NULL,NULL,NULL,NULL,NULL,'select','Positive (P. falciparum), Positive (P. vivax), Positive (Mixed), Negative',NULL,NULL,0,NULL);
SELECT seed_lab_tpl('FOB','Faecal occult blood',NULL,NULL,NULL,NULL,NULL,NULL,'select','Positive, Negative',NULL,NULL,0,NULL);

-- 9. Thyroid function
INSERT INTO public.lab_tests_catalog (code, name, specimen, container)
SELECT v.code, v.name, 'Serum', 'SST'
FROM (VALUES ('TFT','Thyroid Function Test'), ('TSH','TSH')) AS v(code, name)
WHERE NOT EXISTS (SELECT 1 FROM public.lab_tests_catalog WHERE code = v.code);
SELECT seed_lab_tpl('TFT','TSH','mIU/L','0.4 - 4.0',0.4,4.0,0.05,20,'numeric',NULL,NULL,'adult',0,NULL);
SELECT seed_lab_tpl('TFT','Free T4','pmol/L','9.0 - 25.0',9,25,NULL,NULL,'numeric',NULL,NULL,'adult',1,NULL);
SELECT seed_lab_tpl('TFT','Free T3','pmol/L','3.5 - 6.5',3.5,6.5,NULL,NULL,'numeric',NULL,NULL,'adult',2,NULL);
SELECT seed_lab_tpl('TFT','TSH','mIU/L','1.0 - 6.0',1.0,6.0,NULL,NULL,'numeric',NULL,NULL,'child',3,NULL);
SELECT seed_lab_tpl('TSH','TSH','mIU/L','0.4 - 4.0',0.4,4.0,0.05,20,'numeric',NULL,NULL,'adult',0,NULL);
SELECT seed_lab_tpl('TSH','TSH','mIU/L','1.0 - 6.0',1.0,6.0,NULL,NULL,'numeric',NULL,NULL,'child',1,NULL);

-- 10. Urinalysis dipstick expansion (replace single param)
DELETE FROM public.lab_result_templates rt USING public.lab_tests_catalog t
WHERE rt.test_id = t.id AND t.code = 'UA';
SELECT seed_lab_tpl('UA','Colour',NULL,'Straw / Yellow',NULL,NULL,NULL,NULL,'select','Straw, Yellow, Amber, Red, Brown, Cloudy',NULL,NULL,0,NULL);
SELECT seed_lab_tpl('UA','Appearance',NULL,'Clear',NULL,NULL,NULL,NULL,'select','Clear, Slightly turbid, Turbid',NULL,NULL,1,NULL);
SELECT seed_lab_tpl('UA','pH',NULL,'4.5 - 8.0',4.5,8.0,NULL,NULL,'numeric',NULL,NULL,NULL,2,NULL);
SELECT seed_lab_tpl('UA','Specific gravity',NULL,'1.005 - 1.030',1.005,1.030,NULL,NULL,'numeric',NULL,NULL,NULL,3,NULL);
SELECT seed_lab_tpl('UA','Leukocytes',NULL,'Negative',NULL,NULL,NULL,NULL,'select','Negative, Trace, 1+, 2+, 3+',NULL,NULL,4,NULL);
SELECT seed_lab_tpl('UA','Nitrites',NULL,'Negative',NULL,NULL,NULL,NULL,'select','Negative, Positive',NULL,NULL,5,NULL);
SELECT seed_lab_tpl('UA','Protein',NULL,'Negative',NULL,NULL,NULL,NULL,'select','Negative, Trace, 1+, 2+, 3+, 4+',NULL,NULL,6,NULL);
SELECT seed_lab_tpl('UA','Glucose',NULL,'Negative',NULL,NULL,NULL,NULL,'select','Negative, Trace, 1+, 2+, 3+, 4+',NULL,NULL,7,NULL);
SELECT seed_lab_tpl('UA','Ketones',NULL,'Negative',NULL,NULL,NULL,NULL,'select','Negative, Trace, Small, Moderate, Large',NULL,NULL,8,NULL);
SELECT seed_lab_tpl('UA','Blood',NULL,'Negative',NULL,NULL,NULL,NULL,'select','Negative, Trace, 1+, 2+, 3+',NULL,NULL,9,NULL);
SELECT seed_lab_tpl('UA','Bilirubin',NULL,'Negative',NULL,NULL,NULL,NULL,'select','Negative, Small, Moderate, Large',NULL,NULL,10,NULL);
SELECT seed_lab_tpl('UA','Urobilinogen',NULL,'Normal',NULL,NULL,NULL,NULL,'select','Normal, 1+, 2+, 3+, 4+',NULL,NULL,11,NULL);

DROP FUNCTION public.seed_lab_tpl(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, INT, TEXT);

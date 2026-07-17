-- Seed lab_result_templates for common individual chemistry, hormone, tumor marker,
-- coagulation, and haematology tests that currently have no template.
-- Each row: parameter_name, units, reference_low/high (adult defaults),
-- critical_low/high where relevant, input_type=numeric.
-- Uses INSERT ... SELECT with WHERE NOT EXISTS to be idempotent.

WITH t AS (
  SELECT id, name FROM public.lab_tests_catalog
)
INSERT INTO public.lab_result_templates
  (test_id, parameter_name, units, reference_low, reference_high, critical_low, critical_high, input_type, display_order)
SELECT t.id, x.parameter_name, x.units, x.rlow, x.rhigh, x.clow, x.chigh, 'numeric', 1
FROM t
JOIN (VALUES
  -- Chemistry
  ('Albumin','Albumin','g/L',35::numeric,50::numeric,NULL::numeric,NULL::numeric),
  ('ALT (Alanine Aminotransferase)','ALT','U/L',NULL,56,NULL,NULL),
  ('Alkaline Phosphatase','ALP','U/L',44,147,NULL,NULL),
  ('Alpha Feto Protein','AFP','ng/mL',NULL,10,NULL,NULL),
  ('Amylase','Amylase','U/L',30,110,NULL,NULL),
  ('Lipase','Lipase','U/L',10,140,NULL,NULL),
  ('Sodium','Sodium (Na+)','mmol/L',135,145,120,160),
  ('Potassium','Potassium (K+)','mmol/L',3.5,5.1,2.8,6.2),
  ('Chloride','Chloride (Cl-)','mmol/L',98,107,NULL,NULL),
  ('Phosphate','Phosphate','mmol/L',0.81,1.45,NULL,NULL),
  ('Creatinine','Creatinine','umol/L',53,115,NULL,NULL),
  ('Urea','Urea','mmol/L',2.5,7.8,NULL,25),
  -- Cardiac
  ('Troponin I','Troponin I','ng/mL',NULL,0.04,NULL,NULL),
  ('B-type Natriuretic Peptide','BNP','pg/mL',NULL,100,NULL,NULL),
  -- Coagulation
  ('INR','INR','ratio',0.8,1.2,NULL,5),
  ('Fibrinogen','Fibrinogen','g/L',2.0,4.0,NULL,NULL),
  -- Iron studies / haematinics
  ('Ferritin','Ferritin','ng/mL',30,400,NULL,NULL),
  ('Iron','Iron','umol/L',10,30,NULL,NULL),
  ('Reticulocyte Count','Reticulocytes','%',0.5,2.5,NULL,NULL),
  -- Endocrine
  ('Free T4','Free T4','pmol/L',12,22,NULL,NULL),
  ('Free T3','Free T3','pmol/L',3.1,6.8,NULL,NULL),
  ('Prolactin','Prolactin','ng/mL',3,25,NULL,NULL),
  ('Testosterone','Testosterone','nmol/L',9,30,NULL,NULL),
  ('Cortisol','Cortisol (AM)','nmol/L',140,690,NULL,NULL),
  -- Tumor marker
  ('CA 19-9','CA 19-9','U/mL',NULL,37,NULL,NULL),
  -- Enzyme deficiency (qualitative kept numeric activity)
  ('G6PD','G6PD Activity','U/g Hb',7,20,NULL,NULL)
) AS x(test_name, parameter_name, units, rlow, rhigh, clow, chigh)
  ON t.name = x.test_name
WHERE NOT EXISTS (
  SELECT 1 FROM public.lab_result_templates prev WHERE prev.test_id = t.id
);

-- 1) Backfill sensible defaults on drug_catalog so every drug has a
--    default dose / frequency / duration / instructions for prescribers.
UPDATE public.drug_catalog SET
  default_dose = COALESCE(default_dose,
    CASE
      WHEN lower(drug_name) LIKE '%tablet%'    THEN '1 tablet'
      WHEN lower(drug_name) LIKE '%capsule%'   THEN '1 capsule'
      WHEN lower(drug_name) LIKE '%syrup%'
        OR lower(drug_name) LIKE '%suspension%' THEN '5 ml'
      WHEN lower(drug_name) LIKE '%injection%'
        OR lower(drug_name) LIKE '%vial%'
        OR lower(drug_name) LIKE '%ampoule%'   THEN '1 ampoule (IM/IV)'
      WHEN lower(drug_name) LIKE '%cream%'
        OR lower(drug_name) LIKE '%ointment%'
        OR lower(drug_name) LIKE '%gel%'       THEN 'Apply thin layer'
      WHEN lower(drug_name) LIKE '%drops%'
        OR lower(drug_name) LIKE '%eye %'
        OR lower(drug_name) LIKE '%ear %'      THEN '1–2 drops per eye/ear'
      WHEN lower(drug_name) LIKE '%inhaler%'
        OR lower(drug_name) LIKE '%nebul%'     THEN '1–2 puffs'
      WHEN lower(drug_name) LIKE '%suppository%'
        OR lower(drug_name) LIKE '%pessary%'   THEN '1 suppository/pessary'
      ELSE 'As per weight/BSA'
    END),
  default_frequency = COALESCE(default_frequency,
    CASE
      WHEN lower(drug_name) LIKE '%cream%'
        OR lower(drug_name) LIKE '%ointment%'
        OR lower(drug_name) LIKE '%gel%'       THEN 'BD (twice daily)'
      WHEN lower(drug_name) LIKE '%inhaler%'
        OR lower(drug_name) LIKE '%nebul%'     THEN 'QID (four times a day) or PRN'
      WHEN lower(drug_name) LIKE '%injection%' THEN 'STAT then as prescribed'
      WHEN lower(drug_name) LIKE '%syrup%'
        OR lower(drug_name) LIKE '%suspension%' THEN 'TDS (three times a day)'
      ELSE 'TDS (three times a day)'
    END),
  default_duration = COALESCE(default_duration,
    CASE
      WHEN medication_class ILIKE '%antibiotic%'
        OR medication_class ILIKE '%penicillin%'
        OR medication_class ILIKE '%cephalosporin%'
        OR medication_class ILIKE '%macrolide%' THEN '5–7 days (complete course)'
      WHEN medication_class ILIKE '%analgesic%'
        OR medication_class ILIKE '%nsaid%'    THEN '3–5 days PRN'
      WHEN medication_class ILIKE '%antimalarial%' THEN '3 days'
      WHEN medication_class ILIKE '%proton pump%' THEN '2–4 weeks'
      WHEN medication_class ILIKE '%antidiabetic%' THEN 'Long-term (review)'
      ELSE '5 days'
    END),
  instructions = COALESCE(instructions,
    CASE
      WHEN medication_class ILIKE '%nsaid%'
        OR medication_class ILIKE '%analgesic%' THEN 'Take with food to reduce GI upset.'
      WHEN medication_class ILIKE '%antibiotic%'
        OR medication_class ILIKE '%penicillin%'
        OR medication_class ILIKE '%cephalosporin%'
        OR medication_class ILIKE '%macrolide%' THEN 'Complete the full course even if you feel better.'
      WHEN medication_class ILIKE '%proton pump%' THEN 'Take 30 minutes before breakfast.'
      WHEN medication_class ILIKE '%antihistamine%' THEN 'May cause drowsiness; avoid driving.'
      WHEN lower(drug_name) LIKE '%inhaler%' THEN 'Shake well; exhale, seal lips, inhale slowly, hold 10s.'
      WHEN lower(drug_name) LIKE '%cream%'
        OR lower(drug_name) LIKE '%ointment%'
        OR lower(drug_name) LIKE '%gel%' THEN 'Apply to clean, dry affected area only.'
      ELSE 'Take exactly as directed. Report any side-effects.'
    END)
WHERE default_dose IS NULL OR default_frequency IS NULL OR default_duration IS NULL OR instructions IS NULL;

-- 2) Seed lab result templates for common tests. Only insert when the
--    test exists in the catalog and no template rows already exist for it.
DO $$
DECLARE
  t_id uuid;
  rows int;
  test_specs jsonb := '[
    {
      "match": ["Complete Blood Count","CBC","Full Blood Count","FBC","Haemogram"],
      "params": [
        {"name":"White Blood Cells (WBC)","units":"x10^9/L","ref":"4.0–11.0","low":4.0,"high":11.0,"clow":1.0,"chigh":30.0},
        {"name":"Red Blood Cells (RBC)","units":"x10^12/L","ref":"4.5–5.9","low":4.5,"high":5.9,"clow":2.5,"chigh":7.0},
        {"name":"Haemoglobin (Hb)","units":"g/dL","ref":"13.0–17.0 (M) / 12.0–15.0 (F)","low":12.0,"high":17.0,"clow":6.0,"chigh":20.0},
        {"name":"Haematocrit (HCT)","units":"%","ref":"36–52","low":36,"high":52,"clow":18,"chigh":60},
        {"name":"MCV","units":"fL","ref":"80–100","low":80,"high":100,"clow":60,"chigh":120},
        {"name":"MCH","units":"pg","ref":"27–33","low":27,"high":33,"clow":20,"chigh":40},
        {"name":"MCHC","units":"g/dL","ref":"32–36","low":32,"high":36,"clow":25,"chigh":40},
        {"name":"Platelets","units":"x10^9/L","ref":"150–450","low":150,"high":450,"clow":20,"chigh":1000},
        {"name":"Neutrophils","units":"%","ref":"40–75","low":40,"high":75,"clow":10,"chigh":95},
        {"name":"Lymphocytes","units":"%","ref":"20–45","low":20,"high":45,"clow":5,"chigh":80}
      ]
    },
    {
      "match": ["Urea and Electrolytes","U&E","Urea Electrolytes and Creatinine","UEC","Renal Function","Renal Panel"],
      "params": [
        {"name":"Sodium (Na+)","units":"mmol/L","ref":"135–145","low":135,"high":145,"clow":120,"chigh":160},
        {"name":"Potassium (K+)","units":"mmol/L","ref":"3.5–5.1","low":3.5,"high":5.1,"clow":2.5,"chigh":6.5},
        {"name":"Chloride (Cl-)","units":"mmol/L","ref":"98–107","low":98,"high":107,"clow":80,"chigh":125},
        {"name":"Bicarbonate (HCO3-)","units":"mmol/L","ref":"22–29","low":22,"high":29,"clow":10,"chigh":40},
        {"name":"Urea","units":"mmol/L","ref":"2.5–7.8","low":2.5,"high":7.8,"clow":null,"chigh":30},
        {"name":"Creatinine","units":"umol/L","ref":"62–115 (M) / 53–97 (F)","low":53,"high":115,"clow":null,"chigh":500},
        {"name":"eGFR","units":"mL/min/1.73m^2","ref":">= 90","low":90,"high":null,"clow":15,"chigh":null}
      ]
    },
    {
      "match": ["Liver Function Test","LFT","Liver Function"],
      "params": [
        {"name":"Total Bilirubin","units":"umol/L","ref":"5–21","low":null,"high":21,"clow":null,"chigh":100},
        {"name":"Direct Bilirubin","units":"umol/L","ref":"0–3.4","low":null,"high":3.4,"clow":null,"chigh":50},
        {"name":"ALT (SGPT)","units":"U/L","ref":"7–56","low":null,"high":56,"clow":null,"chigh":1000},
        {"name":"AST (SGOT)","units":"U/L","ref":"10–40","low":null,"high":40,"clow":null,"chigh":1000},
        {"name":"ALP","units":"U/L","ref":"44–147","low":44,"high":147,"clow":null,"chigh":500},
        {"name":"GGT","units":"U/L","ref":"9–48","low":null,"high":48,"clow":null,"chigh":500},
        {"name":"Total Protein","units":"g/L","ref":"60–83","low":60,"high":83,"clow":40,"chigh":100},
        {"name":"Albumin","units":"g/L","ref":"35–50","low":35,"high":50,"clow":20,"chigh":60}
      ]
    },
    {
      "match": ["Lipid Profile","Lipid Panel","Fasting Lipids"],
      "params": [
        {"name":"Total Cholesterol","units":"mmol/L","ref":"< 5.2","low":null,"high":5.2,"clow":null,"chigh":10},
        {"name":"LDL Cholesterol","units":"mmol/L","ref":"< 3.4","low":null,"high":3.4,"clow":null,"chigh":8},
        {"name":"HDL Cholesterol","units":"mmol/L","ref":"> 1.0 (M) / > 1.3 (F)","low":1.0,"high":null,"clow":null,"chigh":null},
        {"name":"Triglycerides","units":"mmol/L","ref":"< 1.7","low":null,"high":1.7,"clow":null,"chigh":11}
      ]
    },
    {
      "match": ["HbA1c","Glycated Haemoglobin","Glycosylated Haemoglobin"],
      "params": [
        {"name":"HbA1c","units":"%","ref":"< 5.7 normal; 5.7–6.4 pre-DM; >= 6.5 DM","low":null,"high":5.7,"clow":null,"chigh":15},
        {"name":"HbA1c (IFCC)","units":"mmol/mol","ref":"< 39","low":null,"high":39,"clow":null,"chigh":140}
      ]
    },
    {
      "match": ["Thyroid Function","TFT","Thyroid Function Test"],
      "params": [
        {"name":"TSH","units":"mIU/L","ref":"0.4–4.0","low":0.4,"high":4.0,"clow":0.01,"chigh":100},
        {"name":"Free T4 (FT4)","units":"pmol/L","ref":"9–19","low":9,"high":19,"clow":3,"chigh":50},
        {"name":"Free T3 (FT3)","units":"pmol/L","ref":"2.6–5.7","low":2.6,"high":5.7,"clow":1,"chigh":15}
      ]
    },
    {
      "match": ["Urinalysis","Urine Routine","Urine Microscopy"],
      "params": [
        {"name":"Colour","units":null,"ref":"Straw / pale yellow","low":null,"high":null,"clow":null,"chigh":null,"type":"text"},
        {"name":"Appearance","units":null,"ref":"Clear","low":null,"high":null,"clow":null,"chigh":null,"type":"text"},
        {"name":"pH","units":null,"ref":"4.6–8.0","low":4.6,"high":8.0,"clow":null,"chigh":null},
        {"name":"Specific Gravity","units":null,"ref":"1.005–1.030","low":1.005,"high":1.030,"clow":null,"chigh":null},
        {"name":"Protein","units":null,"ref":"Negative","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"negative,trace,+,++,+++"},
        {"name":"Glucose","units":null,"ref":"Negative","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"negative,trace,+,++,+++"},
        {"name":"Ketones","units":null,"ref":"Negative","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"negative,trace,+,++,+++"},
        {"name":"Blood","units":null,"ref":"Negative","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"negative,trace,+,++,+++"},
        {"name":"Leukocytes","units":null,"ref":"Negative","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"negative,trace,+,++,+++"},
        {"name":"Nitrites","units":null,"ref":"Negative","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"negative,positive"}
      ]
    },
    {
      "match": ["Malaria","MPS","Malaria Parasites","Malaria Screen"],
      "params": [
        {"name":"Malaria Parasites","units":null,"ref":"Not seen","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"not seen,seen (P. falciparum),seen (P. vivax),seen (mixed)"},
        {"name":"Parasite Density","units":"parasites/uL","ref":"—","low":null,"high":null,"clow":null,"chigh":null}
      ]
    },
    {
      "match": ["HIV Test","HIV Screening","HIV Rapid Test"],
      "params": [
        {"name":"HIV Rapid Test","units":null,"ref":"Non-reactive","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"non-reactive,reactive,indeterminate"}
      ]
    },
    {
      "match": ["Pregnancy Test","BHCG","hCG","Beta HCG"],
      "params": [
        {"name":"Urine hCG","units":null,"ref":"Negative","low":null,"high":null,"clow":null,"chigh":null,"type":"select","opts":"negative,positive"},
        {"name":"Serum beta-hCG","units":"mIU/mL","ref":"Non-pregnant < 5","low":null,"high":5,"clow":null,"chigh":null}
      ]
    }
  ]'::jsonb;
  spec jsonb;
  needle text;
  param jsonb;
  ord int;
BEGIN
  FOR spec IN SELECT * FROM jsonb_array_elements(test_specs) LOOP
    FOR needle IN SELECT value FROM jsonb_array_elements_text(spec->'match') LOOP
      FOR t_id IN
        SELECT id FROM public.lab_tests_catalog
        WHERE name ILIKE '%' || needle || '%' OR code ILIKE '%' || needle || '%'
      LOOP
        SELECT COUNT(*) INTO rows FROM public.lab_result_templates WHERE test_id = t_id;
        IF rows = 0 THEN
          ord := 0;
          FOR param IN SELECT * FROM jsonb_array_elements(spec->'params') LOOP
            INSERT INTO public.lab_result_templates(
              test_id, parameter_name, units, reference_range,
              reference_low, reference_high, critical_low, critical_high,
              input_type, select_options, display_order
            ) VALUES (
              t_id,
              param->>'name',
              param->>'units',
              param->>'ref',
              NULLIF(param->>'low','')::numeric,
              NULLIF(param->>'high','')::numeric,
              NULLIF(param->>'clow','')::numeric,
              NULLIF(param->>'chigh','')::numeric,
              COALESCE(param->>'type','numeric'),
              param->>'opts',
              ord
            );
            ord := ord + 1;
          END LOOP;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
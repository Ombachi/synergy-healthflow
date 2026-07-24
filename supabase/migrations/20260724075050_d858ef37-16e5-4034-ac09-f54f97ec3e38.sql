
WITH ranked AS (
  SELECT id,
         to_char(created_at, 'YYYYMM') AS ym,
         row_number() OVER (PARTITION BY to_char(created_at, 'YYYYMM') ORDER BY created_at, id) AS seq
  FROM public.patients
)
UPDATE public.patients p
SET medical_record_number = 'LITU-' || r.ym || '-' || lpad(r.seq::text, 3, '0')
FROM ranked r
WHERE p.id = r.id;

CREATE OR REPLACE FUNCTION public.assign_patient_mrn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ym text; prefix text; seq int; candidate text;
BEGIN
  IF NEW.medical_record_number IS NOT NULL AND length(trim(NEW.medical_record_number)) > 0 THEN RETURN NEW; END IF;
  ym := to_char(COALESCE(NEW.created_at, now()), 'YYYYMM');
  prefix := 'LITU-' || ym || '-';
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(substring(medical_record_number FROM length(prefix) + 1), '[^0-9]', '', 'g'), '')::int
  ), 0) + 1 INTO seq
  FROM public.patients WHERE medical_record_number LIKE prefix || '%';
  candidate := prefix || lpad(seq::text, 3, '0');
  WHILE EXISTS (SELECT 1 FROM public.patients WHERE medical_record_number = candidate) LOOP
    seq := seq + 1; candidate := prefix || lpad(seq::text, 3, '0');
  END LOOP;
  NEW.medical_record_number := candidate;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.auto_close_visit_on_full_dispense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_visit uuid; v_pending int;
BEGIN
  SELECT rx.visit_id INTO v_visit FROM public.prescriptions rx WHERE rx.id = NEW.prescription_id;
  IF v_visit IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_pending
  FROM public.prescriptions rx
  LEFT JOIN public.pharmacy_dispenses d ON d.prescription_id = rx.id AND d.status = 'dispensed'
  WHERE rx.visit_id = v_visit AND d.id IS NULL;
  IF v_pending = 0 THEN
    UPDATE public.visits
       SET current_stage = 'completed',
           status = CASE WHEN status IN ('completed','closed') THEN status ELSE 'completed' END,
           closed_at = COALESCE(closed_at, now())
     WHERE id = v_visit;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_close_visit_on_dispense ON public.pharmacy_dispenses;
CREATE TRIGGER trg_auto_close_visit_on_dispense
AFTER INSERT OR UPDATE OF status ON public.pharmacy_dispenses
FOR EACH ROW WHEN (NEW.status = 'dispensed')
EXECUTE FUNCTION public.auto_close_visit_on_full_dispense();

UPDATE public.visits v
SET current_stage = 'completed',
    status = CASE WHEN status IN ('completed','closed') THEN status ELSE 'completed' END,
    closed_at = COALESCE(closed_at, now())
WHERE EXISTS (SELECT 1 FROM public.prescriptions rx WHERE rx.visit_id = v.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.prescriptions rx
    LEFT JOIN public.pharmacy_dispenses d ON d.prescription_id = rx.id AND d.status = 'dispensed'
    WHERE rx.visit_id = v.id AND d.id IS NULL
  )
  AND v.status NOT IN ('completed','closed');

INSERT INTO public.service_catalog (code, name, category, unit_price_cents)
SELECT * FROM (VALUES
  ('NURS-IVL','IV line insertion','nursing',80000),
  ('NURS-CATH','Urinary catheterization','nursing',150000),
  ('NURS-NGT','Nasogastric tube insertion','nursing',180000),
  ('NURS-WDR','Wound dressing (large)','nursing',120000),
  ('NURS-SUT','Suture removal','nursing',60000),
  ('NURS-INJ','IM/SC injection administration','nursing',30000),
  ('NURS-NEB','Nebulization','nursing',50000),
  ('NURS-ECG','12-lead ECG','nursing',150000),
  ('NURS-GLU','Bedside glucose test','nursing',20000),
  ('NURS-ENE','Enema administration','nursing',100000)
) AS v(code,name,category,unit_price_cents)
WHERE NOT EXISTS (SELECT 1 FROM public.service_catalog s WHERE s.code = v.code);

INSERT INTO public.lab_result_templates (test_id, parameter_name, units, reference_range, reference_low, reference_high, critical_low, critical_high, input_type, display_order)
SELECT t.id, x.parameter_name, x.units, x.reference_range, x.ref_low, x.ref_high, x.crit_low, x.crit_high, x.input_type, x.display_order
FROM (VALUES
  ('URIN','Colour', NULL, 'Straw / Yellow', NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric, 'text', 1),
  ('URIN','Appearance', NULL, 'Clear', NULL, NULL, NULL, NULL, 'text', 2),
  ('URIN','pH', NULL, '4.5-8.0', 4.5, 8.0, NULL, NULL, 'numeric', 3),
  ('URIN','Specific gravity', NULL, '1.005-1.030', 1.005, 1.030, NULL, NULL, 'numeric', 4),
  ('URIN','Protein', NULL, 'Negative', NULL, NULL, NULL, NULL, 'select', 5),
  ('URIN','Glucose', NULL, 'Negative', NULL, NULL, NULL, NULL, 'select', 6),
  ('URIN','Ketones', NULL, 'Negative', NULL, NULL, NULL, NULL, 'select', 7),
  ('URIN','Blood', NULL, 'Negative', NULL, NULL, NULL, NULL, 'select', 8),
  ('URIN','Leucocytes', NULL, 'Negative', NULL, NULL, NULL, NULL, 'select', 9),
  ('URIN','Nitrites', NULL, 'Negative', NULL, NULL, NULL, NULL, 'select', 10),
  ('STOL','Consistency', NULL, 'Formed', NULL, NULL, NULL, NULL, 'text', 1),
  ('STOL','Occult blood', NULL, 'Negative', NULL, NULL, NULL, NULL, 'select', 2),
  ('STOL','Ova / cysts', NULL, 'Not seen', NULL, NULL, NULL, NULL, 'text', 3),
  ('AMYL','Amylase','U/L','25-125',25,125,NULL,NULL,'numeric',1),
  ('LIPA','Lipase','U/L','0-160',0,160,NULL,NULL,'numeric',1),
  ('MAG','Magnesium','mg/dL','1.7-2.2',1.7,2.2,1.0,3.0,'numeric',1),
  ('PHOS','Phosphate','mg/dL','2.5-4.5',2.5,4.5,1.0,6.5,'numeric',1),
  ('TSH','TSH','mIU/L','0.4-4.0',0.4,4.0,NULL,NULL,'numeric',1),
  ('FT4','Free T4','ng/dL','0.8-1.8',0.8,1.8,NULL,NULL,'numeric',1),
  ('FT3','Free T3','pg/mL','2.3-4.2',2.3,4.2,NULL,NULL,'numeric',1),
  ('VITD','Vitamin D (25-OH)','ng/mL','30-100',30,100,NULL,NULL,'numeric',1),
  ('B12','Vitamin B12','pg/mL','200-900',200,900,NULL,NULL,'numeric',1),
  ('FER','Ferritin','ng/mL','30-400',30,400,NULL,NULL,'numeric',1),
  ('IRON','Serum iron','µg/dL','60-170',60,170,NULL,NULL,'numeric',1),
  ('HBA1C','HbA1c','%','4.0-5.6',4.0,5.6,NULL,10.0,'numeric',1)
) AS x(test_code, parameter_name, units, reference_range, ref_low, ref_high, crit_low, crit_high, input_type, display_order)
JOIN public.lab_tests_catalog t ON t.code = x.test_code
WHERE NOT EXISTS (
  SELECT 1 FROM public.lab_result_templates lt
  WHERE lt.test_id = t.id AND lt.parameter_name = x.parameter_name
);

UPDATE public.lab_result_templates
SET select_options = 'Negative,Trace,+,++,+++,++++'
WHERE input_type = 'select' AND select_options IS NULL
  AND parameter_name IN ('Protein','Glucose','Ketones','Blood','Leucocytes','Nitrites','Occult blood');


CREATE OR REPLACE FUNCTION public.assign_patient_mrn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
END; $function$;

DO $$
DECLARE keep_id uuid; dup_id uuid;
BEGIN
  SELECT id INTO keep_id FROM public.patients
   WHERE full_name ILIKE 'Enock Ombachi' ORDER BY created_at LIMIT 1;
  SELECT id INTO dup_id FROM public.patients
   WHERE full_name ILIKE 'Enock Ombachi' AND id <> keep_id ORDER BY created_at LIMIT 1;

  IF keep_id IS NOT NULL AND dup_id IS NOT NULL THEN
    UPDATE public.visits          SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.admissions      SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.appointments    SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.clinical_tasks  SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.consents        SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.imaging_orders  SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.intake_forms    SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.invoices        SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.lab_orders      SET patient_id = keep_id WHERE patient_id = dup_id;
    UPDATE public.vitals          SET patient_id = keep_id WHERE patient_id = dup_id;

    UPDATE public.patients p SET
      date_of_birth = COALESCE(p.date_of_birth, (SELECT date_of_birth FROM public.patients WHERE id = dup_id)),
      phone         = COALESCE(p.phone,         (SELECT phone         FROM public.patients WHERE id = dup_id)),
      allergies     = COALESCE(p.allergies,     (SELECT allergies     FROM public.patients WHERE id = dup_id))
    WHERE p.id = keep_id;

    UPDATE public.patients SET deleted_at = now(), deletion_reason = 'Auto-merged duplicate → ' || keep_id::text
    WHERE id = dup_id;
  END IF;
END $$;

INSERT INTO public.icd11_codes(code, title, chapter) VALUES
  ('CA22','Bronchitis, acute','Respiratory'),
  ('CA40','Pneumonia','Respiratory'),
  ('CA23','Asthma','Respiratory'),
  ('BA00','Essential hypertension','Cardiovascular'),
  ('BA40','Ischaemic heart disease','Cardiovascular'),
  ('BA41','Acute myocardial infarction','Cardiovascular'),
  ('5A11','Type 2 diabetes mellitus','Endocrine'),
  ('5A10','Type 1 diabetes mellitus','Endocrine'),
  ('DA63','Peptic ulcer','Digestive'),
  ('DA92','Gastroenteritis','Digestive'),
  ('DA90','Diarrhoea','Digestive'),
  ('1F40','Malaria','Infectious'),
  ('1B10','Tuberculosis','Infectious'),
  ('1C62','HIV disease','Infectious'),
  ('1D40','Typhoid fever','Infectious'),
  ('1A00','Cholera','Infectious'),
  ('1C40','Viral hepatitis','Infectious'),
  ('GC08','Urinary tract infection','Genitourinary'),
  ('JB63','Pre-eclampsia','Maternal'),
  ('JA65','Ectopic pregnancy','Maternal'),
  ('KA20','Neonatal jaundice','Neonatal'),
  ('KA22','Neonatal sepsis','Neonatal'),
  ('MG30','Chronic pain','Symptoms'),
  ('MG50','Fatigue','Symptoms'),
  ('MG26','Headache','Symptoms'),
  ('MG22','Fever, unspecified','Symptoms'),
  ('6A70','Depressive episode','Mental'),
  ('6B00','Generalised anxiety disorder','Mental'),
  ('8B20','Cerebrovascular accident','Neurological'),
  ('8A80','Epilepsy','Neurological'),
  ('FA00','Osteoarthritis','Musculoskeletal'),
  ('FA20','Rheumatoid arthritis','Musculoskeletal'),
  ('EA80','Atopic dermatitis','Skin'),
  ('EB60','Cellulitis','Skin'),
  ('3A00','Iron deficiency anaemia','Blood'),
  ('3A01','Sickle cell disease','Blood'),
  ('2B33','Breast cancer','Neoplasm'),
  ('2C10','Cervical cancer','Neoplasm'),
  ('2C25','Prostate cancer','Neoplasm'),
  ('NA00','Head injury','Injury'),
  ('NB00','Fracture, upper limb','Injury'),
  ('NB01','Fracture, lower limb','Injury'),
  ('NE60','Burn, thermal','Injury'),
  ('QA00','General adult examination','Encounter'),
  ('QA02','Antenatal examination','Encounter')
ON CONFLICT (code) DO NOTHING;

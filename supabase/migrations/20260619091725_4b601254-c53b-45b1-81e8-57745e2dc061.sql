
CREATE OR REPLACE FUNCTION public.compute_patient_initials(_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE parts text[]; ini text := '';
BEGIN
  IF _name IS NULL OR length(trim(_name)) = 0 THEN RETURN 'XX'; END IF;
  parts := regexp_split_to_array(trim(_name), '\s+');
  ini := upper(substring(parts[1] FROM 1 FOR 1));
  IF array_length(parts, 1) > 1 THEN
    ini := ini || upper(substring(parts[array_length(parts,1)] FROM 1 FOR 1));
  ELSE ini := ini || 'X'; END IF;
  ini := regexp_replace(ini, '[^A-Z]', 'X', 'g');
  IF length(ini) < 2 THEN ini := rpad(ini, 2, 'X'); END IF;
  RETURN ini;
END; $$;

CREATE OR REPLACE FUNCTION public.assign_patient_mrn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ym text; ini text; prefix text; seq int; candidate text;
BEGIN
  IF NEW.medical_record_number IS NOT NULL AND length(trim(NEW.medical_record_number)) > 0 THEN RETURN NEW; END IF;
  ym := to_char(COALESCE(NEW.created_at, now()), 'YYYYMM');
  ini := public.compute_patient_initials(NEW.full_name);
  prefix := 'LITU-' || ym || '-' || ini || '-';
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

DROP TRIGGER IF EXISTS trg_assign_patient_mrn ON public.patients;
CREATE TRIGGER trg_assign_patient_mrn BEFORE INSERT ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.assign_patient_mrn();

UPDATE public.patients p
SET medical_record_number = sub.mrn
FROM (
  SELECT id,
    'LITU-' || to_char(created_at, 'YYYYMM') || '-' ||
    public.compute_patient_initials(full_name) || '-' ||
    lpad(ROW_NUMBER() OVER (
      PARTITION BY to_char(created_at, 'YYYYMM'), public.compute_patient_initials(full_name)
      ORDER BY created_at, id
    )::text, 3, '0') AS mrn
  FROM public.patients
  WHERE medical_record_number IS NULL OR length(trim(medical_record_number)) = 0
) sub
WHERE p.id = sub.id;

CREATE UNIQUE INDEX IF NOT EXISTS patients_mrn_unique
  ON public.patients (medical_record_number) WHERE medical_record_number IS NOT NULL;

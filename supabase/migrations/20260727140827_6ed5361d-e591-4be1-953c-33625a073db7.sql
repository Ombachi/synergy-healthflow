CREATE OR REPLACE FUNCTION public.notify_abnormal_vitals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc UUID; v_abn TEXT := '';
BEGIN
  SELECT assigned_doctor_id INTO v_doc FROM visits WHERE id = NEW.visit_id;
  IF v_doc IS NULL THEN RETURN NEW; END IF;
  IF NEW.heart_rate IS NOT NULL AND (NEW.heart_rate < 50 OR NEW.heart_rate > 120) THEN v_abn := v_abn||'HR '||NEW.heart_rate||' '; END IF;
  IF NEW.systolic_bp IS NOT NULL AND (NEW.systolic_bp < 90 OR NEW.systolic_bp > 160) THEN v_abn := v_abn||'SBP '||NEW.systolic_bp||' '; END IF;
  IF NEW.diastolic_bp IS NOT NULL AND (NEW.diastolic_bp < 60 OR NEW.diastolic_bp > 100) THEN v_abn := v_abn||'DBP '||NEW.diastolic_bp||' '; END IF;
  IF NEW.oxygen_saturation IS NOT NULL AND NEW.oxygen_saturation < 92 THEN v_abn := v_abn||'SpO2 '||NEW.oxygen_saturation||'% '; END IF;
  IF NEW.temperature_c IS NOT NULL AND (NEW.temperature_c < 35 OR NEW.temperature_c > 38.5) THEN v_abn := v_abn||'Temp '||NEW.temperature_c||'C '; END IF;
  IF NEW.respiratory_rate IS NOT NULL AND (NEW.respiratory_rate < 10 OR NEW.respiratory_rate > 24) THEN v_abn := v_abn||'RR '||NEW.respiratory_rate||' '; END IF;
  IF length(v_abn) > 0 THEN
    INSERT INTO notifications(recipient_id,type,title,body,link,entity_type,entity_id)
    VALUES (v_doc,'abnormal_vitals','Abnormal vitals recorded', trim(v_abn),
            '/visits/'||NEW.visit_id,'vitals',NEW.id);
  END IF;
  RETURN NEW;
END $$;
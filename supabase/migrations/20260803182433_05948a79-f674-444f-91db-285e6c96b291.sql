
-- 1. DRUG INTERACTIONS -------------------------------------------------
CREATE TABLE public.drug_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_a text NOT NULL,
  drug_b text NOT NULL,
  severity text NOT NULL DEFAULT 'moderate',
  mechanism text,
  advice text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.drug_interactions TO authenticated;
GRANT ALL ON public.drug_interactions TO service_role;
ALTER TABLE public.drug_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY di_read ON public.drug_interactions FOR SELECT TO authenticated USING (true);
CREATE POLICY di_admin ON public.drug_interactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_di_updated BEFORE UPDATE ON public.drug_interactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- 2. DRUG-ALLERGY RULES ------------------------------------------------
CREATE TABLE public.drug_allergy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allergen text NOT NULL,
  drug_pattern text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.drug_allergy_rules TO authenticated;
GRANT ALL ON public.drug_allergy_rules TO service_role;
ALTER TABLE public.drug_allergy_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY dar_read ON public.drug_allergy_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY dar_admin ON public.drug_allergy_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_dar_updated BEFORE UPDATE ON public.drug_allergy_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- 3. REFERRALS ---------------------------------------------------------
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  referred_by uuid NOT NULL DEFAULT auth.uid(),
  referred_to uuid,
  specialty text NOT NULL,
  external_facility text,
  urgency text NOT NULL DEFAULT 'routine',
  reason text NOT NULL,
  clinical_summary text,
  investigations text,
  current_medications text,
  status text NOT NULL DEFAULT 'pending',
  response text,
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY ref_select ON public.referrals FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR referred_by = auth.uid()
  OR referred_to = auth.uid()
  OR public.has_role(auth.uid(),'doctor')
  OR public.has_role(auth.uid(),'nurse')
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = referrals.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY ref_insert ON public.referrals FOR INSERT TO authenticated WITH CHECK (
  referred_by = auth.uid() AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'nurse')
  )
);
CREATE POLICY ref_update ON public.referrals FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR referred_by = auth.uid() OR referred_to = auth.uid()
) WITH CHECK (
  public.has_role(auth.uid(),'admin') OR referred_by = auth.uid() OR referred_to = auth.uid()
);
CREATE TRIGGER trg_ref_updated BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
CREATE INDEX idx_referrals_patient ON public.referrals(patient_id);

-- 4. RADIOLOGY REPORT TEMPLATES ---------------------------------------
CREATE TABLE public.radiology_report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modality text NOT NULL,
  body_part text,
  name text NOT NULL,
  technique text,
  findings_template text NOT NULL,
  impression_template text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.radiology_report_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.radiology_report_templates TO authenticated;
GRANT ALL ON public.radiology_report_templates TO service_role;
ALTER TABLE public.radiology_report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY rrt_read ON public.radiology_report_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY rrt_write ON public.radiology_report_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'radiologist'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'radiologist'));
CREATE TRIGGER trg_rrt_updated BEFORE UPDATE ON public.radiology_report_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- 5. DISPENSING COUNSELLING -------------------------------------------
CREATE TABLE public.dispense_counselling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  pharmacist_id uuid NOT NULL DEFAULT auth.uid(),
  medication text NOT NULL,
  points text[] NOT NULL DEFAULT '{}',
  advice text,
  understood boolean NOT NULL DEFAULT false,
  interpreter_used boolean NOT NULL DEFAULT false,
  counselled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.dispense_counselling TO authenticated;
GRANT ALL ON public.dispense_counselling TO service_role;
ALTER TABLE public.dispense_counselling ENABLE ROW LEVEL SECURITY;
CREATE POLICY dc_select ON public.dispense_counselling FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pharmacist')
  OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse')
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = dispense_counselling.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY dc_write ON public.dispense_counselling FOR INSERT TO authenticated WITH CHECK (
  pharmacist_id = auth.uid() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pharmacist'))
);
CREATE POLICY dc_update ON public.dispense_counselling FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR pharmacist_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'admin') OR pharmacist_id = auth.uid());
CREATE TRIGGER trg_dc_updated BEFORE UPDATE ON public.dispense_counselling
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

-- 6. REPORT FUNCTIONS --------------------------------------------------
CREATE OR REPLACE FUNCTION public.kpi_walkin_vs_appointment(_days integer DEFAULT 30)
RETURNS TABLE(day date, walk_in bigint, scheduled bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (v.created_at AT TIME ZONE 'UTC')::date AS day,
         count(*) FILTER (WHERE a.id IS NULL) AS walk_in,
         count(*) FILTER (WHERE a.id IS NOT NULL) AS scheduled
  FROM public.visits v
  LEFT JOIN public.appointments a ON a.visit_id = v.id
  WHERE v.deleted_at IS NULL
    AND v.created_at >= now() - make_interval(days => _days)
  GROUP BY 1 ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.reorder_suggestions()
RETURNS TABLE(item_id uuid, name text, sku text, category text, quantity integer,
              reorder_threshold integer, suggested_qty integer, supplier text, unit_price_cents integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id, i.name, i.sku, i.category, i.quantity, i.reorder_threshold,
         GREATEST(coalesce(i.reorder_threshold,0) * 2 - coalesce(i.quantity,0), 1)::int,
         i.supplier, i.unit_price_cents
  FROM public.inventory_items i
  WHERE coalesce(i.quantity,0) <= coalesce(i.reorder_threshold,0)
  ORDER BY (coalesce(i.quantity,0) - coalesce(i.reorder_threshold,0)) ASC, i.name;
$$;

CREATE OR REPLACE FUNCTION public.controlled_drug_reconciliation(_from date, _to date)
RETURNS TABLE(drug_name text, schedule text, opening numeric, received numeric,
              dispensed numeric, closing numeric, register_balance numeric, variance numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT r.drug_name, r.schedule, r.direction, r.qty, r.balance_after, r.created_at
    FROM public.controlled_drug_register r
  ), opening AS (
    SELECT drug_name,
           sum(CASE WHEN direction = 'in' THEN qty ELSE -qty END) AS bal
    FROM base WHERE created_at::date < _from GROUP BY drug_name
  ), period AS (
    SELECT drug_name, max(schedule) AS schedule,
           sum(qty) FILTER (WHERE direction='in') AS received,
           sum(qty) FILTER (WHERE direction='out') AS dispensed,
           (array_agg(balance_after ORDER BY created_at DESC))[1] AS last_bal
    FROM base WHERE created_at::date BETWEEN _from AND _to GROUP BY drug_name
  )
  SELECT p.drug_name, p.schedule,
         coalesce(o.bal,0), coalesce(p.received,0), coalesce(p.dispensed,0),
         coalesce(o.bal,0) + coalesce(p.received,0) - coalesce(p.dispensed,0),
         coalesce(p.last_bal,0),
         coalesce(p.last_bal,0) - (coalesce(o.bal,0) + coalesce(p.received,0) - coalesce(p.dispensed,0))
  FROM period p LEFT JOIN opening o ON o.drug_name = p.drug_name
  ORDER BY p.drug_name;
$$;

CREATE OR REPLACE FUNCTION public.patient_pay_invoice(
  _invoice uuid, _amount_cents integer, _method text, _reference text DEFAULT NULL)
RETURNS public.payments
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.payments; _owner boolean;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.invoices i JOIN public.patients p ON p.id = i.patient_id
    WHERE i.id = _invoice AND p.user_id = auth.uid()
  ) INTO _owner;
  IF NOT _owner THEN RAISE EXCEPTION 'Not your invoice'; END IF;
  INSERT INTO public.payments (invoice_id, amount_cents, method, reference, received_by)
  VALUES (_invoice, _amount_cents, coalesce(_method,'online'), _reference, auth.uid())
  RETURNING * INTO _p;
  RETURN _p;
END; $$;

REVOKE ALL ON FUNCTION public.kpi_walkin_vs_appointment(integer) FROM public;
REVOKE ALL ON FUNCTION public.reorder_suggestions() FROM public;
REVOKE ALL ON FUNCTION public.controlled_drug_reconciliation(date,date) FROM public;
REVOKE ALL ON FUNCTION public.patient_pay_invoice(uuid,integer,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.kpi_walkin_vs_appointment(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_suggestions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.controlled_drug_reconciliation(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_pay_invoice(uuid,integer,text,text) TO authenticated;

-- 7. SEED SAFETY LIBRARIES --------------------------------------------
INSERT INTO public.drug_allergy_rules (allergen, drug_pattern, severity, note) VALUES
 ('penicillin','penicillin','high','Direct penicillin allergy'),
 ('penicillin','amoxicillin','high','Aminopenicillin — cross reactive'),
 ('penicillin','ampicillin','high','Aminopenicillin — cross reactive'),
 ('penicillin','flucloxacillin','high','Penicillin class'),
 ('penicillin','benzathine','high','Penicillin class'),
 ('penicillin','augmentin','high','Amoxicillin/clavulanate'),
 ('penicillin','clavulan','high','Amoxicillin/clavulanate'),
 ('penicillin','cef','moderate','Cephalosporin — possible cross reactivity'),
 ('cephalosporin','cef','high','Cephalosporin class'),
 ('sulfa','sulfamethoxazole','high','Sulfonamide'),
 ('sulfa','cotrimoxazole','high','Sulfonamide combination'),
 ('sulfa','sulfadoxine','high','Sulfonamide'),
 ('sulphonamide','cotrimoxazole','high','Sulfonamide combination'),
 ('nsaid','ibuprofen','high','NSAID class'),
 ('nsaid','diclofenac','high','NSAID class'),
 ('nsaid','naproxen','high','NSAID class'),
 ('nsaid','aspirin','high','Salicylate/NSAID'),
 ('aspirin','aspirin','high','Direct salicylate allergy'),
 ('aspirin','ibuprofen','moderate','NSAID cross sensitivity'),
 ('codeine','codeine','high','Opioid allergy'),
 ('codeine','morphine','moderate','Opioid cross sensitivity'),
 ('morphine','morphine','high','Opioid allergy'),
 ('morphine','pethidine','moderate','Opioid cross sensitivity'),
 ('sulfa','furosemide','moderate','Sulfonamide-derived diuretic'),
 ('quinolone','ciprofloxacin','high','Fluoroquinolone class'),
 ('quinolone','levofloxacin','high','Fluoroquinolone class'),
 ('macrolide','azithromycin','high','Macrolide class'),
 ('macrolide','erythromycin','high','Macrolide class'),
 ('tetracycline','doxycycline','high','Tetracycline class'),
 ('metronidazole','metronidazole','high','Direct allergy'),
 ('iodine','contrast','high','Iodinated contrast reaction risk'),
 ('paracetamol','paracetamol','high','Direct allergy'),
 ('paracetamol','acetaminophen','high','Direct allergy');

INSERT INTO public.drug_interactions (drug_a, drug_b, severity, mechanism, advice) VALUES
 ('warfarin','aspirin','major','Additive bleeding risk','Avoid; if unavoidable monitor INR and bleeding closely'),
 ('warfarin','ibuprofen','major','NSAID displaces warfarin and irritates GI mucosa','Use paracetamol instead'),
 ('warfarin','diclofenac','major','Additive bleeding risk','Avoid combination'),
 ('warfarin','metronidazole','major','CYP2C9 inhibition raises INR','Reduce warfarin dose and monitor INR'),
 ('warfarin','fluconazole','major','CYP2C9 inhibition raises INR','Monitor INR every 2-3 days'),
 ('warfarin','ciprofloxacin','moderate','Increased anticoagulant effect','Monitor INR'),
 ('warfarin','cotrimoxazole','major','Potentiates warfarin','Avoid; choose alternative antibiotic'),
 ('methotrexate','cotrimoxazole','major','Additive antifolate/marrow suppression','Contraindicated'),
 ('methotrexate','ibuprofen','major','Reduced renal clearance of methotrexate','Avoid NSAIDs'),
 ('simvastatin','clarithromycin','major','CYP3A4 inhibition — rhabdomyolysis risk','Suspend statin during course'),
 ('simvastatin','erythromycin','major','CYP3A4 inhibition','Suspend statin during course'),
 ('atorvastatin','clarithromycin','moderate','CYP3A4 inhibition','Limit statin dose; watch for myalgia'),
 ('ciprofloxacin','ondansetron','moderate','Additive QT prolongation','Monitor ECG in at-risk patients'),
 ('azithromycin','ondansetron','moderate','Additive QT prolongation','Avoid in known long QT'),
 ('haloperidol','ondansetron','major','Additive QT prolongation','Avoid combination'),
 ('amiodarone','ciprofloxacin','major','Additive QT prolongation','Avoid combination'),
 ('spironolactone','enalapril','major','Hyperkalaemia','Monitor potassium weekly initially'),
 ('spironolactone','lisinopril','major','Hyperkalaemia','Monitor potassium'),
 ('enalapril','ibuprofen','moderate','Reduced antihypertensive effect and renal impairment','Monitor BP and creatinine'),
 ('lisinopril','ibuprofen','moderate','Triple-whammy risk with diuretics','Avoid chronic NSAID use'),
 ('furosemide','gentamicin','major','Additive ototoxicity and nephrotoxicity','Avoid; monitor levels if essential'),
 ('gentamicin','vancomycin','major','Additive nephrotoxicity','Monitor renal function and drug levels'),
 ('metformin','contrast','major','Lactic acidosis risk with iodinated contrast','Withhold metformin 48h around contrast'),
 ('metronidazole','alcohol','major','Disulfiram-like reaction','No alcohol during and 48h after'),
 ('phenytoin','fluconazole','major','Raised phenytoin levels','Monitor phenytoin level'),
 ('carbamazepine','erythromycin','major','Raised carbamazepine levels','Avoid; use alternative antibiotic'),
 ('digoxin','furosemide','moderate','Hypokalaemia increases digoxin toxicity','Monitor potassium and digoxin level'),
 ('digoxin','amiodarone','major','Raised digoxin concentration','Halve digoxin dose'),
 ('tramadol','fluoxetine','major','Serotonin syndrome and seizure risk','Avoid combination'),
 ('tramadol','amitriptyline','major','Serotonin syndrome / seizures','Avoid or monitor closely'),
 ('fluoxetine','amitriptyline','moderate','Raised TCA levels','Reduce TCA dose'),
 ('sildenafil','isosorbide','major','Severe hypotension','Contraindicated'),
 ('prednisolone','ibuprofen','moderate','GI ulceration risk','Add gastroprotection'),
 ('clopidogrel','omeprazole','moderate','CYP2C19 inhibition reduces clopidogrel effect','Use pantoprazole instead'),
 ('theophylline','ciprofloxacin','major','Raised theophylline levels','Avoid or reduce dose'),
 ('rifampicin','nevirapine','major','Reduced antiretroviral levels','Use efavirenz-based regimen'),
 ('lithium','ibuprofen','major','Reduced lithium clearance','Avoid NSAIDs'),
 ('lithium','furosemide','major','Raised lithium level','Monitor lithium closely'),
 ('insulin','prednisolone','moderate','Steroid-induced hyperglycaemia','Increase glucose monitoring'),
 ('amlodipine','simvastatin','moderate','Raised statin exposure','Limit simvastatin to 20mg');

-- 8. SEED RADIOLOGY TEMPLATES -----------------------------------------
INSERT INTO public.radiology_report_templates (modality, body_part, name, technique, findings_template, impression_template) VALUES
 ('X-Ray','Chest','Chest X-Ray (PA)','PA erect chest radiograph.',
  E'Lungs: Both lung fields are clear. No consolidation, mass or cavitation.\nPleura: No pleural effusion or pneumothorax.\nHeart: Cardiothoracic ratio within normal limits.\nMediastinum: Normal contour and width.\nHila: Normal in size and density.\nBones/Soft tissues: No fracture or focal bony lesion.\nDiaphragm: Smooth, normally positioned.',
  'Normal chest radiograph.'),
 ('X-Ray','Limb','Limb / Extremity X-Ray','AP and lateral views.',
  E'Bones: No acute fracture or dislocation.\nJoints: Joint spaces preserved. No effusion.\nAlignment: Normal.\nSoft tissues: No swelling, foreign body or calcification.',
  'No acute bony injury.'),
 ('X-Ray','Abdomen','Abdominal X-Ray (erect/supine)','Supine and erect abdominal radiographs.',
  E'Bowel gas pattern: Normal, no dilated loops.\nAir-fluid levels: None.\nFree air: No subdiaphragmatic free gas.\nOrgan outlines: Liver, spleen and renal outlines preserved.\nCalcifications: None identified.\nBones: Lumbar spine and pelvis unremarkable.',
  'Non-obstructive bowel gas pattern. No free air.'),
 ('Ultrasound','Abdomen','Abdominal Ultrasound','Real-time greyscale ultrasound of the abdomen.',
  E'Liver: Normal size and echotexture. No focal lesion. No intrahepatic duct dilatation.\nGallbladder: Normal wall thickness, no calculi, no pericholecystic fluid.\nCBD: Not dilated.\nPancreas: Visualised portions normal.\nSpleen: Normal size and echotexture.\nKidneys: Normal size, cortical thickness and corticomedullary differentiation. No hydronephrosis or calculi.\nUrinary bladder: Adequately distended, normal wall.\nAorta/IVC: Normal calibre.\nFree fluid: None.',
  'Normal abdominal ultrasound.'),
 ('Ultrasound','Obstetric','Obstetric Ultrasound','Transabdominal obstetric ultrasound.',
  E'Single intrauterine gestation with fetal cardiac activity present.\nFetal heart rate: ___ bpm.\nPresentation: ___\nBPD: ___ mm  HC: ___ mm  AC: ___ mm  FL: ___ mm\nEstimated fetal weight: ___ g\nGestational age by ultrasound: ___ weeks ___ days\nAmniotic fluid: Adequate (AFI ___ cm).\nPlacenta: ___ position, grade ___, clear of the internal os.\nCervix: Closed, length ___ mm.',
  'Single live intrauterine gestation at ___ weeks. Normal fetal growth and liquor volume.'),
 ('Ultrasound','Pelvis','Pelvic Ultrasound','Transabdominal pelvic ultrasound with full bladder.',
  E'Uterus: Anteverted, normal size and echotexture. Endometrial thickness ___ mm.\nOvaries: Both visualised, normal size, no adnexal mass.\nPouch of Douglas: No free fluid.\nUrinary bladder: Normal wall, no calculi.',
  'Normal pelvic ultrasound.'),
 ('CT','Head','CT Brain (non-contrast)','Axial non-contrast CT of the brain.',
  E'Brain parenchyma: No acute infarct, haemorrhage or mass effect.\nVentricles: Normal size and configuration. No midline shift.\nExtra-axial spaces: No extra-axial collection.\nPosterior fossa: Unremarkable.\nSkull: Intact, no fracture.\nParanasal sinuses/mastoids: Clear.',
  'Normal non-contrast CT brain.'),
 ('CT','Abdomen','CT Abdomen/Pelvis','Axial CT with intravenous contrast, coronal and sagittal reformats.',
  E'Liver, spleen, pancreas, adrenals: Normal.\nGallbladder and biliary tree: Unremarkable.\nKidneys and ureters: Normal enhancement, no hydronephrosis or calculi.\nBowel: Normal calibre, no wall thickening.\nVessels: Patent, normal calibre.\nLymph nodes: No pathological enlargement.\nFree fluid/air: None.\nBones: No aggressive lesion.',
  'Normal contrast-enhanced CT of the abdomen and pelvis.'),
 ('MRI','Spine','MRI Lumbar Spine','Sagittal and axial T1 and T2 weighted sequences.',
  E'Alignment: Normal lumbar lordosis.\nVertebral bodies: Normal height and marrow signal.\nDiscs: Normal hydration and height at all levels.\nCanal/foramina: No stenosis or nerve root compression.\nConus medullaris: Terminates at ___ and appears normal.\nParaspinal soft tissues: Unremarkable.',
  'Normal MRI of the lumbar spine.'),
 ('MRI','Brain','MRI Brain','Multiplanar multisequence MRI of the brain.',
  E'Parenchyma: Normal signal, no acute infarct on DWI.\nWhite matter: No abnormal T2/FLAIR hyperintensity.\nVentricles/CSF spaces: Normal.\nMidline structures: No shift.\nPosterior fossa and brainstem: Normal.\nOrbits, sinuses and mastoids: Clear.',
  'Normal MRI of the brain.'),
 ('Echocardiography','Heart','Transthoracic Echocardiogram','2D, M-mode, colour and spectral Doppler.',
  E'Left ventricle: Normal cavity size, wall thickness and global systolic function. LVEF ___ %.\nRight ventricle: Normal size and function. TAPSE ___ mm.\nAtria: Normal size.\nMitral valve: Structurally normal, no stenosis or regurgitation.\nAortic valve: Trileaflet, opens well.\nTricuspid/pulmonary valves: Normal. Estimated PASP ___ mmHg.\nPericardium: No effusion.\nIVC: Normal calibre with respiratory variation.',
  'Structurally normal heart with preserved biventricular systolic function.'),
 ('Doppler','Limb','Venous Doppler (Lower Limb)','Compression and colour Doppler ultrasound of the deep veins.',
  E'Common femoral, femoral, popliteal and calf veins are fully compressible.\nNormal phasic flow with respiration and augmentation.\nNo intraluminal thrombus.\nSuperficial veins: Patent, no thrombophlebitis.\nBaker cyst: None.',
  'No evidence of deep vein thrombosis.');

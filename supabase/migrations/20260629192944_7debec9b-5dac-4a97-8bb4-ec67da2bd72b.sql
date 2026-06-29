
-- ABP samples
CREATE TABLE public.abp_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  sample_type text NOT NULL CHECK (sample_type IN ('hematological','steroidal','endocrine')),
  collected_at timestamptz NOT NULL DEFAULT now(),
  collection_site text,
  in_competition boolean DEFAULT false,
  lab_reference text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abp_samples TO authenticated;
GRANT ALL ON public.abp_samples TO service_role;
ALTER TABLE public.abp_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinical staff manage abp samples" ON public.abp_samples FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'coach'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'coach'));
CREATE POLICY "Athletes view own abp samples" ON public.abp_samples FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.user_id = auth.uid()));

-- ABP biomarkers (per-sample longitudinal values)
CREATE TABLE public.abp_biomarkers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id uuid NOT NULL REFERENCES public.abp_samples(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  marker text NOT NULL,
  value numeric NOT NULL,
  units text,
  reference_low numeric,
  reference_high numeric,
  flag text,
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abp_biomarkers TO authenticated;
GRANT ALL ON public.abp_biomarkers TO service_role;
ALTER TABLE public.abp_biomarkers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinical staff manage abp biomarkers" ON public.abp_biomarkers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'coach'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'coach'));
CREATE POLICY "Athletes view own biomarkers" ON public.abp_biomarkers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.user_id = auth.uid()));
CREATE INDEX idx_abp_biomarkers_athlete ON public.abp_biomarkers(athlete_id, marker, measured_at DESC);

-- Auto-flag biomarker
CREATE OR REPLACE FUNCTION public.flag_abp_biomarker() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.reference_low IS NOT NULL AND NEW.value < NEW.reference_low THEN NEW.flag := 'low';
  ELSIF NEW.reference_high IS NOT NULL AND NEW.value > NEW.reference_high THEN NEW.flag := 'high';
  ELSIF NEW.reference_low IS NOT NULL OR NEW.reference_high IS NOT NULL THEN NEW.flag := 'normal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tg_flag_abp_biomarker BEFORE INSERT OR UPDATE ON public.abp_biomarkers FOR EACH ROW EXECUTE FUNCTION public.flag_abp_biomarker();

-- ABP alerts
CREATE TABLE public.abp_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','critical','doping_suspicion')),
  marker text,
  message text NOT NULL,
  resolved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abp_alerts TO authenticated;
GRANT ALL ON public.abp_alerts TO service_role;
ALTER TABLE public.abp_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinical staff manage abp alerts" ON public.abp_alerts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'coach'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'coach'));

-- Sports physiology
CREATE TABLE public.sports_physiology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  measured_at timestamptz NOT NULL DEFAULT now(),
  vo2_max numeric,
  lactate_threshold numeric,
  hrv_rmssd numeric,
  resting_hr integer,
  max_hr integer,
  grip_strength_kg numeric,
  vertical_jump_cm numeric,
  body_fat_pct numeric,
  lean_mass_kg numeric,
  weight_kg numeric,
  height_cm numeric,
  sleep_hours numeric,
  wellness_score integer,
  recovery_score integer,
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sports_physiology TO authenticated;
GRANT ALL ON public.sports_physiology TO service_role;
ALTER TABLE public.sports_physiology ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sports team manages physiology" ON public.sports_physiology FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'coach') OR public.has_role(auth.uid(),'nutritionist'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio') OR public.has_role(auth.uid(),'coach') OR public.has_role(auth.uid(),'nutritionist'));
CREATE POLICY "Athletes view own physiology" ON public.sports_physiology FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.user_id = auth.uid()));
CREATE INDEX idx_phys_athlete ON public.sports_physiology(athlete_id, measured_at DESC);

-- Doping tests
CREATE TABLE public.doping_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  test_type text NOT NULL CHECK (test_type IN ('urine','blood','dried_blood_spot')),
  in_competition boolean DEFAULT false,
  tested_at timestamptz NOT NULL DEFAULT now(),
  wada_code text,
  collecting_authority text,
  result text DEFAULT 'pending' CHECK (result IN ('pending','negative','atypical','adverse','positive')),
  substances_detected text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.doping_tests TO authenticated;
GRANT ALL ON public.doping_tests TO service_role;
ALTER TABLE public.doping_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinical staff manage doping tests" ON public.doping_tests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'lab_tech') OR public.has_role(auth.uid(),'physio'));
CREATE POLICY "Athletes view own doping tests" ON public.doping_tests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.user_id = auth.uid()));

-- TUE requests
CREATE TABLE public.tue_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  substance text NOT NULL,
  diagnosis text,
  justification text,
  requested_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired')),
  decision_reference text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  valid_from date,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tue_requests TO authenticated;
GRANT ALL ON public.tue_requests TO service_role;
ALTER TABLE public.tue_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinical staff manage TUE" ON public.tue_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'physio'));
CREATE POLICY "Athletes view own TUE" ON public.tue_requests FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.athletes a WHERE a.id = athlete_id AND a.user_id = auth.uid()));

-- Assessment templates (validated screening tools)
CREATE TABLE public.assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  scoring jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.assessment_templates TO authenticated;
GRANT ALL ON public.assessment_templates TO service_role;
ALTER TABLE public.assessment_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in reads templates" ON public.assessment_templates FOR SELECT TO authenticated USING (active);
CREATE POLICY "Admin manages templates" ON public.assessment_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Assessment responses
CREATE TABLE public.assessment_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_code text NOT NULL REFERENCES public.assessment_templates(code),
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric,
  severity text,
  alert boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_responses TO authenticated;
GRANT ALL ON public.assessment_responses TO service_role;
ALTER TABLE public.assessment_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Patient manages own responses" ON public.assessment_responses FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Clinicians read responses" ON public.assessment_responses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'physio'));
CREATE INDEX idx_assessment_responses_user ON public.assessment_responses(user_id, created_at DESC);
CREATE INDEX idx_assessment_responses_template ON public.assessment_responses(template_code, created_at DESC);

-- Seed assessment templates
INSERT INTO public.assessment_templates (code, name, category, description, questions, scoring) VALUES
('PHQ9','PHQ-9 Depression','Mental Health','Patient Health Questionnaire-9',
  '[{"q":"Little interest or pleasure in doing things"},{"q":"Feeling down, depressed, or hopeless"},{"q":"Trouble falling/staying asleep, or sleeping too much"},{"q":"Feeling tired or having little energy"},{"q":"Poor appetite or overeating"},{"q":"Feeling bad about yourself"},{"q":"Trouble concentrating"},{"q":"Moving/speaking slowly or being fidgety"},{"q":"Thoughts of being better off dead"}]'::jsonb,
  '{"type":"likert4","options":["Not at all","Several days","More than half the days","Nearly every day"],"bands":[{"max":4,"label":"Minimal"},{"max":9,"label":"Mild"},{"max":14,"label":"Moderate"},{"max":19,"label":"Moderately severe","alert":true},{"max":27,"label":"Severe","alert":true}]}'::jsonb),
('GAD7','GAD-7 Anxiety','Mental Health','Generalized Anxiety Disorder scale',
  '[{"q":"Feeling nervous, anxious or on edge"},{"q":"Not being able to stop or control worrying"},{"q":"Worrying too much about different things"},{"q":"Trouble relaxing"},{"q":"Being so restless it is hard to sit still"},{"q":"Becoming easily annoyed or irritable"},{"q":"Feeling afraid as if something awful might happen"}]'::jsonb,
  '{"type":"likert4","options":["Not at all","Several days","More than half the days","Nearly every day"],"bands":[{"max":4,"label":"Minimal"},{"max":9,"label":"Mild"},{"max":14,"label":"Moderate","alert":true},{"max":21,"label":"Severe","alert":true}]}'::jsonb),
('PSS','Perceived Stress Scale','Mental Health','PSS-10',
  '[{"q":"Upset because of something unexpected"},{"q":"Felt unable to control important things"},{"q":"Felt nervous and stressed"},{"q":"Confident handling personal problems"},{"q":"Things going your way"},{"q":"Could not cope with all you had to do"},{"q":"Able to control irritations"},{"q":"Felt on top of things"},{"q":"Angered by things outside your control"},{"q":"Difficulties piling up"}]'::jsonb,
  '{"type":"likert5","options":["Never","Almost never","Sometimes","Fairly often","Very often"],"bands":[{"max":13,"label":"Low"},{"max":26,"label":"Moderate"},{"max":40,"label":"High","alert":true}]}'::jsonb),
('BURNOUT','Burnout Assessment','Mental Health','Brief burnout screen',
  '[{"q":"Emotionally drained from work"},{"q":"Used up at end of workday"},{"q":"Fatigued when facing another day"},{"q":"Working all day is a strain"},{"q":"Feel burned out from work"}]'::jsonb,
  '{"type":"likert5","options":["Never","Rarely","Sometimes","Often","Always"],"bands":[{"max":8,"label":"Low"},{"max":15,"label":"Moderate"},{"max":20,"label":"High","alert":true}]}'::jsonb),
('CLIMATE_ANXIETY','Climate Anxiety Scale','Mental Health','Cognitive-emotional impairment from climate change',
  '[{"q":"Thinking about climate change makes it hard to concentrate"},{"q":"Thinking about climate change disturbs my sleep"},{"q":"I have nightmares about climate change"},{"q":"I find myself crying about climate change"},{"q":"Climate change affects my ability to enjoy time with friends/family"}]'::jsonb,
  '{"type":"likert5","options":["Never","Rarely","Sometimes","Often","Always"],"bands":[{"max":8,"label":"Low"},{"max":15,"label":"Moderate"},{"max":20,"label":"High","alert":true}]}'::jsonb),
('PSQI','Pittsburgh Sleep Quality Index (brief)','Sleep','Sleep quality screen',
  '[{"q":"Cannot get to sleep within 30 minutes"},{"q":"Wake up in the middle of the night"},{"q":"Have to get up to use bathroom"},{"q":"Cannot breathe comfortably"},{"q":"Cough or snore loudly"},{"q":"Feel too cold or too hot"},{"q":"Have bad dreams"}]'::jsonb,
  '{"type":"likert4","options":["Not during past month","Less than 1x/wk","1-2x/wk","3+x/wk"],"bands":[{"max":5,"label":"Good sleep"},{"max":10,"label":"Poor sleep","alert":true},{"max":21,"label":"Very poor","alert":true}]}'::jsonb),
('ESS','Epworth Sleepiness Scale','Sleep','Daytime sleepiness',
  '[{"q":"Sitting and reading"},{"q":"Watching TV"},{"q":"Sitting inactive in a public place"},{"q":"As a passenger in a car for an hour"},{"q":"Lying down to rest in afternoon"},{"q":"Sitting and talking to someone"},{"q":"Sitting quietly after lunch"},{"q":"In a car, stopped in traffic"}]'::jsonb,
  '{"type":"likert4","options":["Never doze","Slight chance","Moderate chance","High chance"],"bands":[{"max":7,"label":"Normal"},{"max":9,"label":"Mild"},{"max":15,"label":"Moderate","alert":true},{"max":24,"label":"Severe","alert":true}]}'::jsonb),
('ISI','Insomnia Severity Index','Sleep','7-item insomnia severity',
  '[{"q":"Difficulty falling asleep"},{"q":"Difficulty staying asleep"},{"q":"Waking too early"},{"q":"Satisfaction with sleep pattern"},{"q":"How noticeable to others is your sleep problem"},{"q":"How worried about your current sleep problem"},{"q":"How much does sleep interfere with daily functioning"}]'::jsonb,
  '{"type":"likert5","options":["0","1","2","3","4"],"bands":[{"max":7,"label":"None"},{"max":14,"label":"Subthreshold"},{"max":21,"label":"Moderate","alert":true},{"max":28,"label":"Severe","alert":true}]}'::jsonb),
('AUDIT','AUDIT Alcohol Use','Substance Use','10-item alcohol screen',
  '[{"q":"How often do you have a drink containing alcohol?"},{"q":"Typical drinks per day when drinking"},{"q":"How often 6+ drinks on one occasion"},{"q":"Unable to stop drinking once started"},{"q":"Failed to do what was expected because of drinking"},{"q":"Needed first drink in the morning"},{"q":"Guilt after drinking"},{"q":"Unable to remember the night before"},{"q":"You or someone injured because of drinking"},{"q":"Others concerned about your drinking"}]'::jsonb,
  '{"type":"likert5","options":["0","1","2","3","4"],"bands":[{"max":7,"label":"Low risk"},{"max":15,"label":"Hazardous","alert":true},{"max":19,"label":"Harmful","alert":true},{"max":40,"label":"Dependence likely","alert":true}]}'::jsonb),
('AUDITC','AUDIT-C','Substance Use','3-item brief alcohol screen',
  '[{"q":"How often do you have a drink"},{"q":"Drinks per day when drinking"},{"q":"How often 6+ on one occasion"}]'::jsonb,
  '{"type":"likert5","options":["0","1","2","3","4"],"bands":[{"max":2,"label":"Low"},{"max":4,"label":"At risk"},{"max":12,"label":"High","alert":true}]}'::jsonb),
('DAST10','DAST-10 Drug Use','Substance Use','Drug abuse screen',
  '[{"q":"Used drugs other than required medically"},{"q":"Abuse prescription drugs"},{"q":"Abuse more than one drug at a time"},{"q":"Can get through week without drugs"},{"q":"Able to stop when you want"},{"q":"Blackouts/flashbacks from drug use"},{"q":"Feel bad/guilty about drug use"},{"q":"Spouse/parents complain"},{"q":"Drug use caused problems with family"},{"q":"Engaged in illegal activities to obtain drugs"}]'::jsonb,
  '{"type":"yesno","options":["No","Yes"],"bands":[{"max":0,"label":"None"},{"max":2,"label":"Low"},{"max":5,"label":"Moderate","alert":true},{"max":8,"label":"Substantial","alert":true},{"max":10,"label":"Severe","alert":true}]}'::jsonb),
('CAGE','CAGE Alcohol','Substance Use','4-item screen',
  '[{"q":"Felt you should Cut down"},{"q":"Annoyed by criticism"},{"q":"Guilty about drinking"},{"q":"Eye-opener morning drink"}]'::jsonb,
  '{"type":"yesno","options":["No","Yes"],"bands":[{"max":1,"label":"Low"},{"max":4,"label":"Clinically significant","alert":true}]}'::jsonb),
('MOCA_SCREEN','MoCA Brief Screen','Cognitive','Brief cognitive screen (full MoCA requires clinician)',
  '[{"q":"Today date orientation correct?"},{"q":"Recall 3 words after 5 min"},{"q":"Serial 7 subtraction accurate"},{"q":"Animal naming (3+ in 60s)"},{"q":"Clock drawing intact"}]'::jsonb,
  '{"type":"yesno","options":["Impaired","Intact"],"bands":[{"max":2,"label":"Likely impairment","alert":true},{"max":5,"label":"Likely intact"}]}'::jsonb),
('VAS_PAIN','Visual Analog Pain Scale','Pain','0–10 pain rating',
  '[{"q":"Rate your current pain (0=none, 10=worst)"}]'::jsonb,
  '{"type":"likert11","options":["0","1","2","3","4","5","6","7","8","9","10"],"bands":[{"max":3,"label":"Mild"},{"max":6,"label":"Moderate","alert":true},{"max":10,"label":"Severe","alert":true}]}'::jsonb),
('PA_SCREEN','Physical Activity Screen','Lifestyle','Activity level',
  '[{"q":"Days/week of moderate activity 30+min"},{"q":"Days/week of vigorous activity 20+min"},{"q":"Days/week of strength training"}]'::jsonb,
  '{"type":"likert8","options":["0","1","2","3","4","5","6","7"],"bands":[{"max":4,"label":"Insufficient","alert":true},{"max":10,"label":"Adequate"},{"max":21,"label":"Active"}]}'::jsonb),
('NUTRITION','Nutrition Assessment','Lifestyle','Brief nutrition screen',
  '[{"q":"Fruit/veg servings per day (0-5+)"},{"q":"Sugary drinks per day"},{"q":"Fast food per week"},{"q":"Water intake (glasses/day)"},{"q":"Skip meals weekly"}]'::jsonb,
  '{"type":"likert5","options":["0","1","2","3","4"],"bands":[{"max":6,"label":"Healthy"},{"max":12,"label":"Suboptimal"},{"max":20,"label":"Poor","alert":true}]}'::jsonb),
('WHOQOL','WHOQOL-BREF (brief)','Quality of Life','Quality of life screen',
  '[{"q":"Overall quality of life"},{"q":"Satisfaction with health"},{"q":"Enjoy life"},{"q":"Life meaningful"},{"q":"Satisfied with self"}]'::jsonb,
  '{"type":"likert5","options":["Very poor","Poor","Neither","Good","Very good"],"bands":[{"max":10,"label":"Low QoL","alert":true},{"max":15,"label":"Moderate"},{"max":20,"label":"Good"}]}'::jsonb),
('SF36','SF-36 Brief','Quality of Life','Health-related quality of life',
  '[{"q":"General health rating"},{"q":"Limited in vigorous activities"},{"q":"Limited in moderate activities"},{"q":"Pain interfered with work"},{"q":"Felt calm and peaceful"}]'::jsonb,
  '{"type":"likert5","options":["Poor","Fair","Good","Very good","Excellent"],"bands":[{"max":8,"label":"Low","alert":true},{"max":15,"label":"Moderate"},{"max":20,"label":"High"}]}'::jsonb),
('ATHLETE_BURNOUT','Athlete Burnout','Sports Psychology','Brief athlete burnout',
  '[{"q":"Feeling physically worn out from training"},{"q":"Not achieving much in sport"},{"q":"Negative feelings toward sport"},{"q":"Emotionally drained from sport"},{"q":"Performance below ability"}]'::jsonb,
  '{"type":"likert5","options":["Never","Rarely","Sometimes","Often","Always"],"bands":[{"max":8,"label":"Low"},{"max":15,"label":"Moderate","alert":true},{"max":20,"label":"High","alert":true}]}'::jsonb),
('REST_Q','Recovery-Stress (REST-Q brief)','Sports Psychology','Recovery vs stress balance',
  '[{"q":"Slept restlessly"},{"q":"Felt physically exhausted"},{"q":"Felt unable to concentrate"},{"q":"Felt physically recovered"},{"q":"Felt mentally fresh"}]'::jsonb,
  '{"type":"likert5","options":["0","1","2","3","4"],"bands":[{"max":6,"label":"Well recovered"},{"max":12,"label":"At risk","alert":true},{"max":20,"label":"Overreached","alert":true}]}'::jsonb),
('MENTAL_TOUGH','Mental Toughness','Sports Psychology','Brief MTQ',
  '[{"q":"I stay calm under pressure"},{"q":"I bounce back from setbacks"},{"q":"I am confident in my abilities"},{"q":"I commit to long-term goals"},{"q":"I handle criticism well"}]'::jsonb,
  '{"type":"likert5","options":["Strongly disagree","Disagree","Neutral","Agree","Strongly agree"],"bands":[{"max":8,"label":"Low","alert":true},{"max":15,"label":"Moderate"},{"max":20,"label":"High"}]}'::jsonb),
('ENV_EXPOSURE','Environmental Exposure','Environmental Health','Exposure to environmental hazards',
  '[{"q":"Air quality in your area (0=good,4=poor)"},{"q":"Noise exposure"},{"q":"Chemical exposure at work"},{"q":"Water quality concerns"},{"q":"Heat/cold extreme exposure"}]'::jsonb,
  '{"type":"likert5","options":["0","1","2","3","4"],"bands":[{"max":6,"label":"Low"},{"max":12,"label":"Moderate"},{"max":20,"label":"High","alert":true}]}'::jsonb);

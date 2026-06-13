
-- ============ TEAMS ============
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT,
  season TEXT,
  manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_view" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_manage" ON public.teams FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER teams_updated BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ TEAM_MEMBERS ============
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  position TEXT,
  jersey_no TEXT,
  joined_at DATE DEFAULT CURRENT_DATE,
  left_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tm_view" ON public.team_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "tm_manage" ON public.team_members FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'));

-- ============ ASSESSMENTS ============
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'periodic',
  assessor_id UUID REFERENCES auth.users(id),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "as_view" ON public.assessments FOR SELECT TO authenticated USING (true);
CREATE POLICY "as_manage" ON public.assessments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'));

-- ============ TRAINING_PLANS ============
CREATE TABLE public.training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  athlete_id UUID REFERENCES public.athletes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goals TEXT,
  start_date DATE,
  end_date DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_plans TO authenticated;
GRANT ALL ON public.training_plans TO service_role;
ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tp_view" ON public.training_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "tp_manage" ON public.training_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER tp_updated BEFORE UPDATE ON public.training_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ TRAINING_SESSIONS ============
CREATE TABLE public.training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.training_plans(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  focus TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_sessions TO authenticated;
GRANT ALL ON public.training_sessions TO service_role;
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ts_view" ON public.training_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "ts_manage" ON public.training_sessions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'));

-- ============ ATTENDANCE ============
CREATE TABLE public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'present',
  recorded_by UUID REFERENCES auth.users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, athlete_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att_view" ON public.attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "att_manage" ON public.attendance FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'));

-- ============ PERFORMANCE_RECORDS ============
CREATE TABLE public.performance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.training_sessions(id) ON DELETE SET NULL,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_records TO authenticated;
GRANT ALL ON public.performance_records TO service_role;
ALTER TABLE public.performance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_view" ON public.performance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "pr_manage" ON public.performance_records FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'admin'));

-- ============ INJURIES ============
CREATE TABLE public.injuries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  body_part TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'mild',
  mechanism TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reported_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.injuries TO authenticated;
GRANT ALL ON public.injuries TO service_role;
ALTER TABLE public.injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inj_view" ON public.injuries FOR SELECT TO authenticated USING (true);
CREATE POLICY "inj_manage" ON public.injuries FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'physio') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER inj_updated BEFORE UPDATE ON public.injuries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ TREATMENT_PLANS ============
CREATE TABLE public.treatment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  injury_id UUID NOT NULL REFERENCES public.injuries(id) ON DELETE CASCADE,
  physio_id UUID REFERENCES auth.users(id),
  plan TEXT,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatment_plans TO authenticated;
GRANT ALL ON public.treatment_plans TO service_role;
ALTER TABLE public.treatment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trt_view" ON public.treatment_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "trt_manage" ON public.treatment_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(),'physio') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'physio') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trt_updated BEFORE UPDATE ON public.treatment_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ RECOVERY_SESSIONS ============
CREATE TABLE public.recovery_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id UUID NOT NULL REFERENCES public.treatment_plans(id) ON DELETE CASCADE,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  progress_pct INTEGER,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_sessions TO authenticated;
GRANT ALL ON public.recovery_sessions TO service_role;
ALTER TABLE public.recovery_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rs_view" ON public.recovery_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "rs_manage" ON public.recovery_sessions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'physio') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'physio') OR has_role(auth.uid(),'admin'));

-- ============ CLEARANCE_RECORDS ============
CREATE TABLE public.clearance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  injury_id UUID REFERENCES public.injuries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'cleared',
  cleared_by UUID REFERENCES auth.users(id),
  valid_until DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clearance_records TO authenticated;
GRANT ALL ON public.clearance_records TO service_role;
ALTER TABLE public.clearance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr_view" ON public.clearance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "cr_manage" ON public.clearance_records FOR ALL TO authenticated
  USING (has_role(auth.uid(),'physio') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'physio') OR has_role(auth.uid(),'doctor') OR has_role(auth.uid(),'admin'));

-- ============ NUTRITION_PLANS ============
CREATE TABLE public.nutrition_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id) ON DELETE CASCADE,
  nutritionist_id UUID REFERENCES auth.users(id),
  plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_date DATE,
  end_date DATE,
  compliance_pct INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_plans TO authenticated;
GRANT ALL ON public.nutrition_plans TO service_role;
ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "np_view" ON public.nutrition_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "np_manage" ON public.nutrition_plans FOR ALL TO authenticated
  USING (has_role(auth.uid(),'nutritionist') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'nutritionist') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER np_updated BEFORE UPDATE ON public.nutrition_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ COMPETITIONS ============
CREATE TABLE public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sport TEXT,
  scheduled_at TIMESTAMPTZ,
  venue TEXT,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  opponents TEXT,
  result TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comp_view" ON public.competitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "comp_manage" ON public.competitions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'coach') OR has_role(auth.uid(),'team_manager') OR has_role(auth.uid(),'admin'));
CREATE TRIGGER comp_updated BEFORE UPDATE ON public.competitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============ STATUS TRIGGERS ============
CREATE OR REPLACE FUNCTION public.on_injury_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE athletes SET status = 'injured' WHERE id = NEW.athlete_id;
    INSERT INTO notifications(recipient_id,type,title,body,link,entity_type,entity_id)
    SELECT ur.user_id,'injury','New injury reported',
           'Body part: '||NEW.body_part||' • Severity: '||NEW.severity,
           '/physio','injury',NEW.id
    FROM user_roles ur WHERE ur.role IN ('physio','doctor');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inj_on_insert AFTER INSERT ON public.injuries
  FOR EACH ROW EXECUTE FUNCTION public.on_injury_insert();

CREATE OR REPLACE FUNCTION public.on_clearance_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cleared' THEN
    UPDATE athletes SET status = 'cleared' WHERE id = NEW.athlete_id;
    IF NEW.injury_id IS NOT NULL THEN
      UPDATE injuries SET status = 'cleared' WHERE id = NEW.injury_id;
    END IF;
  ELSIF NEW.status = 'restricted' THEN
    UPDATE athletes SET status = 'recovering' WHERE id = NEW.athlete_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cr_on_insert AFTER INSERT ON public.clearance_records
  FOR EACH ROW EXECUTE FUNCTION public.on_clearance_insert();

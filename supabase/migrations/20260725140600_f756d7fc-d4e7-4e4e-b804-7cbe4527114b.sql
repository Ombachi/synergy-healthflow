ALTER TABLE public.nutrition_plans
  ALTER COLUMN athlete_id DROP NOT NULL;

ALTER TABLE public.nutrition_plans
  ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS nutrition_plans_patient_id_idx ON public.nutrition_plans(patient_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nutrition_plans_subject_chk'
  ) THEN
    ALTER TABLE public.nutrition_plans
      ADD CONSTRAINT nutrition_plans_subject_chk
      CHECK (athlete_id IS NOT NULL OR patient_id IS NOT NULL);
  END IF;
END $$;
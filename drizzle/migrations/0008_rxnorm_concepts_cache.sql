CREATE TABLE IF NOT EXISTS public.rxnorm_concepts (
  rxcui TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tty TEXT,
  synonym TEXT,
  strength TEXT,
  dose_form TEXT,
  prescribable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.rxnorm_concepts ADD COLUMN IF NOT EXISTS synonym TEXT;
ALTER TABLE public.rxnorm_concepts ADD COLUMN IF NOT EXISTS strength TEXT;
ALTER TABLE public.rxnorm_concepts ADD COLUMN IF NOT EXISTS dose_form TEXT;
ALTER TABLE public.rxnorm_concepts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_rxnorm_name_lower ON public.rxnorm_concepts (lower(name));
GRANT SELECT, INSERT, UPDATE ON public.rxnorm_concepts TO authenticated;
GRANT ALL ON public.rxnorm_concepts TO service_role;
ALTER TABLE public.rxnorm_concepts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rxnorm_read ON public.rxnorm_concepts;
CREATE POLICY rxnorm_read ON public.rxnorm_concepts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS rxnorm_insert ON public.rxnorm_concepts;
CREATE POLICY rxnorm_insert ON public.rxnorm_concepts FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS rxnorm_update ON public.rxnorm_concepts;
CREATE POLICY rxnorm_update ON public.rxnorm_concepts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';
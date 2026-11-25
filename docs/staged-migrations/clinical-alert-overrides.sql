-- Idempotent: override audit log for CDS alerts.
CREATE TABLE IF NOT EXISTS public.clinical_alert_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  patient_id uuid, visit_id uuid, prescription_id uuid,
  prescriber_id uuid NOT NULL DEFAULT auth.uid(),
  medication text NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL,
  alert_summary text NOT NULL,
  rationale_code text NOT NULL,
  rationale_text text NOT NULL
);
ALTER TABLE public.clinical_alert_overrides ADD COLUMN IF NOT EXISTS prescription_id uuid;
ALTER TABLE public.clinical_alert_overrides ADD COLUMN IF NOT EXISTS rationale_code text;
ALTER TABLE public.clinical_alert_overrides ADD COLUMN IF NOT EXISTS rationale_text text;
ALTER TABLE public.clinical_alert_overrides ADD COLUMN IF NOT EXISTS alert_summary text;
GRANT SELECT, INSERT ON public.clinical_alert_overrides TO authenticated;
GRANT ALL ON public.clinical_alert_overrides TO service_role;
ALTER TABLE public.clinical_alert_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cao_insert_own ON public.clinical_alert_overrides;
CREATE POLICY cao_insert_own ON public.clinical_alert_overrides FOR INSERT TO authenticated
  WITH CHECK (prescriber_id = auth.uid() AND public.is_staff_member());
DROP POLICY IF EXISTS cao_select_staff ON public.clinical_alert_overrides;
CREATE POLICY cao_select_staff ON public.clinical_alert_overrides FOR SELECT TO authenticated
  USING (prescriber_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'superadmin') OR public.has_role(auth.uid(),'facility_admin') OR public.has_role(auth.uid(),'pharmacist'));
GRANT SELECT ON public.drug_interactions TO authenticated;
NOTIFY pgrst, 'reload schema';

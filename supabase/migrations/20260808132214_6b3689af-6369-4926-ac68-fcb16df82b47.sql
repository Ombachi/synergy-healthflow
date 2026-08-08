ALTER TABLE public.patient_portal_invitations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.patient_portal_invitations ALTER COLUMN email DROP NOT NULL;

DROP POLICY IF EXISTS "Staff can update portal invitations" ON public.patient_portal_invitations;
CREATE POLICY "Staff can update portal invitations"
  ON public.patient_portal_invitations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'receptionist'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'receptionist'));

CREATE TABLE IF NOT EXISTS public.portal_invitation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitation_id uuid REFERENCES public.patient_portal_invitations(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  event text NOT NULL,
  reason text,
  channel text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pie_invitation ON public.portal_invitation_events(invitation_id);
CREATE INDEX IF NOT EXISTS idx_pie_patient ON public.portal_invitation_events(patient_id);
CREATE INDEX IF NOT EXISTS idx_pie_created ON public.portal_invitation_events(created_at DESC);

GRANT SELECT ON public.portal_invitation_events TO authenticated;
GRANT ALL ON public.portal_invitation_events TO service_role;

ALTER TABLE public.portal_invitation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read portal invitation events" ON public.portal_invitation_events;
CREATE POLICY "Admins read portal invitation events"
  ON public.portal_invitation_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
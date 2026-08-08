CREATE OR REPLACE FUNCTION public.tg_outbox_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM emit_outbox('stock_movement', NEW.id, 'stock.movement',
    jsonb_build_object('id', NEW.id, 'item_id', NEW.item_id, 'qty', NEW.qty, 'kind', NEW.kind));
  RETURN NEW;
END
$$;

CREATE TABLE public.patient_portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  used_at timestamptz,
  invalidated_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ppi_patient ON public.patient_portal_invitations(patient_id);
CREATE INDEX idx_ppi_active ON public.patient_portal_invitations(expires_at) WHERE used_at IS NULL AND invalidated_at IS NULL;

GRANT SELECT, INSERT ON public.patient_portal_invitations TO authenticated;
GRANT ALL ON public.patient_portal_invitations TO service_role;

ALTER TABLE public.patient_portal_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view portal invitations"
ON public.patient_portal_invitations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'receptionist')
);

CREATE POLICY "Staff can create portal invitations"
ON public.patient_portal_invitations FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'receptionist')
);

CREATE TRIGGER update_ppi_updated_at
BEFORE UPDATE ON public.patient_portal_invitations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
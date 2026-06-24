-- Kenyan insurance payers catalog and EOB lines
CREATE TABLE IF NOT EXISTS public.insurance_payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text,        -- 'public' | 'private' | 'corporate' | 'scheme'
  contact_email text,
  contact_phone text,
  claims_portal_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.insurance_payers TO authenticated;
GRANT ALL ON public.insurance_payers TO service_role;

ALTER TABLE public.insurance_payers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payers_read" ON public.insurance_payers FOR SELECT TO authenticated USING (true);
CREATE POLICY "payers_admin_write" ON public.insurance_payers
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'insurance_officer') OR public.has_role(auth.uid(),'billing_officer'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'insurance_officer') OR public.has_role(auth.uid(),'billing_officer'));

CREATE TRIGGER trg_payers_upd BEFORE UPDATE ON public.insurance_payers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed Kenyan insurers (public scheme + major private/corporate)
INSERT INTO public.insurance_payers (code, name, category) VALUES
  ('SHA',         'Social Health Authority (SHA)',           'public'),
  ('NHIF',        'National Hospital Insurance Fund (legacy)', 'public'),
  ('JUBILEE',     'Jubilee Health Insurance',                 'private'),
  ('AAR',         'AAR Insurance Kenya',                      'private'),
  ('BRITAM',      'Britam Health Insurance',                  'private'),
  ('CIC',         'CIC Insurance Group',                      'private'),
  ('APA',         'APA Insurance',                            'private'),
  ('MADISON',     'Madison Insurance',                        'private'),
  ('OLD_MUTUAL',  'Old Mutual / UAP Insurance',               'private'),
  ('RESOLUTION',  'Resolution Insurance',                     'private'),
  ('LIAISON',     'Liaison Group',                            'scheme'),
  ('HERITAGE',    'Heritage Insurance',                       'private'),
  ('GA',          'GA Insurance',                             'private'),
  ('FIRST_ASSURANCE','First Assurance (Absa)',                'private'),
  ('SANLAM',      'Sanlam Kenya',                             'private'),
  ('PACIS',       'Pacis Insurance',                          'private'),
  ('SAHAM',       'Saham Assurance',                          'private'),
  ('MINET',       'Minet Kenya (admin)',                      'scheme'),
  ('SEDGWICK',    'Sedgwick Kenya (admin)',                   'scheme'),
  ('CORPORATE_CASH','Corporate / Cash (self pay)',            'corporate')
ON CONFLICT (code) DO NOTHING;

-- Claim line items (EOB-style; what each line is for and what insurer approved)
CREATE TABLE IF NOT EXISTS public.claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  invoice_item_id uuid REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  description text NOT NULL,
  billed_cents int NOT NULL DEFAULT 0,
  approved_cents int,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_lines TO authenticated;
GRANT ALL ON public.claim_lines TO service_role;

ALTER TABLE public.claim_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claim_lines_read" ON public.claim_lines FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'insurance_officer')
      OR public.has_role(auth.uid(),'billing_officer') OR public.has_role(auth.uid(),'cashier'));
CREATE POLICY "claim_lines_write" ON public.claim_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'insurance_officer') OR public.has_role(auth.uid(),'billing_officer'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'insurance_officer') OR public.has_role(auth.uid(),'billing_officer'));

-- Extend insurance_policies with payer FK (optional; keeps insurer text for backward compatibility)
ALTER TABLE public.insurance_policies ADD COLUMN IF NOT EXISTS payer_id uuid REFERENCES public.insurance_payers(id) ON DELETE SET NULL;

-- Procurement: allow procurement role to read supporting tables
DROP POLICY IF EXISTS "proc_pos_read_proc" ON public.purchase_orders;
CREATE POLICY "proc_pos_read_proc" ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'store_keeper'));
DROP POLICY IF EXISTS "proc_pos_write_proc" ON public.purchase_orders;
CREATE POLICY "proc_pos_write_proc" ON public.purchase_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "proc_sup_read_proc" ON public.suppliers;
CREATE POLICY "proc_sup_read_proc" ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'store_keeper'));
DROP POLICY IF EXISTS "proc_sup_write_proc" ON public.suppliers;
CREATE POLICY "proc_sup_write_proc" ON public.suppliers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin'));

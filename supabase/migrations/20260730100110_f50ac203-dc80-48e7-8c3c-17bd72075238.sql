
CREATE TABLE public.vaccine_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  antigen text NOT NULL,
  manufacturer text,
  default_route text NOT NULL DEFAULT 'IM',
  default_site text NOT NULL DEFAULT 'Left deltoid',
  doses_required integer NOT NULL DEFAULT 1,
  target_group text NOT NULL DEFAULT 'child',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vaccine_catalog TO authenticated;
GRANT ALL ON public.vaccine_catalog TO service_role;
ALTER TABLE public.vaccine_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read vaccine catalog" ON public.vaccine_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "clinicians manage vaccine catalog" ON public.vaccine_catalog FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'pharmacist'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'pharmacist'));

CREATE TABLE public.kepi_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme text NOT NULL DEFAULT 'KEPI',
  vaccine_id uuid NOT NULL REFERENCES public.vaccine_catalog(id) ON DELETE CASCADE,
  dose_number integer NOT NULL DEFAULT 1,
  due_age_days integer NOT NULL DEFAULT 0,
  window_days integer NOT NULL DEFAULT 28,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme, vaccine_id, dose_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kepi_schedule TO authenticated;
GRANT ALL ON public.kepi_schedule TO service_role;
ALTER TABLE public.kepi_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read kepi schedule" ON public.kepi_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage kepi schedule" ON public.kepi_schedule FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.immunizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  encounter_id uuid,
  encounter_type text,
  vaccine_id uuid REFERENCES public.vaccine_catalog(id),
  vaccine_name text NOT NULL,
  antigen text,
  dose_number integer NOT NULL DEFAULT 1,
  route text,
  site text,
  administered_at timestamptz NOT NULL DEFAULT now(),
  batch_number text,
  expiry_date date,
  manufacturer text,
  vaccinator_id uuid,
  vaccinator_name text,
  facility text DEFAULT 'Litu Vault Hospital',
  immediate_reaction text,
  comments text,
  status text NOT NULL DEFAULT 'administered',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_immunizations_patient ON public.immunizations(patient_id, administered_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.immunizations TO authenticated;
GRANT ALL ON public.immunizations TO service_role;
ALTER TABLE public.immunizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinicians read immunizations" ON public.immunizations FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor')
  OR public.has_role(auth.uid(),'receptionist') OR public.has_role(auth.uid(),'pharmacist')
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = immunizations.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY "clinicians write immunizations" ON public.immunizations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor'));

CREATE TABLE public.vaccine_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vaccine_id uuid NOT NULL REFERENCES public.vaccine_catalog(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  expiry_date date,
  quantity integer NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 20,
  storage_location text,
  storage_temp_c numeric,
  cold_chain_ok boolean NOT NULL DEFAULT true,
  last_temp_check timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vaccine_stock TO authenticated;
GRANT ALL ON public.vaccine_stock TO service_role;
ALTER TABLE public.vaccine_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read vaccine stock" ON public.vaccine_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "clinicians manage vaccine stock" ON public.vaccine_stock FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'pharmacist') OR public.has_role(auth.uid(),'store_keeper'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'pharmacist') OR public.has_role(auth.uid(),'store_keeper'));

CREATE TABLE public.aefi_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  immunization_id uuid REFERENCES public.immunizations(id) ON DELETE SET NULL,
  onset_at timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'mild',
  description text NOT NULL,
  outcome text,
  reported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aefi_events TO authenticated;
GRANT ALL ON public.aefi_events TO service_role;
ALTER TABLE public.aefi_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinicians read aefi" ON public.aefi_events FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor') OR public.has_role(auth.uid(),'pharmacist')
);
CREATE POLICY "clinicians write aefi" ON public.aefi_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'nurse') OR public.has_role(auth.uid(),'doctor'));

CREATE TRIGGER set_vaccine_catalog_updated_at BEFORE UPDATE ON public.vaccine_catalog FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
CREATE TRIGGER set_kepi_schedule_updated_at BEFORE UPDATE ON public.kepi_schedule FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
CREATE TRIGGER set_immunizations_updated_at BEFORE UPDATE ON public.immunizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
CREATE TRIGGER set_vaccine_stock_updated_at BEFORE UPDATE ON public.vaccine_stock FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();
CREATE TRIGGER set_aefi_events_updated_at BEFORE UPDATE ON public.aefi_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_generic();

INSERT INTO public.vaccine_catalog (code, name, antigen, manufacturer, default_route, default_site, doses_required, target_group) VALUES
 ('BCG','BCG','Tuberculosis','Serum Institute of India','ID','Right upper arm',1,'child'),
 ('OPV0','Oral Polio Vaccine (birth dose)','Poliomyelitis','Bio Farma','Oral','Mouth',1,'child'),
 ('OPV','Oral Polio Vaccine','Poliomyelitis','Bio Farma','Oral','Mouth',3,'child'),
 ('IPV','Inactivated Polio Vaccine','Poliomyelitis','Sanofi Pasteur','IM','Right thigh',1,'child'),
 ('PENTA','Pentavalent (DPT-HepB-Hib)','Diphtheria, Pertussis, Tetanus, Hepatitis B, Hib','Serum Institute of India','IM','Left thigh',3,'child'),
 ('PCV10','Pneumococcal Conjugate Vaccine','Pneumococcus','GSK','IM','Right thigh',3,'child'),
 ('ROTA','Rotavirus Vaccine','Rotavirus','GSK','Oral','Mouth',2,'child'),
 ('MR','Measles-Rubella','Measles, Rubella','Serum Institute of India','SC','Left upper arm',2,'child'),
 ('YF','Yellow Fever','Yellow fever','Institut Pasteur Dakar','SC','Left upper arm',1,'child'),
 ('VITA','Vitamin A supplementation','Vitamin A','UNICEF','Oral','Mouth',1,'child'),
 ('TT','Tetanus Toxoid','Tetanus','Serum Institute of India','IM','Left deltoid',5,'adult'),
 ('HPV','Human Papillomavirus','HPV','MSD','IM','Left deltoid',2,'adolescent'),
 ('COVID19','COVID-19 Vaccine','SARS-CoV-2','Various','IM','Left deltoid',2,'adult'),
 ('INFLU','Influenza Vaccine','Influenza','Sanofi Pasteur','IM','Left deltoid',1,'adult'),
 ('HEPB-A','Hepatitis B (adult)','Hepatitis B','Serum Institute of India','IM','Left deltoid',3,'adult'),
 ('RABIES','Rabies Vaccine','Rabies','Bharat Biotech','IM','Left deltoid',5,'adult'),
 ('MENA','Meningococcal A Conjugate','Meningococcus A','Serum Institute of India','IM','Left deltoid',1,'travel'),
 ('TYPH','Typhoid Conjugate Vaccine','Salmonella typhi','Bharat Biotech','IM','Left deltoid',1,'travel');

INSERT INTO public.kepi_schedule (vaccine_id, dose_number, due_age_days, window_days, label)
SELECT v.id, s.dose, s.days, s.win, s.label FROM public.vaccine_catalog v
JOIN (VALUES
 ('BCG',1,0,14,'At birth'),
 ('OPV0',1,0,14,'At birth'),
 ('OPV',1,42,28,'6 weeks'),
 ('OPV',2,70,28,'10 weeks'),
 ('OPV',3,98,28,'14 weeks'),
 ('IPV',1,98,28,'14 weeks'),
 ('PENTA',1,42,28,'6 weeks'),
 ('PENTA',2,70,28,'10 weeks'),
 ('PENTA',3,98,28,'14 weeks'),
 ('PCV10',1,42,28,'6 weeks'),
 ('PCV10',2,70,28,'10 weeks'),
 ('PCV10',3,98,28,'14 weeks'),
 ('ROTA',1,42,28,'6 weeks'),
 ('ROTA',2,70,28,'10 weeks'),
 ('VITA',1,180,60,'6 months'),
 ('MR',1,270,30,'9 months'),
 ('YF',1,270,30,'9 months'),
 ('MR',2,540,60,'18 months'),
 ('HPV',1,3285,180,'10 years (girls)'),
 ('HPV',2,3465,180,'10 years + 6 months')
) AS s(code, dose, days, win, label) ON s.code = v.code;

INSERT INTO public.vaccine_stock (vaccine_id, batch_number, expiry_date, quantity, reorder_level, storage_location, storage_temp_c, cold_chain_ok, last_temp_check)
SELECT v.id, 'B-' || v.code || '-2601', (CURRENT_DATE + INTERVAL '9 months')::date, 120, 25, 'Vaccine fridge 1', 4.0, true, now()
FROM public.vaccine_catalog v;

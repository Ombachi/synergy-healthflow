-- Staged: structured professional council licences (apply when the database is reachable).
CREATE TABLE public.staff_licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  council text NOT NULL,
  license_number text NOT NULL,
  issue_date date,
  expiry_date date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (council, license_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_licenses TO authenticated;
GRANT ALL ON public.staff_licenses TO service_role;
ALTER TABLE public.staff_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own licenses" ON public.staff_licenses FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE POLICY "HR manage licenses" ON public.staff_licenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_officer') OR public.has_role(auth.uid(),'hr_manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_officer') OR public.has_role(auth.uid(),'hr_manager'));
CREATE OR REPLACE FUNCTION public.staff_licenses_validate() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.council NOT IN ('KMPDC','NCK','PPB','KMLTTB','COC','OTHER') THEN RAISE EXCEPTION 'Unknown council %', NEW.council; END IF;
  IF length(trim(NEW.license_number)) = 0 THEN RAISE EXCEPTION 'License number required'; END IF;
  IF NEW.issue_date IS NOT NULL AND NEW.expiry_date <= NEW.issue_date THEN RAISE EXCEPTION 'Expiry must be after issue date'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER staff_licenses_validate BEFORE INSERT OR UPDATE ON public.staff_licenses FOR EACH ROW EXECUTE FUNCTION public.staff_licenses_validate();

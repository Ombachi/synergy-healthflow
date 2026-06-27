
DROP TABLE IF EXISTS public.leave_requests CASCADE;

CREATE OR REPLACE FUNCTION public.is_hr_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','hr_officer','hr_manager')
  );
$$;

CREATE OR REPLACE FUNCTION public.calc_leave_days(_start date, _end date)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(0, (_end - _start) + 1);
$$;

CREATE TABLE public.hr_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  manager_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hr_departments TO authenticated;
GRANT ALL ON public.hr_departments TO service_role;
ALTER TABLE public.hr_departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hr_dept read" ON public.hr_departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "hr_dept write" ON public.hr_departments FOR ALL TO authenticated
  USING (public.is_hr_staff()) WITH CHECK (public.is_hr_staff());

CREATE TABLE public.employees (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_no text UNIQUE,
  full_name text NOT NULL,
  national_id text,
  date_of_birth date,
  gender text,
  phone text,
  email text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  photo_url text,
  department_id uuid REFERENCES public.hr_departments(id) ON DELETE SET NULL,
  position text,
  supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  date_hired date,
  contract_type text,
  employment_status text NOT NULL DEFAULT 'active',
  job_grade text,
  bank_name text,
  bank_branch text,
  bank_account text,
  payment_method text DEFAULT 'bank',
  qualifications text,
  licenses text,
  professional_memberships text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_supervisor_of(_emp uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.employees WHERE id=_emp AND supervisor_id=auth.uid());
$$;

CREATE POLICY "emp self read" ON public.employees FOR SELECT TO authenticated
  USING (id = auth.uid() OR supervisor_id = auth.uid() OR public.is_hr_staff());
CREATE POLICY "emp self insert" ON public.employees FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_hr_staff());
CREATE POLICY "emp self update" ON public.employees FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_hr_staff())
  WITH CHECK (id = auth.uid() OR public.is_hr_staff());
CREATE POLICY "emp hr delete" ON public.employees FOR DELETE TO authenticated USING (public.is_hr_staff());
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_employee_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.employees (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.full_name,''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_ensure_employee ON public.profiles;
CREATE TRIGGER trg_profiles_ensure_employee AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_employee_row();

INSERT INTO public.employees (id, full_name)
SELECT p.id, COALESCE(p.full_name,'')
FROM public.profiles p
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.employee_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.employee_documents TO authenticated;
GRANT ALL ON public.employee_documents TO service_role;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "emp_doc read" ON public.employee_documents FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_hr_staff() OR public.is_supervisor_of(employee_id));
CREATE POLICY "emp_doc insert" ON public.employee_documents FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid() OR public.is_hr_staff());
CREATE POLICY "emp_doc delete" ON public.employee_documents FOR DELETE TO authenticated
  USING (employee_id = auth.uid() OR public.is_hr_staff());

CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  default_days_per_year int NOT NULL DEFAULT 0,
  paid boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.leave_types TO authenticated;
GRANT ALL ON public.leave_types TO service_role;
ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lt read" ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "lt write" ON public.leave_types FOR ALL TO authenticated
  USING (public.is_hr_staff()) WITH CHECK (public.is_hr_staff());
INSERT INTO public.leave_types (code, name, default_days_per_year, paid) VALUES
  ('annual','Annual leave',21,true),
  ('sick','Sick leave',14,true),
  ('maternity','Maternity leave',90,true),
  ('paternity','Paternity leave',14,true),
  ('compassionate','Compassionate leave',7,true),
  ('study','Study leave',10,true),
  ('unpaid','Unpaid leave',0,false),
  ('special','Special leave',5,true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year int NOT NULL,
  balance_days numeric NOT NULL DEFAULT 0,
  used_days numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, leave_type_id, year)
);
GRANT SELECT, INSERT, UPDATE ON public.leave_balances TO authenticated;
GRANT ALL ON public.leave_balances TO service_role;
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lb read" ON public.leave_balances FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_hr_staff() OR public.is_supervisor_of(employee_id));
CREATE POLICY "lb write" ON public.leave_balances FOR ALL TO authenticated
  USING (public.is_hr_staff()) WITH CHECK (public.is_hr_staff());
CREATE TRIGGER trg_lb_updated BEFORE UPDATE ON public.leave_balances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE RESTRICT,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL,
  reason text,
  supporting_doc_url text,
  status text NOT NULL DEFAULT 'submitted',
  supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  supervisor_decision_at timestamptz,
  supervisor_notes text,
  hr_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hr_decision_at timestamptz,
  hr_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;
GRANT ALL ON public.leave_requests TO service_role;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lr read" ON public.leave_requests FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_hr_staff() OR public.is_supervisor_of(employee_id));
CREATE POLICY "lr self insert" ON public.leave_requests FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());
CREATE POLICY "lr update" ON public.leave_requests FOR UPDATE TO authenticated
  USING (
    (employee_id = auth.uid() AND status IN ('draft','submitted'))
    OR public.is_supervisor_of(employee_id)
    OR public.is_hr_staff()
  )
  WITH CHECK (
    (employee_id = auth.uid() AND status IN ('draft','submitted','cancelled'))
    OR public.is_supervisor_of(employee_id)
    OR public.is_hr_staff()
  );
CREATE POLICY "lr delete" ON public.leave_requests FOR DELETE TO authenticated
  USING (employee_id = auth.uid() AND status IN ('draft','submitted'));
CREATE TRIGGER trg_lr_updated BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.apply_leave_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_year int := EXTRACT(year FROM NEW.start_date)::int; v_default numeric;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT default_days_per_year INTO v_default FROM public.leave_types WHERE id = NEW.leave_type_id;
    INSERT INTO public.leave_balances(employee_id, leave_type_id, year, balance_days, used_days)
    VALUES (NEW.employee_id, NEW.leave_type_id, v_year, COALESCE(v_default,0), 0)
    ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
    UPDATE public.leave_balances
       SET used_days = used_days + NEW.days,
           balance_days = GREATEST(0, balance_days - NEW.days)
     WHERE employee_id = NEW.employee_id
       AND leave_type_id = NEW.leave_type_id
       AND year = v_year;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lr_apply_balance AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance();

CREATE TABLE public.payroll_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payroll_periods TO authenticated;
GRANT ALL ON public.payroll_periods TO service_role;
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pp read" ON public.payroll_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "pp write" ON public.payroll_periods FOR ALL TO authenticated
  USING (public.is_hr_staff()) WITH CHECK (public.is_hr_staff());

CREATE TABLE public.payslips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_id uuid NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  basic_cents int NOT NULL DEFAULT 0,
  allowances_cents int NOT NULL DEFAULT 0,
  overtime_cents int NOT NULL DEFAULT 0,
  paye_cents int NOT NULL DEFAULT 0,
  nhif_cents int NOT NULL DEFAULT 0,
  nssf_cents int NOT NULL DEFAULT 0,
  housing_levy_cents int NOT NULL DEFAULT 0,
  other_deductions_cents int NOT NULL DEFAULT 0,
  net_cents int NOT NULL DEFAULT 0,
  notes text,
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, period_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ps read" ON public.payslips FOR SELECT TO authenticated
  USING ((employee_id = auth.uid() AND published) OR public.is_hr_staff());
CREATE POLICY "ps write" ON public.payslips FOR ALL TO authenticated
  USING (public.is_hr_staff()) WITH CHECK (public.is_hr_staff());

CREATE TABLE public.payslip_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_id uuid NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  amount_cents int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslip_lines TO authenticated;
GRANT ALL ON public.payslip_lines TO service_role;
ALTER TABLE public.payslip_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psl read" ON public.payslip_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.payslips p
    WHERE p.id = payslip_id AND ((p.employee_id = auth.uid() AND p.published) OR public.is_hr_staff())
  ));
CREATE POLICY "psl write" ON public.payslip_lines FOR ALL TO authenticated
  USING (public.is_hr_staff()) WITH CHECK (public.is_hr_staff());

CREATE TABLE public.hr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  title text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  file_path text,
  description text,
  requires_ack boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  expires_at date,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_documents TO authenticated;
GRANT ALL ON public.hr_documents TO service_role;
ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrd read" ON public.hr_documents FOR SELECT TO authenticated
  USING (published OR public.is_hr_staff());
CREATE POLICY "hrd write" ON public.hr_documents FOR ALL TO authenticated
  USING (public.is_hr_staff()) WITH CHECK (public.is_hr_staff());
CREATE TRIGGER trg_hrd_updated BEFORE UPDATE ON public.hr_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.hr_document_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.hr_documents(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, employee_id)
);
GRANT SELECT, INSERT ON public.hr_document_acks TO authenticated;
GRANT ALL ON public.hr_document_acks TO service_role;
ALTER TABLE public.hr_document_acks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hra read" ON public.hr_document_acks FOR SELECT TO authenticated
  USING (employee_id = auth.uid() OR public.is_hr_staff());
CREATE POLICY "hra write" ON public.hr_document_acks FOR INSERT TO authenticated
  WITH CHECK (employee_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_hr_document_published()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.published AND NEW.requires_ack AND (OLD.published IS DISTINCT FROM true) THEN
    INSERT INTO public.notifications(recipient_id,type,title,body,link,entity_type,entity_id)
    SELECT e.id,'hr_doc','New policy requires acknowledgement',
           NEW.title || ' (' || NEW.category || ')',
           '/hr/documents','hr_document',NEW.id
    FROM public.employees e
    WHERE e.employment_status = 'active';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hrd_notify AFTER UPDATE ON public.hr_documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_hr_document_published();

CREATE INDEX IF NOT EXISTS idx_emp_dept ON public.employees(department_id);
CREATE INDEX IF NOT EXISTS idx_emp_supervisor ON public.employees(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_lr_emp ON public.leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_lr_supervisor ON public.leave_requests(supervisor_id, status);
CREATE INDEX IF NOT EXISTS idx_ps_emp ON public.payslips(employee_id, period_id);
CREATE INDEX IF NOT EXISTS idx_hrd_published ON public.hr_documents(published, category);

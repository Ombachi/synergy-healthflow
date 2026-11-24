ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS basic_salary_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS allowances_cents integer NOT NULL DEFAULT 0;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS kra_pin text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS tax_resident boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS payslips_employee_period_uniq ON public.payslips(employee_id, period_id);
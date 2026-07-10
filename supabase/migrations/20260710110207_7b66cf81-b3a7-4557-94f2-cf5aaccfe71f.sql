
-- 1. New role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admissions_officer';

-- 2. Extend discharge_summaries with structured fields
ALTER TABLE public.discharge_summaries
  ADD COLUMN IF NOT EXISTS patient_id uuid,
  ADD COLUMN IF NOT EXISTS admission_id uuid,
  ADD COLUMN IF NOT EXISTS diagnosis text,
  ADD COLUMN IF NOT EXISTS hospital_course text,
  ADD COLUMN IF NOT EXISTS discharge_medications text,
  ADD COLUMN IF NOT EXISTS discharged_by uuid,
  ADD COLUMN IF NOT EXISTS discharged_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS preauth_id uuid,
  ADD COLUMN IF NOT EXISTS clearance_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS source_data jsonb;

ALTER TABLE public.discharge_summaries ALTER COLUMN visit_id DROP NOT NULL;


-- ============ helper to keep DDL terse ============
-- (no helper, just explicit DROP/CREATE)

-- ============ PATIENTS ============
DROP POLICY IF EXISTS "Authenticated can view patients" ON public.patients;
DROP POLICY IF EXISTS "patients_clinical_select" ON public.patients;
DROP POLICY IF EXISTS "Doctors/admins manage patients" ON public.patients;

CREATE POLICY "patients_select_scoped" ON public.patients FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'physio')
  OR has_role(auth.uid(),'nutritionist')
  OR has_role(auth.uid(),'lab_tech')
  OR has_role(auth.uid(),'radiologist')
  OR has_role(auth.uid(),'pharmacist')
);

CREATE POLICY "patients_staff_write" ON public.patients FOR ALL
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
)
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
);

-- ============ ATHLETES ============
DROP POLICY IF EXISTS "Authenticated can view athletes" ON public.athletes;
CREATE POLICY "athletes_select_scoped" ON public.athletes FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'coach')
  OR has_role(auth.uid(),'physio')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nutritionist')
  OR has_role(auth.uid(),'team_manager')
  OR has_role(auth.uid(),'nurse')
);

-- ============ APPOINTMENTS ============
DROP POLICY IF EXISTS appt_select ON public.appointments;
DROP POLICY IF EXISTS appt_insert ON public.appointments;
DROP POLICY IF EXISTS appt_update ON public.appointments;

CREATE POLICY appt_staff_select ON public.appointments FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'physio')
  OR has_role(auth.uid(),'nutritionist')
  OR doctor_id = auth.uid()
);

CREATE POLICY appt_staff_insert ON public.appointments FOR INSERT
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
);

CREATE POLICY appt_staff_update ON public.appointments FOR UPDATE
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
  OR doctor_id = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
  OR doctor_id = auth.uid()
);

-- ============ INVOICES ============
DROP POLICY IF EXISTS inv_select ON public.invoices;
DROP POLICY IF EXISTS inv_write ON public.invoices;

CREATE POLICY inv_select_scoped ON public.invoices FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
  OR has_role(auth.uid(),'pharmacist')
  OR EXISTS (SELECT 1 FROM patients p WHERE p.id = invoices.patient_id AND p.user_id = auth.uid())
);

CREATE POLICY inv_write_billing ON public.invoices FOR ALL
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
)
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
);

-- ============ INVOICE ITEMS ============
DROP POLICY IF EXISTS invi_select ON public.invoice_items;
DROP POLICY IF EXISTS invi_write ON public.invoice_items;

CREATE POLICY invi_select_scoped ON public.invoice_items FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'pharmacist')
  OR EXISTS (
    SELECT 1 FROM invoices i JOIN patients p ON p.id = i.patient_id
    WHERE i.id = invoice_items.invoice_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY invi_write_billing ON public.invoice_items FOR ALL
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
)
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
);

-- ============ PAYMENTS ============
DROP POLICY IF EXISTS pay_select ON public.payments;
DROP POLICY IF EXISTS pay_write ON public.payments;

CREATE POLICY pay_select_scoped ON public.payments FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
  OR EXISTS (
    SELECT 1 FROM invoices i JOIN patients p ON p.id = i.patient_id
    WHERE i.id = payments.invoice_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY pay_write_billing ON public.payments FOR ALL
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
)
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'insurance_officer')
);

-- ============ INSURANCE POLICIES ============
DROP POLICY IF EXISTS ipol_select ON public.insurance_policies;
DROP POLICY IF EXISTS ipol_write ON public.insurance_policies;

CREATE POLICY ipol_select_scoped ON public.insurance_policies FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'receptionist')
  OR EXISTS (SELECT 1 FROM patients p WHERE p.id = insurance_policies.patient_id AND p.user_id = auth.uid())
);

CREATE POLICY ipol_write_scoped ON public.insurance_policies FOR ALL
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'billing_officer')
)
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'billing_officer')
);

-- ============ INSURANCE CLAIMS ============
DROP POLICY IF EXISTS icl_select ON public.insurance_claims;
DROP POLICY IF EXISTS icl_write ON public.insurance_claims;

CREATE POLICY icl_select_scoped ON public.insurance_claims FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'billing_officer')
  OR has_role(auth.uid(),'cashier')
);

CREATE POLICY icl_write_scoped ON public.insurance_claims FOR ALL
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'billing_officer')
)
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'insurance_officer')
  OR has_role(auth.uid(),'billing_officer')
);

-- ============ PROCEDURE ORDERS ============
DROP POLICY IF EXISTS proc_select ON public.procedure_orders;

CREATE POLICY proc_select_scoped ON public.procedure_orders FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR EXISTS (
    SELECT 1 FROM visits v JOIN patients p ON p.id = v.patient_id
    WHERE v.id = procedure_orders.visit_id AND p.user_id = auth.uid()
  )
);

-- ============ TRIAGE RECORDS ============
DROP POLICY IF EXISTS tri_select ON public.triage_records;

CREATE POLICY tri_select_scoped ON public.triage_records FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR EXISTS (
    SELECT 1 FROM visits v JOIN patients p ON p.id = v.patient_id
    WHERE v.id = triage_records.visit_id AND p.user_id = auth.uid()
  )
);

-- ============ VISIT QUEUE ============
DROP POLICY IF EXISTS q_select ON public.visit_queue;
DROP POLICY IF EXISTS q_write ON public.visit_queue;

CREATE POLICY q_select_staff ON public.visit_queue FOR SELECT
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
  OR has_role(auth.uid(),'lab_tech')
  OR has_role(auth.uid(),'radiologist')
  OR has_role(auth.uid(),'pharmacist')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
);

CREATE POLICY q_write_staff ON public.visit_queue FOR ALL
USING (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
  OR has_role(auth.uid(),'lab_tech')
  OR has_role(auth.uid(),'radiologist')
  OR has_role(auth.uid(),'pharmacist')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
)
WITH CHECK (
  has_role(auth.uid(),'admin')
  OR has_role(auth.uid(),'doctor')
  OR has_role(auth.uid(),'nurse')
  OR has_role(auth.uid(),'receptionist')
  OR has_role(auth.uid(),'lab_tech')
  OR has_role(auth.uid(),'radiologist')
  OR has_role(auth.uid(),'pharmacist')
  OR has_role(auth.uid(),'cashier')
  OR has_role(auth.uid(),'billing_officer')
);

-- ============ STORAGE: lab-files & imaging-files UPDATE/DELETE ============
DROP POLICY IF EXISTS "lab_files_update_owner" ON storage.objects;
DROP POLICY IF EXISTS "lab_files_delete_owner" ON storage.objects;
DROP POLICY IF EXISTS "imaging_files_update_owner" ON storage.objects;
DROP POLICY IF EXISTS "imaging_files_delete_owner" ON storage.objects;

CREATE POLICY "lab_files_update_owner" ON storage.objects FOR UPDATE
USING (bucket_id = 'lab-files' AND (owner = auth.uid() OR has_role(auth.uid(),'admin')))
WITH CHECK (bucket_id = 'lab-files' AND (owner = auth.uid() OR has_role(auth.uid(),'admin')));

CREATE POLICY "lab_files_delete_owner" ON storage.objects FOR DELETE
USING (bucket_id = 'lab-files' AND (owner = auth.uid() OR has_role(auth.uid(),'admin')));

CREATE POLICY "imaging_files_update_owner" ON storage.objects FOR UPDATE
USING (bucket_id = 'imaging-files' AND (owner = auth.uid() OR has_role(auth.uid(),'admin')))
WITH CHECK (bucket_id = 'imaging-files' AND (owner = auth.uid() OR has_role(auth.uid(),'admin')));

CREATE POLICY "imaging_files_delete_owner" ON storage.objects FOR DELETE
USING (bucket_id = 'imaging-files' AND (owner = auth.uid() OR has_role(auth.uid(),'admin')));

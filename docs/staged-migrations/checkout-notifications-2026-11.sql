-- Visit checkout invoicing, department notifications, HR field lock, lab template ownership.
-- Idempotent: safe to re-run.

-- 1. Lab templates: facility administrators (lab director) only.
DROP POLICY IF EXISTS lrt_admin_write ON public.lab_result_templates;
CREATE POLICY lrt_admin_write ON public.lab_result_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'facility_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'facility_admin'::public.app_role));

-- 2. Checkout: aggregate unbilled services for a visit into an issued invoice.
CREATE OR REPLACE FUNCTION public.checkout_visit(_visit_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; inv uuid;
BEGIN
  SELECT id, patient_id INTO v FROM public.visits WHERE id = _visit_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Visit not found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_staff_member() THEN RAISE EXCEPTION 'Staff access required'; END IF;

  SELECT id INTO inv FROM public.invoices WHERE visit_id = _visit_id AND status NOT IN ('void','paid') ORDER BY created_at LIMIT 1;
  IF inv IS NULL THEN
    INSERT INTO public.invoices (patient_id, visit_id, status, total_cents, paid_cents, created_by, notes)
    VALUES (v.patient_id, _visit_id, 'issued', 0, 0, auth.uid(), 'Auto-generated at checkout') RETURNING id INTO inv;
  END IF;

  -- Lab tests not yet billed (catalog price is in KES).
  INSERT INTO public.invoice_items (invoice_id, kind, description, qty, unit_price_cents, amount_cents, ref_table, ref_id)
  SELECT inv, 'lab', c.name, 1, round(coalesce(c.price,0)*100)::int, round(coalesce(c.price,0)*100)::int, 'lab_orders', o.id
  FROM public.lab_orders o JOIN public.lab_tests_catalog c ON c.id = o.test_id
  WHERE o.visit_id = _visit_id AND o.status NOT IN ('cancelled','rejected')
    AND NOT EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.ref_table='lab_orders' AND ii.ref_id=o.id);

  -- Imaging priced from the service catalogue by modality.
  INSERT INTO public.invoice_items (invoice_id, kind, description, qty, unit_price_cents, amount_cents, ref_table, ref_id)
  SELECT inv, 'imaging', i.modality || coalesce(' — '||i.body_part,''), 1, coalesce(sc.unit_price_cents,0), coalesce(sc.unit_price_cents,0), 'imaging_orders', i.id
  FROM public.imaging_orders i
  LEFT JOIN LATERAL (SELECT unit_price_cents FROM public.service_catalog s WHERE s.active AND (s.code ILIKE i.modality OR s.name ILIKE i.modality||'%') LIMIT 1) sc ON true
  WHERE i.visit_id = _visit_id AND i.status NOT IN ('cancelled','rejected')
    AND NOT EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.ref_table='imaging_orders' AND ii.ref_id=i.id);

  -- One consultation fee per visit when a consultation service exists.
  INSERT INTO public.invoice_items (invoice_id, kind, description, qty, unit_price_cents, amount_cents, ref_table, ref_id)
  SELECT inv, 'consultation', s.name, 1, s.unit_price_cents, s.unit_price_cents, 'visits', _visit_id
  FROM public.service_catalog s
  WHERE s.active AND s.category ILIKE 'consult%'
    AND NOT EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.ref_table='visits' AND ii.ref_id=_visit_id)
  ORDER BY s.unit_price_cents LIMIT 1;

  UPDATE public.invoices SET total_cents = (SELECT coalesce(sum(amount_cents),0) FROM public.invoice_items WHERE invoice_id = inv),
    status = CASE WHEN status = 'draft' THEN 'issued' ELSE status END, updated_at = now()
  WHERE id = inv;
  RETURN inv;
END $$;
REVOKE ALL ON FUNCTION public.checkout_visit(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.checkout_visit(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_visit_checkout() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('completed','closed','discharged') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.checkout_visit(NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS visit_checkout ON public.visits;
CREATE TRIGGER visit_checkout AFTER UPDATE OF status ON public.visits FOR EACH ROW EXECUTE FUNCTION public.trg_visit_checkout();

-- 3. Notifications: new policy, payslip, lab result ready.
CREATE OR REPLACE FUNCTION public.trg_notify_policy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.published AND (TG_OP = 'INSERT' OR NOT OLD.published) THEN
    INSERT INTO public.notifications (recipient_id, type, title, body, link, entity_type, entity_id)
    SELECT DISTINCT uf.user_id, 'policy_published', 'New Policy Published: ' || NEW.title, NEW.description, '/hr/documents', 'hr_document', NEW.id
    FROM public.user_facilities uf
    WHERE (NEW.facility_id IS NULL OR uf.facility_id = NEW.facility_id) AND uf.user_id IS DISTINCT FROM NEW.uploaded_by;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_policy ON public.hr_documents;
CREATE TRIGGER notify_policy AFTER INSERT OR UPDATE OF published ON public.hr_documents FOR EACH ROW EXECUTE FUNCTION public.trg_notify_policy();

CREATE OR REPLACE FUNCTION public.trg_notify_payslip() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lbl text;
BEGIN
  IF NEW.published AND (TG_OP = 'INSERT' OR NOT OLD.published) THEN
    SELECT label INTO lbl FROM public.payroll_periods WHERE id = NEW.period_id;
    INSERT INTO public.notifications (recipient_id, type, title, link, entity_type, entity_id)
    VALUES (NEW.employee_id, 'payslip', 'Your payslip for ' || coalesce(lbl,'this month') || ' is available', '/hr/payslips', 'payslip', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_payslip ON public.payslips;
CREATE TRIGGER notify_payslip AFTER INSERT OR UPDATE OF published ON public.payslips FOR EACH ROW EXECUTE FUNCTION public.trg_notify_payslip();

CREATE OR REPLACE FUNCTION public.trg_notify_lab_ready() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pname text;
BEGIN
  IF NEW.status IN ('resulted','verified','reported','completed') AND OLD.status IS DISTINCT FROM NEW.status AND NEW.ordered_by IS NOT NULL THEN
    SELECT full_name INTO pname FROM public.patients WHERE id = NEW.patient_id;
    INSERT INTO public.notifications (recipient_id, type, title, link, entity_type, entity_id)
    VALUES (NEW.ordered_by, 'lab_result', 'Lab result ready for ' || coalesce(pname,'patient'),
            CASE WHEN NEW.visit_id IS NOT NULL THEN '/visits/' || NEW.visit_id ELSE '/completed' END, 'lab_order', NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notify_lab_ready ON public.lab_orders;
CREATE TRIGGER notify_lab_ready AFTER UPDATE OF status ON public.lab_orders FOR EACH ROW EXECUTE FUNCTION public.trg_notify_lab_ready();

-- 4. Employees cannot edit their own banking or professional fields.
CREATE OR REPLACE FUNCTION public.trg_lock_employee_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() = NEW.id AND NOT (public.has_role(auth.uid(),'hr'::public.app_role) OR public.has_role(auth.uid(),'facility_admin'::public.app_role)) THEN
    IF (NEW.bank_name, NEW.bank_branch, NEW.bank_account, NEW.licenses, NEW.qualifications, NEW.professional_memberships, NEW.kra_pin)
       IS DISTINCT FROM (OLD.bank_name, OLD.bank_branch, OLD.bank_account, OLD.licenses, OLD.qualifications, OLD.professional_memberships, OLD.kra_pin) THEN
      RAISE EXCEPTION 'Banking and professional details are managed by HR';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lock_employee_fields ON public.employees;
CREATE TRIGGER lock_employee_fields BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.trg_lock_employee_fields();

-- 5. SOP downloads: signed-in staff can read published HR documents.
DROP POLICY IF EXISTS "hr docs staff read" ON storage.objects;
CREATE POLICY "hr docs staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hr-documents' AND public.is_staff_member());

NOTIFY pgrst, 'reload schema';

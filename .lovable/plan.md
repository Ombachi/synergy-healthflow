# Implementation Plan — Gaps + Role Dashboards

You already have: roles, profiles, visits, vitals, prescriptions, lab/imaging orders, results, dispenses, ICD-11, notifications, audit logs, basic inventory, athletes, message threads with attachments, visit timer, assignment.

This plan fills the missing pieces and adds the new dashboards. Delivered in 3 phases so each phase lands working code.

---

## Phase 1 — Patient flow completion + Billing/Insurance + Receptionist/Cashier dashboards

### New tables (migration 1)
- `appointments` — patient_id, scheduled_at, doctor_id, reason, status (booked/checked_in/cancelled/no_show), created_by
- `visit_queue` — visit_id, queue_type (triage/doctor/lab/radiology/pharmacy/billing), priority (1-5), entered_at, called_at, served_at
- `triage_records` — visit_id, nurse_id, chief_complaint, acuity (ESI 1-5), notes
- `procedure_orders` — visit_id, ordered_by, procedure_name, code, status (ordered/in_progress/completed/cancelled), performed_by, performed_at, notes
- `invoices` — visit_id, patient_id, total_cents, status (draft/issued/partially_paid/paid/void), created_by
- `invoice_items` — invoice_id, kind (consultation/lab/imaging/procedure/pharmacy/other), ref_id, description, qty, unit_price_cents, amount_cents
- `payments` — invoice_id, amount_cents, method (cash/card/mpesa/insurance/other), reference, received_by, received_at
- `insurance_policies` — patient_id, insurer, member_number, scheme, valid_from, valid_to, active
- `insurance_claims` — invoice_id, policy_id, preauth_code, status (pending/approved/rejected/paid), approved_amount_cents, notes, processed_by

Add to `visits`: `billing_cleared_at`, `pharmacy_cleared_at` (timestamps).

### Status machine
Extend `visit_stages.stage` enum/text values to include: `registered`, `checked_in`, `waiting_triage`, `triaged`, `waiting_doctor`, `under_consultation`, `orders_pending`, `results_complete`, `awaiting_billing`, `awaiting_pharmacy`, `discharged`, `closed`, `cancelled`. Trigger auto-advances stage on key events.

### Triggers
- New invoice line auto-inserts when prescription / lab_order / imaging_order / procedure_order is created (configurable price book — flat default).
- Discharge blocked unless invoice.status in (paid, approved-by-insurance) — enforced via DB function `can_discharge(visit_id)`; UI uses it too.
- Pharmacy dispense blocked unless `pharmacy_cleared_at` set OR insurance pre-auth approved — enforced in `pharmacy_dispenses` BEFORE INSERT trigger.
- Notify cashier role on invoice.issued; notify doctor on results_complete; notify receptionist on appointment booked.

### New routes / dashboards
- `/appointments` — list + create (receptionist/patient/admin)
- `/reception` — receptionist dashboard: today's appointments, walk-in check-in, queue board, patient search
- `/billing` — cashier dashboard: open invoices, take payment, insurance claims, daily cash report
- `/insurance` — insurance officer: policies CRUD, pre-auth queue, claim status
- `/queue` — live queue board per department (read-only big-screen view)
- New panels inside `/visits/$visitId`: Triage, Procedures, Invoice, Insurance

---

## Phase 2 — Athlete module deepening + Coach/Team Manager/Physio/Nutritionist dashboards

### New tables (migration 2)
- `teams` — name, sport, season, manager_id
- `team_members` — team_id, athlete_id, position, jersey_no, joined_at, left_at
- `assessments` — athlete_id, type (baseline/periodic), assessor_id, metrics jsonb, performed_at
- `training_plans` — team_id or athlete_id, title, start_date, end_date, created_by, goals
- `training_sessions` — plan_id, scheduled_at, location, focus, status (planned/done/cancelled)
- `attendance` — session_id, athlete_id, status (present/absent/late/excused), recorded_by
- `performance_records` — athlete_id, session_id?, metric, value, unit, recorded_at, recorded_by
- `injuries` — athlete_id, reported_at, reported_by, body_part, severity, mechanism, status (active/recovering/cleared)
- `treatment_plans` — injury_id, physio_id, plan, start_date, end_date
- `recovery_sessions` — treatment_plan_id, performed_at, notes, progress_pct
- `clearance_records` — athlete_id, injury_id?, status (cleared/restricted/not_cleared), cleared_by, valid_until, notes
- `nutrition_plans` — athlete_id, nutritionist_id, plan jsonb, start_date, end_date, compliance_pct
- `competitions` — name, sport, date, venue, team_id, opponents, result

### Status flow on `athletes.status`: active, in_assessment, training, injured, under_treatment, recovering, cleared, competing, archived. Trigger auto-updates on injury insert and clearance insert.

### Dashboards
- `/coach` — teams, today's sessions, attendance, performance trends
- `/team-manager` — rosters, competitions calendar, season planner
- `/physio` — active injuries queue, treatment plans, clearance approvals
- `/nutrition` — athletes assigned, plan editor, compliance tracking
- `/athlete-portal` (extend `/me` when role=athlete) — plan, attendance, performance, injuries

---

## Phase 3 — Inventory deepening + Storekeeper/Procurement/Auditor dashboards

### New tables (migration 3)
- `item_categories` — name, parent_id
- `suppliers` — name, contact, email, phone, address, payment_terms, active
- `stock_locations` — name, kind (main_store/pharmacy/lab/ward), in_charge_id
- `stock_batches` — item_id, batch_no, expiry_date, qty_on_hand, location_id, cost_cents
- `stock_requests` — requester_id, department, location_id, status (draft/requested/approved/rejected/fulfilled), notes
- `stock_request_items` — request_id, item_id, qty_requested, qty_approved, qty_issued
- `purchase_orders` — supplier_id, status (draft/sent/partial/received/cancelled), created_by, expected_at
- `purchase_order_items` — po_id, item_id, qty, unit_cost_cents
- `goods_received_notes` — po_id, received_by, received_at, notes
- `grn_items` — grn_id, item_id, batch_no, expiry, qty, unit_cost_cents, location_id
- `stock_movements` — item_id, batch_id, location_from, location_to, qty, kind (receipt/issue/transfer/adjustment/return/writeoff/consumption), ref_table, ref_id, performed_by
- `inventory_adjustments` — batch_id, qty_delta, reason, approved_by
- `writeoffs` — batch_id, qty, reason (expired/damaged/lost), approved_by
- `reorder_alerts` — generated view + materialized snapshot, item_id, location_id, current_qty, reorder_level

### Triggers
- Pharmacy dispense → stock_movement (kind=consumption), batch qty decremented FEFO (earliest expiry first).
- Lab/imaging consumables similarly when results filed (optional checkbox).
- Nightly job (pg_cron) → expire batches past expiry, emit notifications.
- Low stock notification to storekeeper + procurement role.

### Dashboards
- `/store` — storekeeper: receive POs (create GRN), issue stock, transfer between locations, batch/expiry view
- `/procurement` — procurement officer: pending requests, create POs, supplier management, PO tracking
- `/audit-inventory` — auditor: stock movements log, variance reports, writeoff approvals, expiry report
- Extend `/inventory` with batch/expiry columns, FEFO indicator, location filter

---

## Shared / cross-cutting

- Email channel: add `email-notifications.functions.ts` (server fn) that mirrors notification inserts via Lovable transactional email when `notifications.send_email = true`. Add a `notification_preferences` table per user.
- Role-aware sidebar: groups (Clinical, Front office, Pharmacy/Lab/Imaging, Athletes, Inventory, Admin), only show items the user's role permits. Active route highlighted.
- Status badges: shared `<StatusBadge kind="visit"/"inventory"/"injury">` with color tokens in `src/styles.css` (no hardcoded colors).
- Audit trail: extend existing `log_clinical_change` trigger to new clinical tables; add `log_inventory_change`, `log_athlete_change` similarly.
- RLS: every new table gets `GRANT` + RLS + role-scoped policies; assigned clinicians keep access via `has_role` + assignment checks.

---

## Sequencing

1. **Phase 1 migration + 5 new routes** (1 turn, biggest)
2. **Phase 2 migration + 5 new routes** (1 turn)
3. **Phase 3 migration + 4 new routes** (1 turn)
4. **Email channel + role-aware sidebar polish** (1 turn)

Each phase is independently shippable. Existing screens keep working throughout.

---

## What I will NOT do without further confirmation

- Replace existing screens or change current routing of working pages.
- Add SMS/WhatsApp (you said in-app + email only).
- Build a price book editor UI — Phase 1 ships flat default prices per kind (consultation 1000, lab 500, imaging 2000, procedure 1500, pharmacy = sum of dispense lines). You can edit prices in DB or I add an editor later.
- Touch the seed-demo users or admin role flows.

Reply "go" to start Phase 1, or tell me what to change.
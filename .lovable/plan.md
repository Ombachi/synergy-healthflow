
## Delivery Plan

You picked all 4 feature batches + 4 infra items. Realistically that's ~4 focused turns of code + 1 documentation turn. I'll do them in this order (each turn = 1 migration + UI + a smoke test):

### Turn 1 — Batch A: Clinical Safety
- **E-signature**: `signatures` table (entity_type, entity_id, signer_id, signed_at, hash). Sign action on discharge summaries + prescriptions locks the record (trigger blocks UPDATE when signed). Signature block rendered on PDFs.
- **Controlled drugs register**: `drug_catalog.schedule` (I,II,III,IV,V) + `controlled_drug_register` table (item_id, batch_id, direction, qty, patient_id, prescriber_id, witness_id, running_balance). Auto-post on pharmacy dispense of scheduled drugs. Register view for pharmacist/admin.
- **Barcode/QR**: JsBarcode + qrcode.react. Wristband print page `/print/wristband/$patientId` (MRN barcode), sample tube label `/print/sample/$sampleId`, drug pack `/print/drug/$batchId`.
- **Printable Rx**: `/print/prescription/$rxId` with hospital letterhead, prescriber signature block, QR encoding `{rxId, hash}` → public verify route `/verify/rx/$rxId`.

### Turn 2 — Batch B: Compliance & Audit
- **Soft-delete**: add `deleted_at`, `deleted_by`, `deletion_reason` to patients + visits. Update RLS to filter `deleted_at IS NULL` for non-admins. Restore action for admins. Audit trigger already exists — extend to log deletes.
- **Consent versioning**: `consent_templates` (versioned) + `consents.template_version` + `consent_events` (granted/withdrawn/superseded). UI shows history timeline.
- **Breach notification**: `breach_incidents` table (severity, affected_patients, discovered_at, notified_at, notification_channel, dpa_ref). Admin workflow: log → assess → notify → close. 72-hour countdown per Kenya DPA.
- **Access reviews**: `access_reviews` table (quarter, reviewer_id, status) + `access_review_items` (user_id, role, decision: keep/revoke). Admin route auto-generates quarterly review from `user_roles`.

### Turn 3 — Batch C: Finance Ops
- **Cash reconciliation**: `cash_sessions` (cashier_id, opened_at, opening_float, closed_at, declared_cash, system_cash, variance_cents). End-of-shift close screen calculates from `payments` where method='cash'.
- **Credit notes / refunds**: `credit_notes` (invoice_id, reason, amount_cents, approved_by) → posts negative `payments` line. Refund workflow: request → approve → issue. Blocks refund > paid amount.

### Turn 4 — Batch D: Ops Visibility
- **SLA dashboard**: materialized view of lab TAT (order→result) & radiology TAT (order→report). Breach thresholds (lab 4h routine / 1h stat; radiology 24h / 2h stat). `/sla` route with red/amber/green tiles + breach list.
- **Queue display**: `/display/queue` public route (no auth, kiosk mode), large font, auto-refresh 15s, shows "Now serving" + "Next 5" per department. Realtime subscription to `visit_queue`.
- **pg_cron**: hourly `refresh_admin_kpis()`, nightly `refresh_sla_views()`, 15-min stale-lab-order alerts.
- **Error monitoring hook**: wire `src/lib/lovable-error-reporting.ts` into a central `logError()` that also inserts into new `error_events` table (env, route, message, stack, user_id, occurred_at) so admins have an in-app error log even without Sentry.

### Turn 5 — Infra Runbook (documentation only)
Single doc `/mnt/documents/vitalis-infra-runbook.md` covering:
- **PHI encryption**: envelope encryption pattern with Web Crypto (AES-GCM) + key stored per-user; caveats vs true KMS.
- **PITR / backups**: how to verify in Lovable Cloud, restore drill checklist, RTO/RPO targets.
- **Rate limiting**: Postgres token-bucket function example (`rl_check(user_id, bucket, limit, window)`) usable inside server functions.
- **Read replicas / caching**: staged plan — start with materialized views + React Query cache tuning; graduate to Supabase read replica when >200 concurrent users; edge caching for public routes.
- **Sentry**: exact hook points in `src/lib/lovable-error-reporting.ts` and `src/server.ts`.
- **Pen-test / SOC-lite**: OWASP ASVS L1 checklist mapped to current controls, quarterly cadence.

### What I need from you
Confirm this phasing. On approval I start **Turn 1 (Clinical Safety)** immediately. Each subsequent turn is a single "next" from you — that way you can review and stop if credits get tight.

### Credit note
Each turn is ~1 migration + 4–8 files. Turns 1 and 2 are the heaviest (~15 files each). If you want to compress, tell me to merge Turns 3+4 (feasible) or Turns 1+2 (risky — schema surface too big).

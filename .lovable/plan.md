# Litu Vault rebrand + encounter-driven clinical refactor

Big turn. Splitting into a clear sequence so nothing regresses. I'll do it in **three sub-turns**; this plan covers all three, and I'll ship them one after another unless you say otherwise.

## Sub-turn 1 — Rebrand + homepage + RBAC audit (safe, no schema)

**Rename Vitalis → Litu Vault**
- Landing page (`src/routes/index.tsx`): new hero built around a vault metaphor — "Your health records, locked in the vault." Prominent Sign in / Create account CTAs above the fold, secondary trust strip (encrypted, audited, role-gated). Generate a Litu Vault logo (vault door + cross motif) as an SVG asset.
- Auth page copy, sidebar header, root `<title>` / meta / og tags → "Litu Vault".
- Toaster + any hard-coded "Vitalis" strings across routes swept.

**Homepage layout**
- Left: logo, tagline, two big buttons (Sign in, Create account).
- Right: vault-illustration card with three trust bullets (RBAC, audit trail, encrypted records).
- Footer strip: "Trusted like a bank vault. Built for clinicians."

**RBAC audit**
- Re-verify `role-permissions.ts`: procurement, store_keeper, HR, cashier cannot reach `/lab`, `/lab-order`, `/radiology`, `/pharmacy`, `/prescribe`, or their queues. Add a small unit-style assertion file (`src/lib/__rbac_check.ts`) that runs at import to warn in dev if a forbidden pair sneaks back.
- Sidebar already role-filters; confirm Laboratory / Radiology / Pharmacy groups are hidden for procurement/store_keeper/HR/cashier.

## Sub-turn 2 — Encounter-aware queues (no schema change)

Use existing `visit_id` (outpatient) vs `admission_id` (inpatient) as the encounter discriminator. On each queue page, add an **Outpatient | Inpatient | All** tab set:

- `/lab` — split lab_orders by whether the linked visit has an active admission.
- `/radiology` — same split on imaging_orders.
- `/pharmacy` — split prescriptions / medication_orders (MAR entries are inpatient by definition).
- `/nutrition` — split nutrition_plans / allied_health_notes by encounter.
- `/queue` (nurse) — split visit_queue rows: outpatient = visit without admission, inpatient = visit with admission.

Ward filter dropdown for the nurse inpatient tab (reads `admissions.ward_id`).

## Sub-turn 3 — Schema + clinical_tasks + visit/admission unification

**Migration**
- Add `encounter_id UUID` + `encounter_type TEXT CHECK IN ('visit','admission')` to: `lab_orders`, `lab_results`, `lab_samples`, `imaging_orders`, `prescriptions`, `medication_orders`, `procedure_orders`, `nutrition_plans`, `allied_health_notes`, `visit_diagnoses`, `vitals`.
- Backfill: `encounter_id = COALESCE(admission_id, visit_id)`, `encounter_type` = whichever matched.
- Trigger `set_encounter_from_source()` on insert to populate both from whichever id the caller supplies.
- New table `clinical_tasks` (id, encounter_id, encounter_type, patient_id, kind, source_table, source_id, assigned_role, assigned_to, status[pending|in_progress|done|cancelled], priority, due_at, created_at, updated_at, completed_at, completed_by). RLS: creator + assigned_role + admin. Grants for authenticated + service_role.
- Triggers on lab_orders / imaging_orders / prescriptions / procedure_orders / medication_orders insert → create matching `clinical_tasks` row assigned to the correct role.
- Auto-attach: lab_results already have order_id; extend `auto_flag_lab_result` (or new trigger) to copy `encounter_id`/`encounter_type` from the parent order so patient timelines can query by encounter directly.

**/visits/$visitId enhancements**
- If the visit has an active admission (join on `admissions.visit_id` or `admissions.patient_id` + open status): render an Admission Context banner (ward, bed, LOS, admission diagnosis, attending consultant).
- New **Tasks** panel: lists `clinical_tasks` for the encounter with status toggles (pending → in_progress → done). Filter chips by role.
- Link "Open ward round" / "Add MAR entry" shortcuts when inpatient context is detected.

**Discharge planning**
- `/discharge-planning` reads outstanding `clinical_tasks WHERE encounter_type='admission' AND status <> 'done'` and blocks the Discharge button until all are done or cancelled (admin override). Auto-generator already pulls ward rounds + care plans; extend it to summarize completed tasks by category.

## Technical notes

- Migrations follow the strict order (CREATE → GRANT → RLS → POLICY). `clinical_tasks` gets `authenticated` grants + `service_role`, no `anon`.
- Sub-turn 1 ships immediately with no DB changes.
- Sub-turn 2 uses the existing schema — safe to ship without waiting for migration approval.
- Sub-turn 3 is one migration + one code pass; the trigger keeps old code paths (which only set `visit_id` or `admission_id`) working.

## Questions before I start

1. **Logo style**: minimalist line-art vault door with a subtle medical cross, monochrome (works on any background) — OK? Or do you want full-color?
2. **Sub-turn order**: ship 1 → 2 → 3 across three messages (recommended, safer), or do you want everything in one go?
3. **Discharge task gate**: hard block until all admission tasks are `done`/`cancelled`, or soft warn + allow admin override? (Recommend: hard block for non-admin, admin override with reason.)

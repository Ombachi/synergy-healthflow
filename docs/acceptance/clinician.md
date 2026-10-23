# Clinician (doctor)

Sign in as a doctor. Expected landing page: **Dashboard** (metrics + live queue).

## Can do

- [ ] Dashboard shows waiting, in-consultation, average turnaround and pending-lab counts for the active branch, refreshing automatically.
- [ ] Open a patient from the queue into the encounter workspace.
- [ ] Record structured notes, vitals review, diagnosis (ICD search) and sign the record.
- [ ] Order lab tests and imaging from the encounter; orders appear in the lab/radiology queues.
- [ ] Prescribe from within the encounter; safety alerts fire on allergy/interaction.
- [ ] Create a referral; the printable referral letter opens automatically after saving.
- [ ] `/queue` redirects to `/dashboard`.

## Cannot do

- [ ] No "Prescribe" entry in the primary sidebar or on the queue dashboard.
- [ ] No "Completed" archive entry in the primary sidebar (records live under departmental audit).
- [ ] `/billing`, `/cash-reconciliation`, `/admin/facilities` show "Access denied".
- [ ] Cannot dispense medication or confirm payments.

## Data isolation

- [ ] Queue and visits show only the active branch's patients.
- [ ] A transferred patient's past encounters remain visible as history, but new entries belong to the current branch.

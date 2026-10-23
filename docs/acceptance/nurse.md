# Nurse

Sign in as a nurse. Expected landing page: **Dashboard**.

## Can do

- [ ] Open a visit from the queue and record vitals; out-of-range values are flagged.
- [ ] Nursing station lists today's admitted patients for the active branch.
- [ ] Record eMAR administrations; each dose is timestamped and signed.
- [ ] Ward rounds and care plans are editable; monitoring charts update.
- [ ] Immunization: record a vaccine and print the vaccination card.
- [ ] Request stock from the store; the request appears in the store inbox.

## Cannot do

- [ ] No "Prescribe" or "Completed" entries in the primary sidebar.
- [ ] `/prescribe`, `/billing`, `/pharmacy` show "Access denied".
- [ ] Cannot sign a prescription or confirm a payment.

## Data isolation

- [ ] Admissions, beds and ward lists show only the active branch.
- [ ] Switching branches (if assigned to more than one) changes every ward list.

# Pharmacist

Sign in as a pharmacist. Expected landing page: **Pharmacy**.

## Can do

- [ ] Pharmacy queue shows today's prescriptions with patient names and MRN resolved.
- [ ] Dispense a prescription: stock decrements by the dispensed quantity.
- [ ] Controlled drugs register records each controlled dispense.
- [ ] Chronic care queue: a patient-submitted refill request can be reviewed and dispensed; stock decrements and refill history updates.
- [ ] A refill for a controlled or review-required medicine routes to clinical review — it cannot be auto-approved.
- [ ] Submitting the same refill twice is rejected as a duplicate.
- [ ] Pharmacy safety screen shows interaction/allergy flags.

## Cannot do

- [ ] Cannot create a refill request on behalf of a patient (patients initiate; pharmacy fulfils).
- [ ] `/prescribe` shows "Access denied" — pharmacists dispense, they do not prescribe.
- [ ] `/billing` and payment confirmation are not available.

## Data isolation

- [ ] Prescription and refill queues show only the active branch.
- [ ] Stock figures are per branch.

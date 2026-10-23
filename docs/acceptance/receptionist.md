# Receptionist

Sign in as a receptionist. Expected landing page: **Reception**.

## Can do

- [ ] Reception opens to today's visits only, with a search bar for older records.
- [ ] Register a new patient: duplicate warning appears when name + date of birth match an existing patient.
- [ ] Search patients by name or MRN (2+ characters); results show name, birth year and gender only — no phone, ID or clinical details.
- [ ] Open a patient record from search; full details load and the view is audited.
- [ ] Book an appointment for today and for a future date.
- [ ] Check a patient in; the patient appears on the queue and dashboard.
- [ ] Print a patient wristband.
- [ ] Request an ambulance/cab for a patient from the mobility request screen.

## Cannot do

- [ ] No link from an active visit into the patient's clinical history.
- [ ] `/patients`, `/visits`, `/billing`, `/pharmacy`, `/lab` all show "Access denied".
- [ ] Sidebar shows no clinical documentation, prescribing, billing or admin entries.
- [ ] Switching to a branch you are not assigned to is not possible.

## Data isolation

- [ ] A patient registered at branch A does not appear in branch B's today list.

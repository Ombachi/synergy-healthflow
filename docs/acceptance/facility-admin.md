# Facility admin

Sign in as an admin assigned to one or more branches.

## Can do

- [ ] The branch switcher in the top bar lists every branch you administer; switching asks for confirmation.
- [ ] `/admin/facilities` opens the branch editor: name, code, type, status, tier, module switches, tax PIN, currency, website, tagline.
- [ ] Saving a branch persists its module switches; reloading keeps them.
- [ ] Assign a staff member to a branch; they can then select it.
- [ ] Switching a module off (e.g. Inpatient HAIMS) immediately removes it from the sidebar and blocks its pages with "Module unavailable" — for every role, including admins.
- [ ] User management: invite a user, assign roles; roles take effect on next sign-in.

## Cannot do

- [ ] A subscription tier or module flag never grants clinical permissions by itself — a billing officer with the pharmacy module on still cannot open `/pharmacy`.
- [ ] Cannot see branches you do not administer.

## Data isolation

- [ ] With two branches, create a patient in branch A; switch to branch B; the patient is absent from today's list and from search-default results.

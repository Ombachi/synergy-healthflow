# Lab technologist

Sign in as a lab technologist. Expected landing page: **Laboratory**.

## Can do

- [ ] Lab queue shows today's orders for the active branch; older orders need a 2+ character search.
- [ ] Collect a sample and print the sample label.
- [ ] Enter results from a template; abnormal values are highlighted.
- [ ] A critical result triggers the critical-results workflow and is visible to doctor/nurse.
- [ ] Verify and release a report; the ordering clinician can see it immediately.
- [ ] QC panel entry and QC history record instrument checks.

## Cannot do

- [ ] `/visits`, `/prescribe`, `/billing` show "Access denied".
- [ ] Cannot edit a released result without the amend/re-release path.

## Data isolation

- [ ] Orders from another branch do not appear in the queue.
- [ ] Critical-results list is branch-scoped.

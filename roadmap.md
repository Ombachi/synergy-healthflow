# Facility administrator login recovery
- [x] Create the protected /facility/staff landing page with branch-scoped staff listing and departmental role assignment controls.
- [x] Add missing-page sign-out with protected-cache cleanup and local session removal.
- [ ] Test landing-page rules, branch isolation, and missing-page sign-out; verify live facility staff access where authorized.
- [ ] Apply facility-staff-role-assignment.sql in the user's external database before departmental changes can be saved; external database access is unavailable.

# Lab viewer and stock search fixes
- [x] Show panic badges for critical parameter and summary flags in the lab results viewer.
- [x] Update platform administrator permission tests to match the role separation.
- [x] Match both pharmacy and pharmaceutical stock categories and test the shared filter (31 targeted tests pass; build OK).
- [ ] Verify lab badges and pharmacy stock search with an authorized staff account; available requester session is a patient and cannot open staff screens.

# Requested document, diagnosis and access updates
- [ ] Align document metadata and persist facility-scoped read tracking.
- [ ] Add bounded WHO lookup with local ICD-11 fallback and tests.
- [ ] Separate global superadmin from facility-scoped facility_admin with database authorization and tests.
- [ ] Enable facility-scoped ward/lab stock requests and verify access.

# Billing extension and facility integration
- [ ] Finish and test branch-scoped payslips, attendance and roster reads/writes; clear branch-switch state and show unavailable data explicitly.
- [ ] Apply reviewed HR facility isolation SQL and verify two-branch HR access with real accounts; blocked until database connectivity is restored.
- [ ] Implement verified Kenyan monthly payroll formulas, integrate payslip calculation and add statutory boundary tests.
- [ ] Verify calculated payroll saves and PDF readback with a real account; blocked while database is unavailable.
- [x] Build HR onboarding modal, linked branch account selection, job title, department and initial quota validation.
- [x] Connect both leave approval screens to one authenticated decision path; add duplicate/insufficient-balance rule tests.
- [x] Harden leave-date validation, separate unavailable lists from empty lists, clear branch approval state and add onboarding retry.
- [ ] Apply docs/staged-migrations/hr-onboarding-leave.sql and verify onboarding-to-approval with real accounts; blocked by unavailable database (migration attempt failed).
- [ ] Add authenticated payment ledger, sponsor/LPO allocation and reconciliation with database enforcement.
- [x] Invoice payment controls: cash received/change, card terminal + authorization, balance limits.
- [ ] Finance views and downloadable LPO packs; need the LPO ledger tables (database unavailable).
- [ ] Validate payment rules and verify signed-in payment-to-reconciliation flows; live checks require an available backend.
- [ ] Enable authorized LPO email delivery; requires a configured sender domain.
- [x] Mount branch selector and load authorized memberships; resolve preview errors.
- [x] Enforce module flags in navigation and page access; test role-plus-module rules.
- [x] Add administrator branch editor, tiers, module persistence and staff assignment controls.
- [x] Correct encounter-owned workspace filters and facility-specific patient/visit query keys.
- [x] Rule tests for finance, facility filters, role/module access and mobility fares (all pure, no database needed).
- [x] Acceptance-test scripts per role under docs/acceptance/ for pre-go-live sign-off.
- [ ] Apply missing ward, bed and inventory facility ownership and operational RLS; blocked by unavailable Lovable Cloud database.
- [ ] Verify branch creation, staff assignments, module saves and two-branch isolation while signed in; blocked by unavailable database and session minting.
- [ ] Run the docs/acceptance/ scripts per role in staging before go-live; blocked by unavailable database.
- [ ] Apply docs/staged-migrations/staff-licenses.sql (blocked: database unreachable)

# Admissions and HR navigation cleanup
- [x] Limit Admissions Officer menus to admissions, beds, ward census, patient lookup and transport.
- [x] Separate staff self-service navigation and personal tabs from HR management; remove admin dashboard fallback for these roles.
- [x] Test role/module menu rules and verify the available signed-out preview (30 regression tests passed).
- [ ] Verify Admissions and HR menus and personal/management tab switching with real staff accounts; blocked by database unavailability when minting a preview session.

# Acceptance test scripts

One script per role. Run each script **signed in as that role** in a staging
preview before go-live, and tick every line. A script fails if any single
check fails — do not sign off with "mostly works".

Shared ground rules for every script:

- The branch switcher in the top bar shows the branch you are assigned to.
- Lists default to **today's** records; older records appear only after a
  search of 2+ characters.
- The sidebar shows only modules your role and the branch subscription allow.
- Opening a page you are not allowed to see shows "Access denied", never a
  blank screen or raw data.
- Every payment, prescription, result or record you create belongs to the
  branch shown in the switcher — switch branch and it must disappear.

Scripts:

- [Receptionist](receptionist.md)
- [Clinician (doctor)](clinician.md)
- [Nurse](nurse.md)
- [Pharmacist](pharmacist.md)
- [Lab technologist](lab-tech.md)
- [Cashier](cashier.md)
- [Finance / billing officer](finance.md)
- [Facility admin](facility-admin.md)
- [Platform admin](platform-admin.md)

## Sign-off record

| Role | Tester | Date | Build | Result | Notes |
|------|--------|------|-------|--------|-------|
| Receptionist | | | | | |
| Clinician | | | | | |
| Nurse | | | | | |
| Pharmacist | | | | | |
| Lab technologist | | | | | |
| Cashier | | | | | |
| Finance | | | | | |
| Facility admin | | | | | |
| Platform admin | | | | | |

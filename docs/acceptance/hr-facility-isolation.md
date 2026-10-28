# HR branch isolation acceptance

Status: not signed off. Requires the reviewed staged HR facility SQL, onboarding RPC alignment and a reachable database.

## Setup
- Create Branch A and Branch B, one HR manager and one employee per branch, and a platform administrator assigned both.
- Create attendance, upcoming shifts, assignments, leave requests, payroll periods, draft payslips and published payslips in each branch.

## HR manager
- Select Branch A: employees, attendance, shifts, assignments, leave and payslips contain only A records.
- The new payslip employee and period pickers contain only A records.
- Capture the identifiers of a Branch B record. Attempt a direct read, update and insert referencing that record as A's manager: denied, with no rows changed.
- Attempt a payslip with A's employee and B's period: rejected.
- Attempt an assignment using A's shift and B's employee: rejected.
- Attempt to move attendance or a payslip to B by editing facility_id: rejected.
- Force an unavailable database: show an error, not an empty list; clocking and payroll actions cannot report success.

## Employee self-service
- Only their own attendance and published payslips appear in the selected branch.
- A draft payslip is inaccessible through a direct query, not only hidden by the screen.
- Clock-in records the selected branch; clock-out cannot change a row belonging to another branch or employee.

## Platform administrator
- Open a payroll or assignment form in A; switch to B: the form closes, selections reset and A records disappear.
- Delay A's data response until after switching: it must not populate B's list or pickers.
- Publish a B payslip and download it: confirm B branding, employee, period, deductions and net pay.

## Leave and schema review
- Roster links to HR Leave; no separate roster approval path remains.
- Approve through HR Leave: deduct once; retry must not deduct twice.
- Verify leave_requests uses employee_id/start_date/end_date.
- Apply restrictive facility policies alongside current role policies; inspect effective SELECT, INSERT, UPDATE and DELETE access.
- Review legacy MAIN backfills manually before moving historic records.
- HR departments remain shared reference data pending a separate branch-catalog decision; staff/leave balances and onboarding RPCs must be reviewed against direct employee facility ownership before deployment.

Record tester, date, actual outcome and evidence for every check. Do not deploy HR as branch-isolated until all direct-access checks pass.
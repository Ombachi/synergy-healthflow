# HR onboarding and leave sign-off

Blocked until `docs/staged-migrations/hr-onboarding-leave.sql` is applied through the migration tool. Check the live schema before applying; this draft uses the existing employees/leave_types contract. Do not claim live deductions until these checks pass.

1. Sign in as branch HR with HR enabled. Assign a test staff account to that branch through existing administration.
2. Open HR administration → Add employee. Select the account, job title, department, quota year and 21 annual days. Save. Reload: title, department and annual balance must read back correctly.
3. Onboard the same account again: reject without resetting its balances. Test two simultaneous saves: exactly one succeeds.
4. Submit five calendar days of annual leave from the staff account. Final approval by branch HR must change remaining 21→16 and used 0→5 in the same transaction.
5. Repeat approval, double-click and reload: balances stay 16/5. Test both Leave and Leave inbox.
6. With three days remaining, approve five days: reject; status and balances stay unchanged. Concurrent approvals cannot overspend.
7. Reject/request clarification: no deduction. Already-approved dates, days, type, employee and accounting marker cannot change; cancellation of approved leave needs a separately approved reversal workflow (not included).
8. Staff cannot approve themselves. Non-HR, wrong-branch HR and HR-disabled branches cannot call either RPC successfully.
9. A cross-year request must ask for separate requests, not charge all days to one year. Existing calendar-day counting remains unchanged; public-holiday/accrual rules are outside this update.
10. Check both branches, both approval screens and existing staff self-service after activation. Employee IDs remain system account IDs; employees assigned to multiple branches share one employee record and annual balance.

Known limitation: pre-migration approvals already ran the old trigger; the backfill marks currently approved rows as deducted. Previously cancelled/reapproved history requires reconciliation, not automatic balance correction. Broader HR RLS facility isolation remains an existing separate deployment blocker.
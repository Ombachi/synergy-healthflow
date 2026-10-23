# Finance / billing officer

Sign in as a billing officer. Expected landing page: **Billing**.

## Can do

- [ ] Everything in the cashier script, plus:
- [ ] Cash reconciliation: declare counted cash; the variance (counted − recorded) is shown with its sign.
- [ ] Card and M-Pesa totals are shown against recorded amounts for the shift/day.
- [ ] Insurance screen: create a pre-authorisation; its status starts as "pending".
- [ ] Record an LPO: organization, LPO number, beneficiary, issue/expiry dates, approved amount and services.
- [ ] Charge an invoice to an active LPO within its balance; charging past the remaining balance or after expiry is rejected.
- [ ] Patient co-pay and sponsor balance can share one invoice.
- [ ] Credit notes issue against an invoice with a reason.

## Cannot do

- [ ] Cannot delete or silently edit a reconciled payment.
- [ ] Cannot approve an LPO charge on a suspended or expired LPO.
- [ ] Clinical routes (`/visits`, `/prescribe`) show "Access denied".

## Data isolation

- [ ] Reconciliation and insurance views are scoped to the active branch.

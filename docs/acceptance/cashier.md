# Cashier

Sign in as a cashier. Expected landing page: **Billing**.

## Can do

- [ ] Billing shows today's invoices for the active branch; older invoices need a 2+ character search.
- [ ] Cash payment: entering an amount above the invoice balance is rejected; entering cash received shows the change to give; received below the amount is rejected.
- [ ] Card payment: saving without a terminal or authorization reference is rejected; with both, it saves.
- [ ] M-Pesa: STK push sends to the confirmed phone; the invoice shows "payment pending" until the callback confirms; receipt prints only after confirmation.
- [ ] Receipt prints with the active branch's name, logo and details.
- [ ] Cash reconciliation screen lists today's collections by method.

## Cannot do

- [ ] Cannot edit or delete a confirmed payment — only void/refund through the controlled path.
- [ ] `/visits`, `/pharmacy`, `/lab` show "Access denied".
- [ ] Cannot mark an invoice paid without a payment record.

## Data isolation

- [ ] Invoices, payments and reconciliation totals cover only the active branch.

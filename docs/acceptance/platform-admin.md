# Platform admin

Sign in as the platform (super) admin.

## Can do

- [ ] See all branches regardless of membership.
- [ ] Provision a new branch: initial admin, tier, default module set for the tier.
- [ ] Change a branch's tier; module flags update to the tier defaults and can be adjusted per branch.
- [ ] Suspend a branch: its staff cannot select it; the switcher hides it.
- [ ] View audit logs: record opens, payment events, LPO downloads, admin changes.
- [ ] Access admin compliance screens: soft-deleted records, consent, breaches, access reviews, error log.

## Cannot do

- [ ] Platform admin actions are themselves audited — verify an entry appears after each change above.
- [ ] Cannot bypass branch isolation silently: every cross-branch view is attributable in the audit log.

## Deployment checks

- [ ] Error page shows on a forced failure; not-found page shows on a bad link.
- [ ] Every page has its own browser-tab title.
- [ ] Sign-out returns to the sign-in screen; protected pages redirect to sign-in when signed out.

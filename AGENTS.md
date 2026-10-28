# Architecture rules
- Facility selection is provided once beneath AuthProvider; workspace query keys include the selected facility to avoid cross-branch cache reuse.
- Operational records are scoped through their authoritative encounter or patient relationship until direct facility columns are available.
- Facility administration uses authenticated server functions and database-side administrator checks; subscription flags never grant clinical permissions.
- Facility query-filter construction lives in a browser-safe pure helper so ownership rules can be tested without session or database access.
- HR onboarding and final leave decisions use authenticated server wrappers over database-authorized transactional RPCs; one BEFORE trigger owns leave accounting so neither approval screen can deduct twice.
- Unapplied HR SQL lives under docs/staged-migrations, outside the managed migration journal, until the migration tool can apply it; unavailable database writes must fail visibly rather than simulate success.
- HR workspace reads and writes use direct facility ownership; roster assignments inherit the shift's scope, and roster leave actions use the canonical HR leave page to avoid parallel approval accounting.
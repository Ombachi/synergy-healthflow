# Architecture rules
- Facility selection is provided once beneath AuthProvider; workspace query keys include the selected facility to avoid cross-branch cache reuse.
- Operational records are scoped through their authoritative encounter or patient relationship until direct facility columns are available.
- Facility administration uses authenticated server functions and database-side administrator checks; subscription flags never grant clinical permissions.
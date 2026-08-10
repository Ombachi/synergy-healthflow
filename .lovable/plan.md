# Vitalis Mobility — healthcare transportation module

A transport module inside the existing platform: patients and staff request healthcare
transport, a fleet manager dispatches vehicles, drivers run the trip, and completed trips
bill through the existing invoice system. No separate accounts, no separate finance store.

## What gets built

### Roles
Two new roles: `fleet_manager` and `driver`. Existing patients, doctors, nurses and
admissions officers get transport-request rights on top of what they already have.

### Patient portal — MOBILITY section
- **Request Transport** — a stepped booking flow: service → who is being transported →
  pickup → destination → requirements (only the questions relevant to the chosen service)
  → now/later → fare estimate → confirm.
- **Active Trip** — live status, assigned vehicle/driver, ETA, progress, contact buttons.
- **Upcoming Trips** and **Trip History** — with a per-trip detail view and receipt.

### Four service workflows (separate forms, not one generic one)
- **Healthcare Cab** — pickup, destination, date/time, passengers, accessibility, notes,
  fare estimate in KES.
- **Ambulance** — patient, requester + relationship, condition, priority
  (Emergency / Urgent / Priority / Routine / Scheduled), and requirement toggles
  (stretcher, wheelchair, oxygen, monitoring, clinical escort). Patient-declared priority
  is stored separately from clinically-assessed priority and is labelled as such
  everywhere. Emergency requests show safety messaging (call emergency services) and
  immediately alert dispatch.
- **Assisted / Wheelchair Transport** — wheelchair, stretcher, elderly assistance,
  accessibility needs.
- **Hearse / Mortuary Transport** — its own workflow with requester, relationship,
  contact, deceased details, documentation checklist, and a formal handover record
  (released by, received by, timestamp, documentation status, confirmation). Kept
  entirely out of the patient ride flow.
- **Hospital Transfer** — staff-only: facilities, MRN, reason, clinical priority,
  condition, equipment, escort, referral docs, clinical summary.

### Staff-initiated transport
A **Request transport** action on the patient workspace, inpatient view and an emergency
transport form, auto-linking MRN, encounter, department and requesting clinician.

### Fleet Manager portal
- **Dashboard** — live counts: active/pending requests, vehicles available/on trip, per
  category availability, drivers online, vehicles offline, trips today, completed,
  cancelled, revenue. All from live queries.
- **Dispatch board** — request queue with ID, service, priority, pickup, destination,
  distance, requested time, status, recommended vehicle, assigned driver, plus
  view/assign/reassign/cancel/contact actions.
- **Live map** — vehicle and request markers by status, with click-through detail panels.
  Uses the Google Maps connector if connected; falls back to a coordinate list view.
- **Manual dispatch** — recommended vehicle with distance, ETA, equipment compatibility,
  driver and crew; dispatch or choose another. Fleet manager always has final control.
- **Auto dispatch** — optional ranked matching, with override on high-priority requests.
- **Fleet** — ambulances, cabs, assisted-transport vehicles, hearses; full vehicle record
  with status lifecycle (available, reserved, assigned, en route, on trip, maintenance,
  offline, out of service).
- **Compliance** — insurance/inspection/permit/service/equipment expiry with alerts, and
  a hard block on dispatching a non-compliant vehicle.
- **Pricing** — configurable rules per service in KES; nothing priced in UI code.

### Dispatch engine
Filters to vehicles that actually satisfy the request (equipment, capability, crew
qualification, compliance, availability), then ranks by distance, ETA, priority and
status. A cab is never offered for a stretcher request; a vehicle without oxygen is never
offered for an oxygen request.

### Driver portal
Separate, minimal interface: online/offline toggle, current vehicle, incoming request
card showing only service, pickup, destination, transport requirements, distance and ETA
— no clinical detail. Accept/decline, then navigate, arrived, boarding, start, arrived at
destination, handover, complete.

### Trip state machine
`REQUESTED → TRIAGED → MATCHING → ASSIGNED → DRIVER_ACCEPTED → EN_ROUTE_TO_PICKUP →
ARRIVED_PICKUP → PATIENT_BOARDING → IN_TRANSIT → ARRIVED_DESTINATION → HANDOVER →
COMPLETED`, plus `CANCELLED / REJECTED / EXPIRED / NO_SHOW / UNABLE_TO_COMPLETE`. Every
transition is timestamped, attributed and written to a trip event log.

### Billing and notifications
Completed trips post a line to the patient's existing invoice (cash, insurance and the
already-configured payment methods; receipt via the existing receipt PDF). Trip events
fire through the existing notification service to patient, requester, fleet manager,
driver and relevant staff.

## Technical notes

New tables (all with RLS + grants): `mobility_vehicles`, `mobility_equipment_types`,
`mobility_vehicle_equipment`, `mobility_vehicle_documents`, `mobility_vehicle_maintenance`,
`mobility_drivers`, `mobility_locations`, `mobility_requests`, `mobility_trips`,
`mobility_trip_events`, `mobility_dispatches`, `mobility_pricing_rules`,
`mobility_mortuary_transfers`, `mobility_hospital_transfers`.

`mobility_requests` references existing `patients`, `visits`/`admissions` and
`auth.users` — the patient database is not duplicated, and billing writes into the
existing `invoices` / `invoice_items` / `payments` tables via the existing
`add_invoice_line` function.

Code lives under `src/modules/mobility/` (booking, dispatch, fleet, vehicles, drivers,
ambulance, cab, assisted-transport, mortuary, trips, tracking, transfers, pricing,
payments, notifications, analytics), with thin route files under
`src/routes/_authenticated/mobility.*` wiring them into the existing sidebar and RBAC.

Pricing, equipment categories and compliance requirements are all database-configured, so
fleet admins change them without a code change.

## Build order

1. Migration: enum roles, all tables, RLS/grants, pricing + equipment seed, demo fleet.
2. Shared module core: types, state machine, pricing calculator, dispatch matcher, hooks.
3. Patient booking flow + Active/Upcoming/History.
4. Fleet manager dashboard, dispatch board, manual/auto dispatch, map.
5. Fleet, compliance, pricing admin.
6. Driver portal.
7. Staff-initiated, emergency and inpatient transport entry points.
8. Billing + notification wiring, sidebar/RBAC, seeded demo data.

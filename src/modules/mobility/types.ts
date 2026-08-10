/**
 * Vitalis Mobility — shared domain types.
 *
 * Healthcare transportation, not generic ride hailing: every request carries
 * transport requirements that the dispatch engine must satisfy before a
 * vehicle can be offered.
 */

export type ServiceType = "ambulance" | "cab" | "assisted" | "hearse" | "transfer";

export const SERVICE_LABEL: Record<ServiceType, string> = {
  ambulance: "Ambulance",
  cab: "Healthcare Cab",
  assisted: "Assisted / Wheelchair Transport",
  hearse: "Hearse / Mortuary Transport",
  transfer: "Hospital Transfer",
};

export const SERVICE_BLURB: Record<ServiceType, string> = {
  ambulance: "Emergency and non-emergency medical transport with a clinical crew.",
  cab: "Routine, non-clinical travel to and from appointments.",
  assisted: "Wheelchair, stretcher and mobility-assisted travel.",
  hearse: "Dignified transport of the deceased, with formal handover.",
  transfer: "Inter-facility patient transfer requested by clinical staff.",
};

/** Vehicle types that can serve each service. */
export const SERVICE_VEHICLE_TYPES: Record<ServiceType, string[]> = {
  ambulance: ["ambulance"],
  cab: ["cab"],
  assisted: ["assisted"],
  hearse: ["hearse"],
  transfer: ["ambulance", "assisted"],
};

export type Subject = "self" | "family" | "other_patient" | "deceased";

export const SUBJECT_LABEL: Record<Subject, string> = {
  self: "Myself",
  family: "A family member",
  other_patient: "Another patient",
  deceased: "A deceased person",
};

export type Priority = "emergency" | "urgent" | "priority" | "routine" | "scheduled";

export const PRIORITY_LABEL: Record<Priority, string> = {
  emergency: "Emergency",
  urgent: "Urgent",
  priority: "Priority",
  routine: "Routine",
  scheduled: "Scheduled",
};

export const PRIORITY_RANK: Record<Priority, number> = {
  emergency: 0,
  urgent: 1,
  priority: 2,
  routine: 3,
  scheduled: 4,
};

export const PRIORITY_CLASS: Record<Priority, string> = {
  emergency: "bg-destructive/15 text-destructive border-destructive/30",
  urgent: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  priority: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  routine: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-muted text-muted-foreground border-border",
};

/**
 * Transport requirements. Keys map to equipment codes in
 * `mobility_equipment_types` so the matcher can check capability directly.
 */
export interface Requirements {
  stretcher?: boolean;
  wheelchair?: boolean;
  oxygen?: boolean;
  monitor?: boolean;
  ventilator?: boolean;
  infusion_pump?: boolean;
  incubator?: boolean;
  clinical_escort?: boolean;
  elderly_assistance?: boolean;
  accessibility?: boolean;
  child_seat?: boolean;
  bariatric?: boolean;
}

export const REQUIREMENT_LABEL: Record<keyof Requirements, string> = {
  stretcher: "Stretcher",
  wheelchair: "Wheelchair",
  oxygen: "Oxygen",
  monitor: "Patient monitoring",
  ventilator: "Portable ventilator",
  infusion_pump: "Infusion pump",
  incubator: "Neonatal incubator",
  clinical_escort: "Clinical escort",
  elderly_assistance: "Elderly assistance",
  accessibility: "Accessibility support",
  child_seat: "Child seat",
  bariatric: "Bariatric capacity",
};

/** Requirements that must be matched against fitted vehicle equipment. */
export const EQUIPMENT_REQUIREMENTS: (keyof Requirements)[] = [
  "stretcher",
  "wheelchair",
  "oxygen",
  "monitor",
  "ventilator",
  "infusion_pump",
  "incubator",
  "child_seat",
];

/** Which requirement questions are asked for each service. */
export const SERVICE_REQUIREMENTS: Record<ServiceType, (keyof Requirements)[]> = {
  ambulance: [
    "stretcher", "wheelchair", "oxygen", "monitor",
    "ventilator", "infusion_pump", "clinical_escort", "bariatric",
  ],
  cab: ["accessibility", "elderly_assistance", "child_seat"],
  assisted: ["wheelchair", "stretcher", "elderly_assistance", "accessibility", "bariatric"],
  hearse: [],
  transfer: [
    "stretcher", "oxygen", "monitor", "ventilator",
    "infusion_pump", "incubator", "clinical_escort",
  ],
};

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

export interface Vehicle {
  id: string;
  registration: string;
  vehicle_type: string;
  category: string | null;
  make: string | null;
  model: string | null;
  capacity: number;
  status: VehicleStatus;
  base_location: string | null;
  current_location: string | null;
  current_lat: number | null;
  current_lng: number | null;
  driver_id: string | null;
  crew: string[];
  notes: string | null;
  active: boolean;
}

export type VehicleStatus =
  | "available" | "reserved" | "assigned" | "en_route"
  | "on_trip" | "maintenance" | "offline" | "out_of_service";

export const VEHICLE_STATUSES: VehicleStatus[] = [
  "available", "reserved", "assigned", "en_route",
  "on_trip", "maintenance", "offline", "out_of_service",
];

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  assigned: "Assigned",
  en_route: "En route",
  on_trip: "On trip",
  maintenance: "Maintenance",
  offline: "Offline",
  out_of_service: "Out of service",
};

export const VEHICLE_STATUS_CLASS: Record<VehicleStatus, string> = {
  available: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  reserved: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  assigned: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  en_route: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  on_trip: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  maintenance: "bg-orange-500/15 text-orange-600 border-orange-500/30",
  offline: "bg-muted text-muted-foreground border-border",
  out_of_service: "bg-destructive/15 text-destructive border-destructive/30",
};

export interface Driver {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  licence_number: string | null;
  licence_expiry: string | null;
  qualifications: string[];
  status: "online" | "offline" | "on_trip";
  active: boolean;
}

export interface VehicleEquipment {
  id: string;
  vehicle_id: string;
  equipment_code: string;
  quantity: number;
  last_checked_on: string | null;
}

export interface VehicleDocument {
  id: string;
  vehicle_id: string;
  doc_type: string;
  reference: string | null;
  issued_on: string | null;
  expires_on: string | null;
  blocks_dispatch: boolean;
  notes: string | null;
}

export interface MobilityLocation {
  id: string;
  owner_id: string | null;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  is_facility: boolean;
}

export interface PricingRule {
  id: string;
  service_type: ServiceType;
  tier: string;
  label: string;
  currency: string;
  base_fare_cents: number;
  per_km_cents: number;
  per_minute_cents: number;
  waiting_per_minute_cents: number;
  minimum_fare_cents: number;
  crew_cents: number;
  equipment_cents: number;
  accessibility_cents: number;
  after_hours_pct: number;
  active: boolean;
}

export interface MobilityRequest {
  id: string;
  request_code: string;
  service_type: ServiceType;
  subject: Subject;
  patient_id: string | null;
  requester_id: string | null;
  requester_name: string | null;
  requester_phone: string | null;
  requester_relationship: string | null;
  pickup_label: string;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_label: string;
  destination_address: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  schedule_mode: "now" | "later";
  scheduled_at: string | null;
  passengers: number;
  declared_priority: Priority;
  clinical_priority: Priority | null;
  clinical_priority_at: string | null;
  condition_notes: string | null;
  requirements: Requirements;
  special_instructions: string | null;
  distance_km: number;
  estimated_fare_cents: number;
  status: TripStatus;
  origin: string;
  encounter_id: string | null;
  encounter_type: string | null;
  department: string | null;
  cancel_reason: string | null;
  created_at: string;
}

export interface Trip {
  id: string;
  request_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
  status: TripStatus;
  assigned_at: string | null;
  accepted_at: string | null;
  en_route_at: string | null;
  arrived_pickup_at: string | null;
  boarding_at: string | null;
  in_transit_at: string | null;
  arrived_destination_at: string | null;
  handover_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  eta_minutes: number | null;
  distance_km: number;
  waiting_minutes: number;
  fare_cents: number;
  invoice_id: string | null;
  payment_method: string | null;
  handover_notes: string | null;
  created_at: string;
}

export interface TripEvent {
  id: string;
  trip_id: string | null;
  request_id: string | null;
  status: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Trip state machine
// ---------------------------------------------------------------------------

export type TripStatus =
  | "REQUESTED" | "TRIAGED" | "MATCHING" | "ASSIGNED" | "DRIVER_ACCEPTED"
  | "EN_ROUTE_TO_PICKUP" | "ARRIVED_PICKUP" | "PATIENT_BOARDING" | "IN_TRANSIT"
  | "ARRIVED_DESTINATION" | "HANDOVER" | "COMPLETED"
  | "CANCELLED" | "REJECTED" | "EXPIRED" | "NO_SHOW" | "UNABLE_TO_COMPLETE";

export const TRIP_FLOW: TripStatus[] = [
  "REQUESTED", "TRIAGED", "MATCHING", "ASSIGNED", "DRIVER_ACCEPTED",
  "EN_ROUTE_TO_PICKUP", "ARRIVED_PICKUP", "PATIENT_BOARDING", "IN_TRANSIT",
  "ARRIVED_DESTINATION", "HANDOVER", "COMPLETED",
];

export const TERMINAL_STATUSES: TripStatus[] = [
  "COMPLETED", "CANCELLED", "REJECTED", "EXPIRED", "NO_SHOW", "UNABLE_TO_COMPLETE",
];

export const STATUS_LABEL: Record<TripStatus, string> = {
  REQUESTED: "Requested",
  TRIAGED: "Triaged",
  MATCHING: "Finding a vehicle",
  ASSIGNED: "Vehicle assigned",
  DRIVER_ACCEPTED: "Driver accepted",
  EN_ROUTE_TO_PICKUP: "En route to pickup",
  ARRIVED_PICKUP: "Arrived at pickup",
  PATIENT_BOARDING: "Boarding",
  IN_TRANSIT: "In transit",
  ARRIVED_DESTINATION: "Arrived at destination",
  HANDOVER: "Handover",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  NO_SHOW: "No show",
  UNABLE_TO_COMPLETE: "Unable to complete",
};

export const STATUS_CLASS: Record<TripStatus, string> = {
  REQUESTED: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  TRIAGED: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  MATCHING: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  ASSIGNED: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  DRIVER_ACCEPTED: "bg-indigo-500/15 text-indigo-600 border-indigo-500/30",
  EN_ROUTE_TO_PICKUP: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  ARRIVED_PICKUP: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  PATIENT_BOARDING: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  IN_TRANSIT: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  ARRIVED_DESTINATION: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  HANDOVER: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  COMPLETED: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  CANCELLED: "bg-muted text-muted-foreground border-border",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
  EXPIRED: "bg-muted text-muted-foreground border-border",
  NO_SHOW: "bg-destructive/15 text-destructive border-destructive/30",
  UNABLE_TO_COMPLETE: "bg-destructive/15 text-destructive border-destructive/30",
};

/** Column on `mobility_trips` stamped when a status is entered. */
export const STATUS_TIMESTAMP: Partial<Record<TripStatus, string>> = {
  ASSIGNED: "assigned_at",
  DRIVER_ACCEPTED: "accepted_at",
  EN_ROUTE_TO_PICKUP: "en_route_at",
  ARRIVED_PICKUP: "arrived_pickup_at",
  PATIENT_BOARDING: "boarding_at",
  IN_TRANSIT: "in_transit_at",
  ARRIVED_DESTINATION: "arrived_destination_at",
  HANDOVER: "handover_at",
  COMPLETED: "completed_at",
  CANCELLED: "cancelled_at",
};

const ALT: TripStatus[] = ["CANCELLED", "NO_SHOW", "UNABLE_TO_COMPLETE"];

/** Allowed forward transitions. Every transition is timestamped and audited. */
export const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  REQUESTED: ["TRIAGED", "MATCHING", "ASSIGNED", "CANCELLED", "REJECTED", "EXPIRED"],
  TRIAGED: ["MATCHING", "ASSIGNED", "CANCELLED", "REJECTED"],
  MATCHING: ["ASSIGNED", "CANCELLED", "EXPIRED"],
  ASSIGNED: ["DRIVER_ACCEPTED", "REJECTED", ...ALT],
  DRIVER_ACCEPTED: ["EN_ROUTE_TO_PICKUP", ...ALT],
  EN_ROUTE_TO_PICKUP: ["ARRIVED_PICKUP", ...ALT],
  ARRIVED_PICKUP: ["PATIENT_BOARDING", ...ALT],
  PATIENT_BOARDING: ["IN_TRANSIT", ...ALT],
  IN_TRANSIT: ["ARRIVED_DESTINATION", "UNABLE_TO_COMPLETE", "CANCELLED"],
  ARRIVED_DESTINATION: ["HANDOVER", "UNABLE_TO_COMPLETE"],
  HANDOVER: ["COMPLETED", "UNABLE_TO_COMPLETE"],
  COMPLETED: [],
  CANCELLED: [],
  REJECTED: [],
  EXPIRED: [],
  NO_SHOW: [],
  UNABLE_TO_COMPLETE: [],
};

export function nextStatus(current: TripStatus): TripStatus | null {
  const i = TRIP_FLOW.indexOf(current);
  if (i < 0 || i === TRIP_FLOW.length - 1) return null;
  return TRIP_FLOW[i + 1] ?? null;
}

export function canTransition(from: TripStatus, to: TripStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function isActive(status: TripStatus): boolean {
  return !TERMINAL_STATUSES.includes(status);
}

export function progressPct(status: TripStatus): number {
  const i = TRIP_FLOW.indexOf(status);
  if (i < 0) return 100;
  return Math.round((i / (TRIP_FLOW.length - 1)) * 100);
}

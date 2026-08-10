import type {
  Driver, MobilityRequest, Requirements, ServiceType, Vehicle,
  VehicleDocument, VehicleEquipment,
} from "../types";
import { EQUIPMENT_REQUIREMENTS, PRIORITY_RANK, SERVICE_VEHICLE_TYPES } from "../types";
import { etaMinutes, roadKm } from "../tracking/geo";

/**
 * Dispatch engine.
 *
 * This is healthcare transport: the closest vehicle is NOT automatically the
 * right one. A vehicle is only a candidate once it satisfies every transport
 * requirement, is compliant, is operationally free and — where a clinical
 * escort is needed — carries a qualified crew. Ranking happens only after
 * eligibility.
 */

export interface MatchInput {
  request: Pick<
    MobilityRequest,
    "service_type" | "requirements" | "pickup_lat" | "pickup_lng" | "passengers"
  > & { declared_priority?: string; clinical_priority?: string | null };
  vehicles: Vehicle[];
  equipment: VehicleEquipment[];
  documents: VehicleDocument[];
  drivers: Driver[];
  /** Vehicle ids currently committed to another active trip. */
  busyVehicleIds?: string[];
}

export interface Candidate {
  vehicle: Vehicle;
  driver: Driver | null;
  eligible: boolean;
  distanceKm: number;
  etaMinutes: number;
  score: number;
  equipmentMet: string[];
  equipmentMissing: string[];
  blockers: string[];
  warnings: string[];
}

const DISPATCHABLE: string[] = ["available", "reserved"];

export function complianceBlockers(
  vehicleId: string,
  documents: VehicleDocument[],
  today = new Date(),
): string[] {
  const iso = today.toISOString().slice(0, 10);
  return documents
    .filter((d) => d.vehicle_id === vehicleId && d.blocks_dispatch)
    .filter((d) => d.expires_on != null && d.expires_on < iso)
    .map((d) => `${labelDoc(d.doc_type)} expired`);
}

export function complianceWarnings(
  vehicleId: string,
  documents: VehicleDocument[],
  withinDays = 30,
  today = new Date(),
): string[] {
  const iso = today.toISOString().slice(0, 10);
  const limit = new Date(today.getTime() + withinDays * 86400000).toISOString().slice(0, 10);
  return documents
    .filter((d) => d.vehicle_id === vehicleId)
    .filter((d) => d.expires_on != null && d.expires_on >= iso && d.expires_on <= limit)
    .map((d) => `${labelDoc(d.doc_type)} expires ${d.expires_on}`);
}

export function labelDoc(t: string): string {
  return t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Requirement keys that must be satisfied by fitted equipment. */
export function requiredEquipment(req: Requirements): string[] {
  return EQUIPMENT_REQUIREMENTS.filter((k) => req[k]).map((k) => k as string);
}

export function rankCandidates(input: MatchInput): Candidate[] {
  const { request, vehicles, equipment, documents, drivers } = input;
  const busy = new Set(input.busyVehicleIds ?? []);
  const service = request.service_type as ServiceType;
  const allowedTypes = SERVICE_VEHICLE_TYPES[service] ?? [];
  const req = (request.requirements ?? {}) as Requirements;
  const needed = requiredEquipment(req);

  const priority = (request.clinical_priority ?? request.declared_priority ?? "routine") as
    keyof typeof PRIORITY_RANK;

  const candidates = vehicles
    .filter((v) => v.active)
    .map<Candidate>((v) => {
      const blockers: string[] = [];
      const warnings: string[] = [];

      if (!allowedTypes.includes(v.vehicle_type)) {
        blockers.push(`Not a ${allowedTypes.join(" or ")} vehicle`);
      }

      const fitted = new Set(
        equipment.filter((e) => e.vehicle_id === v.id).map((e) => e.equipment_code),
      );
      const equipmentMet = needed.filter((c) => fitted.has(c));
      const equipmentMissing = needed.filter((c) => !fitted.has(c));
      if (equipmentMissing.length > 0) {
        blockers.push(`Missing ${equipmentMissing.join(", ")}`);
      }

      if (request.passengers && v.capacity < request.passengers) {
        blockers.push(`Capacity ${v.capacity} < ${request.passengers} passengers`);
      }

      if (!DISPATCHABLE.includes(v.status)) {
        blockers.push(`Vehicle ${v.status.replace(/_/g, " ")}`);
      }
      if (busy.has(v.id)) blockers.push("Already on an active trip");

      blockers.push(...complianceBlockers(v.id, documents));
      warnings.push(...complianceWarnings(v.id, documents));

      const driver = drivers.find((d) => d.id === v.driver_id) ?? null;
      if (!driver) {
        blockers.push("No driver assigned");
      } else {
        if (!driver.active) blockers.push("Driver inactive");
        if (driver.status === "on_trip") blockers.push("Driver on another trip");
        if (driver.status === "offline") warnings.push("Driver is offline");
        if (driver.licence_expiry && driver.licence_expiry < new Date().toISOString().slice(0, 10)) {
          blockers.push("Driver licence expired");
        }
      }

      if (req.clinical_escort) {
        const crewOk = (v.crew ?? []).length > 0 ||
          (driver?.qualifications ?? []).some((q) => ["paramedic", "als", "bls"].includes(q));
        if (!crewOk) blockers.push("No qualified clinical escort on board");
      }

      const distanceKm = roadKm(
        { lat: v.current_lat, lng: v.current_lng },
        { lat: request.pickup_lat, lng: request.pickup_lng },
        6,
      );
      const eta = etaMinutes(distanceKm, priority === "emergency" ? 40 : 28);

      // Lower score is better: ETA dominates, capability fit and readiness
      // break ties, priority tightens the ETA weighting for emergencies.
      let score = eta * (priority === "emergency" ? 1.6 : 1);
      if (v.status === "available") score -= 3;
      if (driver?.status === "online") score -= 4;
      score += warnings.length * 2;
      score += Math.max(0, v.capacity - (request.passengers || 1)) * 0.5;

      return {
        vehicle: v,
        driver,
        eligible: blockers.length === 0,
        distanceKm,
        etaMinutes: eta,
        score: Math.round(score * 10) / 10,
        equipmentMet,
        equipmentMissing,
        blockers,
        warnings,
      };
    });

  return candidates.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return a.score - b.score;
  });
}

export function recommend(input: MatchInput): Candidate | null {
  return rankCandidates(input).find((c) => c.eligible) ?? null;
}

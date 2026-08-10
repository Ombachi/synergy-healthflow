import type { PricingRule, Requirements, ServiceType } from "../types";
import { EQUIPMENT_REQUIREMENTS } from "../types";

/**
 * Configurable pricing engine. Every amount comes from
 * `mobility_pricing_rules` — nothing is priced in UI code. All values in
 * Kenyan Shilling cents.
 */

export interface FareInput {
  rule: PricingRule;
  distanceKm: number;
  durationMinutes?: number;
  waitingMinutes?: number;
  requirements?: Requirements;
  when?: Date;
}

export interface FareLine {
  label: string;
  cents: number;
}

export interface FareBreakdown {
  lines: FareLine[];
  subtotalCents: number;
  totalCents: number;
  currency: string;
  ruleLabel: string;
}

const AFTER_HOURS_START = 20; // 20:00
const AFTER_HOURS_END = 6; // 06:00

export function isAfterHours(when: Date): boolean {
  const h = when.getHours();
  return h >= AFTER_HOURS_START || h < AFTER_HOURS_END;
}

export function calculateFare(input: FareInput): FareBreakdown {
  const { rule } = input;
  const when = input.when ?? new Date();
  const km = Math.max(0, input.distanceKm || 0);
  const minutes = Math.max(0, input.durationMinutes ?? 0);
  const waiting = Math.max(0, input.waitingMinutes ?? 0);
  const req = input.requirements ?? {};

  const lines: FareLine[] = [];

  if (rule.base_fare_cents) lines.push({ label: "Base fare", cents: rule.base_fare_cents });
  if (rule.per_km_cents && km) {
    lines.push({ label: `Distance · ${km.toFixed(1)} km`, cents: Math.round(rule.per_km_cents * km) });
  }
  if (rule.per_minute_cents && minutes) {
    lines.push({ label: `Time · ${minutes} min`, cents: rule.per_minute_cents * minutes });
  }
  if (rule.waiting_per_minute_cents && waiting) {
    lines.push({ label: `Waiting · ${waiting} min`, cents: rule.waiting_per_minute_cents * waiting });
  }
  if (rule.crew_cents && req.clinical_escort) {
    lines.push({ label: "Clinical escort", cents: rule.crew_cents });
  }

  const equipmentCount = EQUIPMENT_REQUIREMENTS.filter((k) => req[k]).length;
  if (rule.equipment_cents && equipmentCount) {
    lines.push({
      label: `Equipment · ${equipmentCount} item${equipmentCount > 1 ? "s" : ""}`,
      cents: rule.equipment_cents * equipmentCount,
    });
  }
  if (rule.accessibility_cents && (req.accessibility || req.wheelchair || req.elderly_assistance)) {
    lines.push({ label: "Accessibility assistance", cents: rule.accessibility_cents });
  }

  let subtotal = lines.reduce((s, l) => s + l.cents, 0);

  if (rule.after_hours_pct && isAfterHours(when)) {
    const surcharge = Math.round((subtotal * rule.after_hours_pct) / 100);
    lines.push({ label: `After-hours surcharge (${rule.after_hours_pct}%)`, cents: surcharge });
    subtotal += surcharge;
  }

  let total = subtotal;
  if (rule.minimum_fare_cents && total < rule.minimum_fare_cents) {
    lines.push({ label: "Minimum fare adjustment", cents: rule.minimum_fare_cents - total });
    total = rule.minimum_fare_cents;
  }

  return {
    lines,
    subtotalCents: subtotal,
    totalCents: total,
    currency: rule.currency || "KES",
    ruleLabel: rule.label,
  };
}

/** Picks the rule that applies to a service, preferring an explicit tier. */
export function pickRule(
  rules: PricingRule[],
  service: ServiceType,
  tier?: string | null,
): PricingRule | null {
  const forService = rules.filter((r) => r.service_type === service && r.active);
  if (forService.length === 0) return null;
  if (tier) {
    const exact = forService.find((r) => r.tier === tier);
    if (exact) return exact;
  }
  return forService.find((r) => r.tier === "standard") ?? forService[0] ?? null;
}

/**
 * Ambulance tier implied by the requested clinical support. ALS is used when
 * the patient needs monitoring, ventilation or infusion support.
 */
export function ambulanceTier(req: Requirements): "als" | "bls" {
  return req.ventilator || req.monitor || req.infusion_pump || req.incubator ? "als" : "bls";
}

export function formatKes(cents: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Math.round(cents) / 100);
}

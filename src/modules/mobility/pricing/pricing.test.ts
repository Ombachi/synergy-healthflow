import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateFare, pickRule, ambulanceTier, isAfterHours } from "./pricing";
import type { PricingRule } from "../types";

function rule(overrides: Partial<PricingRule>): PricingRule {
  return {
    id: "r1",
    service_type: "cab",
    tier: "standard",
    label: "Standard cab",
    currency: "KES",
    active: true,
    ...overrides,
  } as PricingRule;
}

describe("mobility fare engine", () => {
  it("adds base fare and distance", () => {
    const fare = calculateFare({ rule: rule({ base_fare_cents: 30000, per_km_cents: 15000 }), distanceKm: 10, when: new Date(2026, 0, 5, 14, 0) });
    assert.equal(fare.subtotalCents, 180000);
    assert.equal(fare.totalCents, 180000);
    assert.equal(fare.currency, "KES");
  });

  it("charges time and waiting minutes", () => {
    const fare = calculateFare({ rule: rule({ per_minute_cents: 500, waiting_per_minute_cents: 200 }), distanceKm: 0, durationMinutes: 20, waitingMinutes: 10, when: new Date(2026, 0, 5, 14, 0) });
    assert.equal(fare.totalCents, 500 * 20 + 200 * 10);
  });

  it("applies the minimum fare when the trip is short", () => {
    const fare = calculateFare({ rule: rule({ base_fare_cents: 30000, per_km_cents: 15000, minimum_fare_cents: 50000 }), distanceKm: 0.5, when: new Date(2026, 0, 5, 14, 0) });
    assert.equal(fare.totalCents, 50000);
    assert.ok(fare.lines.some((l) => l.label === "Minimum fare adjustment"));
  });

  it("adds the after-hours surcharge between 20:00 and 06:00 only", () => {
    const r = rule({ base_fare_cents: 100000, after_hours_pct: 20 });
    const night = calculateFare({ rule: r, distanceKm: 0, when: new Date(2026, 0, 5, 22, 0) });
    assert.equal(night.totalCents, 120000);
    const day = calculateFare({ rule: r, distanceKm: 0, when: new Date(2026, 0, 5, 14, 0) });
    assert.equal(day.totalCents, 100000);
  });

  it("charges per equipment item and once for accessibility", () => {
    const fare = calculateFare({
      rule: rule({ base_fare_cents: 10000, equipment_cents: 1000, accessibility_cents: 2500 }),
      distanceKm: 0,
      requirements: { oxygen: true, stretcher: true, wheelchair: true },
      when: new Date(2026, 0, 5, 14, 0),
    });
    // oxygen + stretcher + wheelchair = 3 equipment items; accessibility flags add one fee
    assert.equal(fare.totalCents, 10000 + 3000 + 2500);
  });

  it("adds a clinical escort fee only when requested", () => {
    const r = rule({ base_fare_cents: 10000, crew_cents: 5000 });
    const withEscort = calculateFare({ rule: r, distanceKm: 0, requirements: { clinical_escort: true }, when: new Date(2026, 0, 5, 14, 0) });
    assert.equal(withEscort.totalCents, 15000);
    const without = calculateFare({ rule: r, distanceKm: 0, when: new Date(2026, 0, 5, 14, 0) });
    assert.equal(without.totalCents, 10000);
  });

  it("never returns a negative fare", () => {
    const fare = calculateFare({ rule: rule({ per_km_cents: 15000 }), distanceKm: -5, when: new Date(2026, 0, 5, 14, 0) });
    assert.equal(fare.totalCents, 0);
  });

  it("picks the exact tier, then standard, then the first active rule", () => {
    const rules = [
      rule({ id: "a", tier: "premium", label: "Premium" }),
      rule({ id: "b", tier: "standard", label: "Standard" }),
    ];
    assert.equal(pickRule(rules, "cab" as never, "premium")?.id, "a");
    assert.equal(pickRule(rules, "cab" as never, "unknown")?.id, "b");
    assert.equal(pickRule(rules, "cab" as never)?.id, "b");
    assert.equal(pickRule([rule({ id: "c", active: false })], "cab" as never), null);
    assert.equal(pickRule([], "cab" as never), null);
  });

  it("classifies ALS when monitoring, ventilation or infusion is needed", () => {
    assert.equal(ambulanceTier({ ventilator: true }), "als");
    assert.equal(ambulanceTier({ monitor: true }), "als");
    assert.equal(ambulanceTier({ infusion_pump: true }), "als");
    assert.equal(ambulanceTier({ oxygen: true }), "bls");
    assert.equal(ambulanceTier({}), "bls");
  });

  it("detects after-hours boundaries", () => {
    assert.equal(isAfterHours(new Date(2026, 0, 5, 20, 0)), true);
    assert.equal(isAfterHours(new Date(2026, 0, 5, 5, 59)), true);
    assert.equal(isAfterHours(new Date(2026, 0, 5, 6, 0)), false);
    assert.equal(isAfterHours(new Date(2026, 0, 5, 19, 59)), false);
  });
});

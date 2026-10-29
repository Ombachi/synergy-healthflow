import { describe, expect, it } from "vitest";
import { aggregateFinalBill, canSignStep, isFullyCleared, nextStep, outpatientCloseBlockers } from "./discharge-rules";
import { canPerform } from "./action-permissions";

const sig = { by: "u", at: "2026-10-29T10:00:00Z" };

describe("discharge clearance", () => {
  it("runs clinical → pharmacy → nursing → cashier in order", () => {
    expect(nextStep({})).toBe("clinical");
    expect(nextStep({ clinical: sig })).toBe("pharmacy");
    expect(canSignStep("nursing", { clinical: sig }, { roles: ["nurse"] })).toMatch(/Earlier/);
    expect(isFullyCleared({ clinical: sig, pharmacy: sig, nursing: sig, cashier: sig })).toBe(true);
  });
  it("only a pharmacist signs TTO and only when all take-home meds are dispensed", () => {
    const s = { clinical: sig };
    expect(canSignStep("pharmacy", s, { roles: ["nurse"] })).toMatch(/Only/);
    expect(canSignStep("pharmacy", s, { roles: ["pharmacist"], ttoPending: 2 })).toMatch(/2 take-home/);
    expect(canSignStep("pharmacy", s, { roles: ["pharmacist"], ttoPending: 0 })).toBeNull();
  });
  it("cashier needs zero balance or a signed sponsor claim", () => {
    const s = { clinical: sig, pharmacy: sig, nursing: sig };
    expect(canSignStep("cashier", s, { roles: ["cashier"], balanceCents: 500 })).toMatch(/Balance/);
    expect(canSignStep("cashier", s, { roles: ["insurance_officer"], balanceCents: 500, sponsorClaimSigned: true })).toBeNull();
  });
});

describe("final bill", () => {
  it("rolls bed days, unbilled items and prior invoices into one balance", () => {
    const b = aggregateFinalBill({
      admittedAt: "2026-10-26T08:00:00Z", dischargeAt: "2026-10-29T07:00:00Z", bedDailyRateCents: 500000,
      unbilled: [{ kind: "lab", description: "FBC", qty: 1, unit_price_cents: 120000 }],
      invoices: [{ total_cents: 300000, paid_cents: 100000, status: "partial" }, { total_cents: 999, paid_cents: 0, status: "void" }],
    });
    expect(b.days).toBe(3);
    expect(b.total).toBe(1500000 + 120000 + 300000);
    expect(b.balance).toBe(1820000);
  });
});

describe("outpatient close gate", () => {
  it("blocks pending labs, undispensed prescriptions and unpaid bills", () => {
    const r = outpatientCloseBlockers({
      labOrders: [{ status: "pending" }, { status: "completed" }],
      prescriptions: [{ id: "a" }, { id: "b" }], dispensedPrescriptionIds: ["a"],
      invoices: [{ total_cents: 10000, paid_cents: 0, status: "issued" }],
    });
    expect(r).toHaveLength(3);
    expect(outpatientCloseBlockers({ labOrders: [], prescriptions: [], dispensedPrescriptionIds: [], invoices: [] })).toEqual([]);
  });
});

describe("action permissions", () => {
  it("cashiers collect payments but cannot issue credit notes", () => {
    expect(canPerform("billing.collect_payment", { roles: ["cashier"] })).toBe(true);
    expect(canPerform("billing.issue_credit_note", { roles: ["cashier"] })).toBe(false);
  });
  it("per-user deny blocks a junior doctor from controlled drugs; grant allows a named user", () => {
    expect(canPerform("pharmacy.prescribe_controlled", { roles: ["doctor"], overrides: [{ action: "pharmacy.prescribe_controlled", effect: "deny" }] })).toBe(false);
    expect(canPerform("clinical.reopen_visit", { roles: ["doctor"], overrides: [{ action: "clinical.reopen_visit", effect: "grant" }] })).toBe(true);
  });
  it("satellite nurse bundle can register and collect cash", () => {
    expect(canPerform("patients.register", { roles: ["nurse"], bundles: ["satellite_nurse"] })).toBe(true);
    expect(canPerform("billing.collect_payment", { roles: ["nurse"], bundles: ["satellite_nurse"] })).toBe(true);
  });
  it("a switched-off module denies even with a grant", () => {
    expect(canPerform("billing.collect_payment", { roles: ["cashier"], modules: { billing: false } })).toBe(false);
  });
});

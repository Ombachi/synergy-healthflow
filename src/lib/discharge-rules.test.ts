import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateFinalBill, canSignStep, isFullyCleared, nextStep, outpatientCloseBlockers } from "./discharge-rules";
import { canPerform } from "./action-permissions";

const sig = { by: "u", at: "2026-10-29T10:00:00Z" };

describe("discharge clearance", () => {
  it("runs clinical → pharmacy → nursing → cashier in order", () => {
    assert.equal(nextStep({}), "clinical");
    assert.equal(nextStep({ clinical: sig }), "pharmacy");
    assert.match(canSignStep("nursing", { clinical: sig }, { roles: ["nurse"] }) ?? "", /Earlier/);
    assert.equal(isFullyCleared({ clinical: sig, pharmacy: sig, nursing: sig, cashier: sig }), true);
  });
  it("only a pharmacist signs TTO and only when all take-home meds are dispensed", () => {
    const s = { clinical: sig };
    assert.match(canSignStep("pharmacy", s, { roles: ["nurse"] }) ?? "", /Only/);
    assert.match(canSignStep("pharmacy", s, { roles: ["pharmacist"], ttoPending: 2 }) ?? "", /2 take-home/);
    assert.equal(canSignStep("pharmacy", s, { roles: ["pharmacist"], ttoPending: 0 }), null);
  });
  it("cashier needs zero balance or a signed sponsor claim", () => {
    const s = { clinical: sig, pharmacy: sig, nursing: sig };
    assert.match(canSignStep("cashier", s, { roles: ["cashier"], balanceCents: 500 }) ?? "", /Balance/);
    assert.equal(canSignStep("cashier", s, { roles: ["insurance_officer"], balanceCents: 500, sponsorClaimSigned: true }), null);
  });
});

describe("final bill", () => {
  it("rolls bed days, unbilled items and prior invoices into one balance", () => {
    const b = aggregateFinalBill({
      admittedAt: "2026-10-26T08:00:00Z", dischargeAt: "2026-10-29T07:00:00Z", bedDailyRateCents: 500000,
      unbilled: [{ kind: "lab", description: "FBC", qty: 1, unit_price_cents: 120000 }],
      invoices: [{ total_cents: 300000, paid_cents: 100000, status: "partial" }, { total_cents: 999, paid_cents: 0, status: "void" }],
    });
    assert.equal(b.days, 3);
    assert.equal(b.total, 1500000 + 120000 + 300000);
    assert.equal(b.balance, 1820000);
  });
});

describe("outpatient close gate", () => {
  it("blocks pending labs, undispensed prescriptions and unpaid bills", () => {
    const r = outpatientCloseBlockers({
      labOrders: [{ status: "pending" }, { status: "completed" }],
      prescriptions: [{ id: "a" }, { id: "b" }], dispensedPrescriptionIds: ["a"],
      invoices: [{ total_cents: 10000, paid_cents: 0, status: "issued" }],
    });
    assert.equal(r.length, 3);
    assert.deepEqual(outpatientCloseBlockers({ labOrders: [], prescriptions: [], dispensedPrescriptionIds: [], invoices: [] }), []);
  });
});

describe("action permissions", () => {
  it("cashiers collect payments but cannot issue credit notes", () => {
    assert.equal(canPerform("billing.collect_payment", { roles: ["cashier"] }), true);
    assert.equal(canPerform("billing.issue_credit_note", { roles: ["cashier"] }), false);
  });
  it("per-user deny blocks a junior doctor from controlled drugs; grant allows a named user", () => {
    assert.equal(canPerform("pharmacy.prescribe_controlled", { roles: ["doctor"], overrides: [{ action: "pharmacy.prescribe_controlled", effect: "deny" }] }), false);
    assert.equal(canPerform("clinical.reopen_visit", { roles: ["doctor"], overrides: [{ action: "clinical.reopen_visit", effect: "grant" }] }), true);
  });
  it("satellite nurse bundle can register and collect cash", () => {
    assert.equal(canPerform("patients.register", { roles: ["nurse"], bundles: ["satellite_nurse"] }), true);
    assert.equal(canPerform("billing.collect_payment", { roles: ["nurse"], bundles: ["satellite_nurse"] }), true);
  });
  it("a switched-off module denies even with a grant", () => {
    assert.equal(canPerform("billing.collect_payment", { roles: ["cashier"], modules: { billing: false } }), false);
  });
});

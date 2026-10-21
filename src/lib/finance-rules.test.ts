import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { centsFromInput, validateCollection, validateLpoCoverage, reconciliationVariance, confirmedCollections, callbackOutcome } from "./finance-rules";

describe("finance safety", () => {
  it("stores exact cents", () => { assert.equal(centsFromInput("10.29"), 1029); assert.throws(() => centsFromInput("10.299")); });
  it("requires sufficient cash and calculates change", () => { assert.deepEqual(validateCollection({ method: "cash", amountCents: 12000, dueCents: 15000, receivedCents: 20000 }), { changeCents: 8000 }); assert.throws(() => validateCollection({ method: "cash", amountCents: 12000, dueCents: 15000, receivedCents: 10000 })); });
  it("requires both card terminal and authorization", () => { assert.throws(() => validateCollection({ method: "card", amountCents: 10000, dueCents: 10000, reference: "AUTH1" })); assert.deepEqual(validateCollection({ method: "card", amountCents: 10000, dueCents: 10000, terminal: "POS1", reference: "AUTH1" }), { changeCents: 0 }); });
  it("rejects M-Pesa rounding of fractional balances", () => { assert.throws(() => validateCollection({ method: "mpesa", amountCents: 1029, dueCents: 1029 })); });
  it("does not count pending or insurance/LPO as cash", () => { assert.equal(confirmedCollections([{ amount_cents: 10000, method: "cash", status: "confirmed" }, { amount_cents: 20000, method: "mpesa", status: "pending" }, { amount_cents: 30000, method: "insurance", status: "confirmed" }, { amount_cents: 40000, method: "lpo", status: "confirmed" }]), 10000); });
  it("matches callback amount and requires receipt", () => { assert.equal(callbackOutcome(0, 10000, 100, "MP123"), "confirmed"); assert.equal(callbackOutcome(0, 10000, 99, "MP123"), "unmatched"); assert.equal(callbackOutcome(0, 10000, 100), "unmatched"); });
  it("distinguishes cancellation and timeout", () => { assert.equal(callbackOutcome(1032, 10000), "cancelled"); assert.equal(callbackOutcome(1037, 10000), "timeout"); assert.equal(callbackOutcome(1, 10000), "failed"); });
  const lpo = { status: "active", issueDate: "2026-10-01", expiryDate: "2026-10-31", approvedCents: 100000, usedCents: 30000, amountCents: 20000, approvedServices: ["Consultation"], services: ["Consultation"] };
  it("validates LPO active status", () => { assert.throws(() => validateLpoCoverage({ ...lpo, status: "suspended" }, "2026-10-21")); });
  it("validates LPO expiry", () => { assert.throws(() => validateLpoCoverage(lpo, "2026-11-01")); });
  it("enforces LPO remaining balance", () => { assert.equal(validateLpoCoverage(lpo, "2026-10-21"), 50000); assert.throws(() => validateLpoCoverage({ ...lpo, amountCents: 70001 }, "2026-10-21")); });
  it("enforces approved LPO services", () => { assert.throws(() => validateLpoCoverage({ ...lpo, services: ["Surgery"] }, "2026-10-21")); });
  it("records signed reconciliation variance", () => { assert.equal(reconciliationVariance(20000, 18000), -2000); assert.equal(reconciliationVariance(20000, 22000), 2000); });
});
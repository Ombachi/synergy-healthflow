import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { panicFlag } from "./lab-panic";
describe("lab panic values", () => {
  it("potassium 2.4 is critical low", () => assert.equal(panicFlag("Potassium", 2.4), "critical low"));
  it("glucose 1.9 is critical low", () => assert.equal(panicFlag("Glucose (fasting)", 1.9), "critical low"));
  it("potassium 4.2 is not critical", () => assert.equal(panicFlag("Potassium", 4.2), null));
  it("table ranges override defaults", () =>
    assert.equal(panicFlag("Potassium", 3, [{ parameter: "potassium", units: "mmol/L", critical_low: 3.2, critical_high: 6 }]), "critical low"));
});

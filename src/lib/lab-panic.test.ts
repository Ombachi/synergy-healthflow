import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isCriticalLabFlag, panicFlag } from "./lab-panic";
describe("lab panic values", () => {
  it("potassium 2.4 is critical low", () => assert.equal(panicFlag("Potassium", 2.4), "critical low"));
  it("glucose 1.9 is critical low", () => assert.equal(panicFlag("Glucose (fasting)", 1.9), "critical low"));
  it("potassium 4.2 is not critical", () => assert.equal(panicFlag("Potassium", 4.2), null));
  it("table ranges override defaults", () =>
    assert.equal(panicFlag("Potassium", 3, [{ parameter: "potassium", units: "mmol/L", critical_low: 3.2, critical_high: 6 }]), "critical low"));
  it("recognizes the overall CRITICAL result flag", () => assert.equal(isCriticalLabFlag("CRITICAL"), true));
  it("recognizes legacy critical low parameter flags", () => assert.equal(isCriticalLabFlag("critical low"), true));
  it("recognizes legacy critical high parameter flags", () => assert.equal(isCriticalLabFlag("critical high"), true));
  it("does not promote ordinary abnormal flags to panic flags", () => {
    for (const flag of ["low", "high", "normal", null, undefined]) {
      assert.equal(isCriticalLabFlag(flag), false);
    }
  });
});

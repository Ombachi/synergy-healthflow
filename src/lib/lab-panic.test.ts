import { describe, it, expect } from "vitest";
import { panicFlag } from "./lab-panic";
describe("lab panic values", () => {
  it("potassium 2.4 is critical low", () => expect(panicFlag("Potassium", 2.4)).toBe("critical low"));
  it("glucose 1.9 is critical low", () => expect(panicFlag("Glucose (fasting)", 1.9)).toBe("critical low"));
  it("potassium 4.2 is not critical", () => expect(panicFlag("Potassium", 4.2)).toBeNull());
  it("table ranges override defaults", () =>
    expect(panicFlag("Potassium", 3, [{ parameter: "potassium", units: "mmol/L", critical_low: 3.2, critical_high: 6 }])).toBe("critical low"));
});

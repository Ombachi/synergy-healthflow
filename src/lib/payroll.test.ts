import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateMonthlyPayroll, graduatedTax, PAYE_BANDS, nssfContributions, healthContributionLabel } from "./payroll";

describe("Kenyan monthly statutory payroll", () => {
  const input = { month: "2026-10", basicCents: 10000000, allowancesCents: 0, overtimeCents: 0, otherDeductionsCents: 0, resident: true };
  it("taxes the first KES 24000 at 10%", () => assert.equal(graduatedTax(2400000, PAYE_BANDS), 240000));
  it("taxes the next KES 8333 at 25%", () => assert.equal(graduatedTax(3233300, PAYE_BANDS), 448325));
  it("taxes through KES 500000 at 30%", () => assert.equal(graduatedTax(50000000, PAYE_BANDS), 14478335));
  it("taxes KES 500000–800000 at 32.5%", () => assert.equal(graduatedTax(80000000, PAYE_BANDS), 24228335));
  it("taxes income above KES 800000 at 35%", () => assert.equal(graduatedTax(90000000, PAYE_BANDS), 27728335));
  it("applies KES 2400 resident personal relief", () => assert.equal(calculateMonthlyPayroll(input).personalReliefCents, 240000));
  it("does not give nonresidents personal relief", () => assert.equal(calculateMonthlyPayroll({ ...input, resident: false }).personalReliefCents, 0));
  it("floors PAYE at zero", () => assert.equal(calculateMonthlyPayroll({ ...input, basicCents: 1000000 }).payeCents, 0));
  it("charges SHIF at 2.75% gross", () => assert.equal(calculateMonthlyPayroll(input).shifCents, 275000));
  it("enforces the statutory KES 300 SHIF minimum", () => assert.equal(calculateMonthlyPayroll({ ...input, basicCents: 1000000 }).shifCents, 30000));
  it("caps February 2026 Tier I at KES 540", () => assert.equal(nssfContributions(900000, "2026-02").tier1Cents, 54000));
  it("caps Tier II at KES 5940 and matches employer", () => assert.deepEqual(nssfContributions(20000000, "2026-02"), { tier1Cents: 54000, tier2Cents: 594000, employeeCents: 648000, employerCents: 648000, lowerLimitCents: 900000, upperLimitCents: 10800000 }));
  it("uses January's Year 3 cap of KES 4320", () => assert.equal(nssfContributions(20000000, "2026-01").employeeCents, 432000));
  it("takes 6% without charging Tier II below the lower limit", () => assert.equal(nssfContributions(500000, "2026-10").employeeCents, 30000));
  it("charges 1.5% AHL per party and excludes irregular overtime", () => {
    const result = calculateMonthlyPayroll({ ...input, overtimeCents: 1000000 });
    assert.equal(result.employeeHousingCents, 150000); assert.equal(result.employerHousingCents, 150000);
  });
  it("deducts employee NSSF SHIF and AHL before PAYE", () => assert.equal(calculateMonthlyPayroll(input).taxableCents, 8975000));
  it("keeps employer contributions outside take-home deductions", () => {
    const r = calculateMonthlyPayroll(input);
    assert.equal(r.payeCents, 1930485); assert.equal(r.netCents, 7044515);
    assert.equal(r.employerCostCents, 10750000);
  });
  it("rejects negative input amounts", () => assert.throws(() => calculateMonthlyPayroll({ ...input, basicCents: -1 })));
  it("rejects unsupported future rates rather than guessing", () => assert.throws(() => calculateMonthlyPayroll({ ...input, month: "2027-02" }), /2026/));
  it("preserves NHIF labels on historical payslips", () => { assert.equal(healthContributionLabel("2024-09-01"), "NHIF"); assert.equal(healthContributionLabel("2024-10-01"), "SHA / SHIF"); });
});
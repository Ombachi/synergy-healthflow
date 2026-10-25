export type TaxBand = { widthCents: number | null; rateBasisPoints: number };

/** Monetary values are integer cents; rates are basis points (100 = 1%). */
export function rateAmount(cents: number, basisPoints: number) {
  return Math.round(cents * basisPoints / 10000);
}

export function graduatedTax(taxableCents: number, bands: readonly TaxBand[]) {
  let remaining = Math.max(0, taxableCents);
  let tax = 0;
  for (const band of bands) {
    const portion = band.widthCents === null ? remaining : Math.min(remaining, band.widthCents);
    tax += portion * band.rateBasisPoints / 10000;
    remaining -= portion;
    if (remaining <= 0) break;
  }
  return Math.round(tax);
}

export type MonthlyPayrollInput = {
  month: string;
  basicCents: number;
  allowancesCents: number;
  overtimeCents: number;
  otherDeductionsCents: number;
  resident: boolean;
};

export function validatePayrollInput(input: MonthlyPayrollInput) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error("Select a valid payroll month.");
  for (const amount of [input.basicCents, input.allowancesCents, input.overtimeCents, input.otherDeductionsCents]) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100000000000)
      throw new Error("Enter non-negative payroll amounts with at most two decimal places.");
  }
}

export const PAYE_BANDS: readonly TaxBand[] = [
  { widthCents: 2400000, rateBasisPoints: 1000 },
  { widthCents: 833300, rateBasisPoints: 2500 },
  { widthCents: 46766700, rateBasisPoints: 3000 },
  { widthCents: 30000000, rateBasisPoints: 3250 },
  { widthCents: null, rateBasisPoints: 3500 },
];
export const PERSONAL_RELIEF_CENTS = 240000;

export function nssfContributions(pensionableCents: number, month: string) {
  if (!/^2026-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Automatic calculation currently supports 2026 payroll months only.");
  const lower = month === "2026-01" ? 800000 : 900000;
  const upper = month === "2026-01" ? 7200000 : 10800000;
  const tier1Cents = rateAmount(Math.min(pensionableCents, lower), 600);
  const tier2Cents = rateAmount(Math.min(Math.max(pensionableCents - lower, 0), upper - lower), 600);
  return { tier1Cents, tier2Cents, employeeCents: tier1Cents + tier2Cents, employerCents: tier1Cents + tier2Cents, lowerLimitCents: lower, upperLimitCents: upper };
}

/** Standard monthly cash salary; allowances are regular cash allowances, overtime is irregular. */
export function calculateMonthlyPayroll(input: MonthlyPayrollInput) {
  validatePayrollInput(input);
  const grossCents = input.basicCents + input.allowancesCents + input.overtimeCents;
  const nssf = nssfContributions(grossCents, input.month);
  // Regulation 17(2) sets a KES 300 minimum for salaried households as well.
  const shifCents = Math.max(30000, rateAmount(grossCents, 275));
  const housingBaseCents = input.basicCents + input.allowancesCents;
  const employeeHousingCents = rateAmount(housingBaseCents, 150);
  const employerHousingCents = employeeHousingCents;
  const taxableCents = Math.max(0, grossCents - Math.min(nssf.employeeCents, 3000000) - shifCents - employeeHousingCents);
  const taxBeforeReliefCents = graduatedTax(taxableCents, PAYE_BANDS);
  const personalReliefCents = input.resident ? PERSONAL_RELIEF_CENTS : 0;
  const payeCents = Math.max(0, taxBeforeReliefCents - personalReliefCents);
  const employeeDeductionsCents = payeCents + shifCents + nssf.employeeCents + employeeHousingCents + input.otherDeductionsCents;
  const netCents = grossCents - employeeDeductionsCents;
  return { grossCents, taxableCents, taxBeforeReliefCents, personalReliefCents, payeCents, shifCents, nssf,
    housingBaseCents, employeeHousingCents, employerHousingCents, employeeDeductionsCents, netCents,
    employerContributionsCents: nssf.employerCents + employerHousingCents,
    employerCostCents: grossCents + nssf.employerCents + employerHousingCents,
    ruleVersion: input.month === "2026-01" ? "KE-2026-NSSF-Y3" : "KE-2026-NSSF-Y4" };
}

export function healthContributionLabel(periodStart: string) {
  return periodStart >= "2024-10-01" ? "SHA / SHIF" : "NHIF";
}
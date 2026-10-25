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
export type CollectionMethod = "cash" | "card" | "mpesa";
export type SponsorMethod = "insurance" | "lpo";

export function centsFromInput(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error("Enter an amount with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid amount.");
  return cents;
}

export function validateCollection(input: {
  method: CollectionMethod; amountCents: number; dueCents: number;
  receivedCents?: number; terminal?: string; reference?: string;
}): { changeCents: number } {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > input.dueCents) {
    throw new Error("Payment must be greater than zero and cannot exceed the outstanding balance.");
  }
  if (input.method === "cash") {
    if (!Number.isSafeInteger(input.receivedCents) || (input.receivedCents ?? 0) < input.amountCents) {
      throw new Error("Cash received must cover the payment amount.");
    }
    return { changeCents: (input.receivedCents ?? 0) - input.amountCents };
  }
  if (input.method === "card" && (!input.terminal?.trim() || !input.reference?.trim())) {
    throw new Error("Card payments require a provider/terminal and authorization reference.");
  }
  if (input.method === "mpesa" && input.amountCents % 100 !== 0) {
    throw new Error("M-Pesa requires a whole-shilling amount; use another method for fractional balances.");
  }
  return { changeCents: 0 };
}

export function validateLpoCoverage(input: {
  status: string; issueDate: string; expiryDate: string; approvedCents: number; usedCents: number;
  amountCents: number; approvedServices: readonly string[]; services: readonly string[];
}, today: string): number {
  if (input.status !== "active") throw new Error("LPO is not active.");
  if (input.issueDate > today || input.expiryDate < today) throw new Error("LPO is outside its valid dates.");
  const remaining = input.approvedCents - input.usedCents;
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > remaining) {
    throw new Error("LPO coverage exceeds its remaining balance.");
  }
  if (input.approvedServices.length && input.services.some((s) => !input.approvedServices.includes(s))) {
    throw new Error("An invoice service is not approved by this LPO.");
  }
  return remaining - input.amountCents;
}

export function reconciliationVariance(recordedCents: number, declaredCents: number): number {
  if (![recordedCents, declaredCents].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error("Invalid reconciliation totals.");
  return declaredCents - recordedCents;
}

export function confirmedCollections(rows: readonly { amount_cents: number; method: string; status: string }[]): number {
  return rows.filter((r) => r.status === "confirmed" && ["cash", "card", "mpesa"].includes(r.method))
    .reduce((total, row) => total + row.amount_cents, 0);
}

export function callbackOutcome(resultCode: number, expectedCents: number, amountKes?: number, receipt?: string): string {
  if (resultCode !== 0) return resultCode === 1032 ? "cancelled" : resultCode === 1037 ? "timeout" : "failed";
  if (!receipt?.trim() || amountKes === undefined || !Number.isFinite(amountKes) || Math.round(amountKes * 100) !== expectedCents) return "unmatched";
  return "confirmed";
}
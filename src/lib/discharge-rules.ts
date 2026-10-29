/**
 * Pure discharge / visit-closure rules. No database or session access so
 * they can be unit-tested and reused by screens and server code.
 */
import type { AppRole } from "@/hooks/use-auth";

export type ClearanceStep = "clinical" | "pharmacy" | "nursing" | "cashier";

export const CLEARANCE_STEPS: { key: ClearanceStep; label: string; roles: AppRole[]; description: string }[] = [
  { key: "clinical", label: "Clinical summary", roles: ["doctor", "admin"], description: "Doctor signs the discharge summary and diagnosis." },
  { key: "pharmacy", label: "Pharmacy TTO", roles: ["pharmacist", "admin"], description: "Take-home medicines dispensed and counselled." },
  { key: "nursing", label: "Nursing clearance", roles: ["nurse", "admin"], description: "Lines removed, belongings returned, patient educated." },
  { key: "cashier", label: "Cashier / SHA / sponsor", roles: ["cashier", "billing_officer", "insurance_officer", "admin"], description: "Account balanced or insurance/sponsor claim signed." },
];

export interface StepSignoff { by: string; byName?: string | null; at: string; note?: string | null }
export type ClearanceState = Partial<Record<ClearanceStep, StepSignoff>>;

/** The next step that still needs a sign-off, in strict order. */
export function nextStep(state: ClearanceState): ClearanceStep | null {
  for (const s of CLEARANCE_STEPS) if (!state[s.key]) return s.key;
  return null;
}

export interface SignoffContext {
  roles: AppRole[];
  summaryReady?: boolean;
  ttoPending?: number;
  balanceCents?: number;
  sponsorClaimSigned?: boolean;
}

/** Returns an error message, or null if this user may sign this step now. */
export function canSignStep(step: ClearanceStep, state: ClearanceState, ctx: SignoffContext): string | null {
  const def = CLEARANCE_STEPS.find((s) => s.key === step)!;
  if (state[step]) return "Already signed.";
  if (nextStep(state) !== step) return "Earlier steps must be signed first.";
  if (!ctx.roles.some((r) => def.roles.includes(r))) return `Only ${def.roles.filter((r) => r !== "admin").join(" / ")} can sign this step.`;
  if (step === "clinical" && !ctx.summaryReady) return "Write the diagnosis and discharge summary first.";
  if (step === "pharmacy" && (ctx.ttoPending ?? 0) > 0) return `${ctx.ttoPending} take-home medicine(s) not yet dispensed.`;
  if (step === "cashier" && (ctx.balanceCents ?? 0) > 0 && !ctx.sponsorClaimSigned) return "Balance outstanding — collect payment or sign the sponsor claim.";
  return null;
}

export function isFullyCleared(state: ClearanceState): boolean {
  return nextStep(state) === null;
}

/* ---------- Aggregated final bill ---------- */
export interface BillLine { kind: string; description: string; qty: number; unit_price_cents: number }
export interface FinalBillInput {
  admittedAt: string;
  dischargeAt?: string;
  bedDailyRateCents: number;
  unbilled: BillLine[];
  invoices: { total_cents: number; paid_cents: number; status: string }[];
}

export function lengthOfStayDays(admittedAt: string, dischargeAt: string = new Date().toISOString()): number {
  const ms = new Date(dischargeAt).getTime() - new Date(admittedAt).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

export function aggregateFinalBill(i: FinalBillInput) {
  const days = lengthOfStayDays(i.admittedAt, i.dischargeAt);
  const lines: (BillLine & { amount_cents: number })[] = [
    { kind: "bed", description: `Bed / ward stay (${days} day${days > 1 ? "s" : ""})`, qty: days, unit_price_cents: i.bedDailyRateCents },
    ...i.unbilled,
  ].map((l) => ({ ...l, amount_cents: Math.round(l.qty * l.unit_price_cents) }));
  const byKind: Record<string, number> = {};
  for (const l of lines) byKind[l.kind] = (byKind[l.kind] ?? 0) + l.amount_cents;
  const newCharges = lines.reduce((s, l) => s + l.amount_cents, 0);
  const live = i.invoices.filter((x) => x.status !== "void");
  const priorBilled = live.reduce((s, x) => s + x.total_cents, 0);
  const paid = live.reduce((s, x) => s + x.paid_cents, 0);
  return { days, lines, byKind, newCharges, priorBilled, paid, total: newCharges + priorBilled, balance: newCharges + priorBilled - paid };
}

/* ---------- Outpatient close gate ---------- */
export interface OutpatientGateInput {
  labOrders: { status: string }[];
  imagingOrders?: { status: string }[];
  prescriptions: { id: string }[];
  dispensedPrescriptionIds: string[];
  invoices: { total_cents: number; paid_cents: number; status: string }[];
}

const LAB_DONE = new Set(["completed", "resulted", "verified", "reported", "cancelled", "rejected"]);

export function outpatientCloseBlockers(i: OutpatientGateInput): string[] {
  const out: string[] = [];
  const pendingLab = i.labOrders.filter((o) => !LAB_DONE.has(o.status)).length;
  if (pendingLab) out.push(`${pendingLab} lab test(s) still pending`);
  const pendingImg = (i.imagingOrders ?? []).filter((o) => !LAB_DONE.has(o.status)).length;
  if (pendingImg) out.push(`${pendingImg} imaging order(s) still pending`);
  const dispensed = new Set(i.dispensedPrescriptionIds);
  const undispensed = i.prescriptions.filter((p) => !dispensed.has(p.id)).length;
  if (undispensed) out.push(`${undispensed} prescription(s) not yet dispensed`);
  const unpaid = i.invoices.filter((x) => !["paid", "void"].includes(x.status) && x.total_cents > x.paid_cents)
    .reduce((s, x) => s + (x.total_cents - x.paid_cents), 0);
  if (unpaid > 0) out.push(`KES ${(unpaid / 100).toLocaleString("en-KE", { minimumFractionDigits: 2 })} unpaid`);
  return out;
}

/* ---------- Take-home pack ---------- */
export const DEFAULT_RED_FLAGS = [
  "Difficulty breathing or chest pain",
  "Fever above 38.5°C that does not settle",
  "Confusion, fainting or severe headache",
  "Bleeding, severe pain or swelling at a wound site",
  "Unable to eat, drink or keep medicines down",
];

export const DEFAULT_DIET = "Eat a balanced diet, drink plenty of clean water, and avoid alcohol while on medication.";

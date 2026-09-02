// Chronic care medication refill engine — pure, deterministic logic.
// No database access here: callers pass rows in and act on the decisions out,
// so the same rules run on the server, in the UI and in tests.

export type PrescriptionStatus =
  | "active"
  | "on-hold"
  | "completed"
  | "stopped"
  | "cancelled"
  | "needs-review";

export type RefillDecision =
  | "eligible"
  | "requires_clinical_review"
  | "not_due"
  | "policy_blocked"
  | "expired"
  | "max_refills_reached";

export interface ChronicMedication {
  id: string;
  patient_id: string;
  mrn: string | null;
  encounter_id: string | null;
  condition: string | null;
  medication: string;
  dose: string | null;
  route: string | null;
  /** Free-text frequency as prescribed, e.g. "BD", "2 tablets/day", "TDS". */
  frequency: string | null;
  /** Total units dispensed for the current supply. */
  quantity: number | null;
  /** Explicit duration in days when the prescriber set one. */
  duration_days: number | null;
  start_date: string;
  prescriber_id: string | null;
  status: PrescriptionStatus;
  /** Refills already fulfilled against this order. */
  refills_used?: number;
  /** Last date a clinician reviewed this chronic order. */
  last_review_date?: string | null;
  is_controlled?: boolean;
}

export interface RefillPolicy {
  /** Notify this many days before expected completion. */
  reminder_days_before: number;
  /** Maximum refills allowed without a new prescription. */
  max_refills: number;
  /** A clinical review is required if the last review is older than this. */
  review_interval_days: number;
  /** Controlled drugs always need a prescriber decision. */
  controlled_requires_review: boolean;
  /** Earliest refill as a fraction of the supply consumed (0.8 = 80%). */
  earliest_refill_fraction: number;
}

export const DEFAULT_REFILL_POLICY: RefillPolicy = {
  reminder_days_before: 7,
  max_refills: 3,
  review_interval_days: 180,
  controlled_requires_review: true,
  earliest_refill_fraction: 0.8,
};

const DAY_MS = 86_400_000;

/**
 * Parse a prescriber's frequency string into doses (units) per day.
 * Understands Latin abbreviations, "x/day", "every N hours" and
 * "N tablets/day" style entries. Returns null when it cannot be inferred.
 */
export function dosesPerDay(frequency: string | null | undefined): number | null {
  if (!frequency) return null;
  const f = frequency.trim().toLowerCase();

  const abbrev: Record<string, number> = {
    od: 1, "o.d": 1, daily: 1, nocte: 1, mane: 1, hs: 1, "once daily": 1,
    bd: 2, bid: 2, "b.d": 2, "twice daily": 2,
    tds: 3, tid: 3, "t.d.s": 3, "three times daily": 3,
    qds: 4, qid: 4, "q.d.s": 4, "four times daily": 4,
  };
  for (const [k, v] of Object.entries(abbrev)) {
    if (new RegExp(`(^|[^a-z])${k.replace(/\./g, "\\.")}([^a-z]|$)`).test(f)) return v;
  }

  // "every 8 hours" / "q8h"
  const hourly = f.match(/(?:every|q)\s*(\d+)\s*(?:h|hour|hours|hrly)/);
  if (hourly) return 24 / parseFloat(hourly[1]!);

  // "2 tablets/day", "3 times a day", "2 x daily"
  const perDay = f.match(/(\d+(?:\.\d+)?)\s*(?:tablets?|caps?|units?|times?|x)?\s*(?:per|\/|a|each)?\s*day/);
  if (perDay) return parseFloat(perDay[1]!);

  // "weekly" / "every 7 days"
  if (/weekly/.test(f)) return 1 / 7;
  const everyDays = f.match(/(?:every|q)\s*(\d+)\s*(?:d|day|days)/);
  if (everyDays) return 1 / parseFloat(everyDays[1]!);

  return null;
}

/** Days of supply from quantity + frequency, or the explicit duration. */
export function supplyDays(med: Pick<ChronicMedication, "quantity" | "frequency" | "duration_days">): number | null {
  if (med.duration_days && med.duration_days > 0) return med.duration_days;
  const perDay = dosesPerDay(med.frequency);
  if (!perDay || !med.quantity || med.quantity <= 0) return null;
  return Math.floor(med.quantity / perDay);
}

/** Expected completion date (ISO date string) for the current supply. */
export function expectedCompletion(med: ChronicMedication): string | null {
  const days = supplyDays(med);
  if (days == null) return null;
  const start = new Date(med.start_date);
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysRemaining(med: ChronicMedication, now: Date = new Date()): number | null {
  const end = expectedCompletion(med);
  if (!end) return null;
  return Math.ceil((new Date(`${end}T00:00:00Z`).getTime() - now.getTime()) / DAY_MS);
}

export interface RefillAssessment {
  medication_id: string;
  expected_completion: string | null;
  days_remaining: number | null;
  supply_days: number | null;
  /** Threshold reached — patient should be notified. */
  nearing_completion: boolean;
  /** Supply already exhausted. */
  overdue: boolean;
  decision: RefillDecision;
  /** Human-readable reason shown to clinician/patient and written to audit. */
  reason: string;
  /** True only when a fulfillment request may be created automatically. */
  auto_request_allowed: boolean;
}

export function assessRefill(
  med: ChronicMedication,
  policy: RefillPolicy = DEFAULT_REFILL_POLICY,
  now: Date = new Date(),
): RefillAssessment {
  const days = supplyDays(med);
  const remaining = daysRemaining(med, now);
  const nearing = remaining != null && remaining <= policy.reminder_days_before;
  const overdue = remaining != null && remaining < 0;

  const base = {
    medication_id: med.id,
    expected_completion: expectedCompletion(med),
    days_remaining: remaining,
    supply_days: days,
    nearing_completion: nearing && med.status === "active",
    overdue: overdue && med.status === "active",
  };

  const deny = (decision: RefillDecision, reason: string): RefillAssessment => ({
    ...base,
    decision,
    reason,
    auto_request_allowed: false,
  });

  if (med.status === "cancelled" || med.status === "stopped")
    return deny("policy_blocked", "Prescription has been stopped or cancelled");
  if (med.status === "needs-review" || med.status === "on-hold")
    return deny("requires_clinical_review", "Prescriber flagged this order for review");
  if (med.status === "completed" && !nearing && !overdue)
    return deny("policy_blocked", "Course completed — a new prescription is required");
  if (med.is_controlled && policy.controlled_requires_review)
    return deny("requires_clinical_review", "Controlled medication — prescriber authorisation required");
  if ((med.refills_used ?? 0) >= policy.max_refills)
    return deny("max_refills_reached", `Refill limit of ${policy.max_refills} reached — new prescription required`);

  const lastReview = med.last_review_date ? new Date(med.last_review_date) : new Date(med.start_date);
  const reviewAge = (now.getTime() - lastReview.getTime()) / DAY_MS;
  if (reviewAge > policy.review_interval_days)
    return deny(
      "requires_clinical_review",
      `Last clinical review was ${Math.round(reviewAge)} days ago (policy: ${policy.review_interval_days})`,
    );

  if (days == null || remaining == null)
    return deny("requires_clinical_review", "Supply duration could not be calculated from quantity and frequency");

  const consumedFraction = days > 0 ? (days - remaining) / days : 1;
  if (!nearing && consumedFraction < policy.earliest_refill_fraction)
    return deny(
      "not_due",
      `Refill opens in ${remaining - policy.reminder_days_before} day(s)`,
    );

  return {
    ...base,
    decision: "eligible",
    reason: overdue
      ? "Supply exhausted — refill overdue"
      : `Supply ends in ${remaining} day(s) — within the ${policy.reminder_days_before}-day refill window`,
    auto_request_allowed: true,
  };
}

export type FulfillmentStatus =
  | "requested"
  | "pharmacy_review"
  | "clinician_review"
  | "approved"
  | "rejected"
  | "dispensed"
  | "cancelled";

export interface RefillRequestDraft {
  medication_id: string;
  patient_id: string;
  encounter_id: string | null;
  medication: string;
  dose: string | null;
  frequency: string | null;
  quantity: number | null;
  requested_on: string;
  status: FulfillmentStatus;
  decision: RefillDecision;
  reason: string;
}

/**
 * Build a fulfillment request from an assessment. Returns null when the rules
 * say no request should be raised — the engine never silently authorises.
 * Existing open requests are honoured so refills are never duplicated.
 */
export function buildRefillRequest(
  med: ChronicMedication,
  assessment: RefillAssessment,
  openRequestMedicationIds: string[] = [],
  now: Date = new Date(),
): RefillRequestDraft | null {
  if (openRequestMedicationIds.includes(med.id)) return null;
  if (assessment.decision === "not_due" || assessment.decision === "policy_blocked") return null;
  if (assessment.decision === "expired") return null;

  const needsClinician =
    assessment.decision === "requires_clinical_review" || assessment.decision === "max_refills_reached";

  return {
    medication_id: med.id,
    patient_id: med.patient_id,
    encounter_id: med.encounter_id,
    medication: med.medication,
    dose: med.dose,
    frequency: med.frequency,
    quantity: med.quantity,
    requested_on: now.toISOString(),
    status: needsClinician ? "clinician_review" : "pharmacy_review",
    decision: assessment.decision,
    reason: assessment.reason,
  };
}

/** Adherence estimate: dispensed supply days over elapsed days on therapy. */
export function adherenceRatio(
  meds: ChronicMedication[],
  now: Date = new Date(),
): number | null {
  const usable = meds.filter((m) => supplyDays(m) != null);
  if (usable.length === 0) return null;
  let covered = 0;
  let elapsed = 0;
  for (const m of usable) {
    const days = supplyDays(m)!;
    const since = Math.max(1, Math.ceil((now.getTime() - new Date(m.start_date).getTime()) / DAY_MS));
    covered += Math.min(days, since);
    elapsed += since;
  }
  return elapsed > 0 ? Math.min(1, covered / elapsed) : null;
}

export function adherenceBand(ratio: number | null): "unknown" | "poor" | "suboptimal" | "good" {
  if (ratio == null) return "unknown";
  if (ratio < 0.5) return "poor";
  if (ratio < 0.8) return "suboptimal";
  return "good";
}

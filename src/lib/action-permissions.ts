/**
 * Action-level (button-level) permissions with composable role bundles and
 * per-user overrides. Pure: callers pass roles, bundles and overrides.
 * Order of evaluation: facility module off -> deny; user deny -> deny;
 * user grant -> allow; role/bundle default -> allow; otherwise deny.
 */
import type { AppRole } from "@/hooks/use-auth";
import type { ModuleKey } from "@/lib/facilities";

export type ActionKey =
  | "billing.collect_payment"
  | "billing.waive_price"
  | "billing.issue_credit_note"
  | "billing.void_invoice"
  | "pharmacy.prescribe_controlled"
  | "clinical.external_referral"
  | "clinical.reopen_visit"
  | "clinical.close_with_pending"
  | "patients.register";

export const ACTIONS: { key: ActionKey; label: string; module: ModuleKey; roles: AppRole[] }[] = [
  { key: "billing.collect_payment", label: "Collect payments", module: "billing", roles: ["cashier", "billing_officer", "admin"] },
  { key: "billing.waive_price", label: "Waive or discount prices", module: "billing", roles: ["admin"] },
  { key: "billing.issue_credit_note", label: "Issue credit notes", module: "billing", roles: ["billing_officer", "admin"] },
  { key: "billing.void_invoice", label: "Void invoices", module: "billing", roles: ["admin"] },
  { key: "pharmacy.prescribe_controlled", label: "Prescribe controlled drugs", module: "pharmacy", roles: ["doctor"] },
  { key: "clinical.external_referral", label: "Request external referrals", module: "outpatient", roles: ["doctor"] },
  { key: "clinical.reopen_visit", label: "Re-open completed visits", module: "outpatient", roles: ["admin"] },
  { key: "clinical.close_with_pending", label: "Close visit with pending orders/bills", module: "outpatient", roles: ["admin"] },
  { key: "patients.register", label: "Register patients", module: "outpatient", roles: ["receptionist", "admin"] },
];

/** Role bundles for small satellites: one person, several hats. */
export const ROLE_BUNDLES: Record<string, { label: string; roles: AppRole[] }> = {
  satellite_nurse: { label: "Satellite nurse (nurse + reception + cashier)", roles: ["nurse", "receptionist", "cashier"] },
  satellite_clinician: { label: "Satellite clinician (doctor + pharmacist)", roles: ["doctor", "pharmacist"] },
  front_office: { label: "Front office (reception + cashier)", roles: ["receptionist", "cashier"] },
};

export function expandRoles(roles: AppRole[], bundles: string[] = []): AppRole[] {
  const set = new Set<AppRole>(roles);
  for (const b of bundles) for (const r of ROLE_BUNDLES[b]?.roles ?? []) set.add(r);
  return [...set];
}

export interface UserOverride { action: ActionKey; effect: "grant" | "deny" }

export function canPerform(
  action: ActionKey,
  opts: { roles: AppRole[]; bundles?: string[]; overrides?: UserOverride[]; modules?: Partial<Record<ModuleKey, boolean>> },
): boolean {
  const def = ACTIONS.find((a) => a.key === action);
  if (!def) return false;
  if (opts.modules && opts.modules[def.module] === false) return false;
  const ov = (opts.overrides ?? []).filter((o) => o.action === action);
  if (ov.some((o) => o.effect === "deny")) return false;
  if (ov.some((o) => o.effect === "grant")) return true;
  const roles = expandRoles(opts.roles, opts.bundles);
  return roles.some((r) => def.roles.includes(r));
}

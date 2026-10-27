export const COUNCILS = {
  KMPDC: "Kenya Medical Practitioners and Dentists Council",
  NCK: "Nursing Council of Kenya",
  PPB: "Pharmacy and Poisons Board",
  KMLTTB: "Kenya Medical Laboratory Technicians and Technologists Board",
  COC: "Clinical Officers Council",
  OTHER: "Other council",
} as const;
export type Council = keyof typeof COUNCILS;

/** Which council licence a clinical role legally requires. */
export const ROLE_COUNCIL: Partial<Record<string, Council>> = {
  doctor: "KMPDC", nurse: "NCK", pharmacist: "PPB", lab_tech: "KMLTTB", clinical_officer: "COC",
};

export const WARNING_DAYS = 60;
export const CRITICAL_DAYS = 30;
export type LicenseStatus = "valid" | "expiring" | "critical" | "expired" | "missing";

export function daysUntil(expiry: string, today: string) {
  return Math.round((Date.parse(expiry + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
}

export function licenseStatus(expiry: string | null | undefined, today: string): LicenseStatus {
  if (!expiry) return "missing";
  const d = daysUntil(expiry, today);
  if (d < 0) return "expired";
  if (d <= CRITICAL_DAYS) return "critical";
  if (d <= WARNING_DAYS) return "expiring";
  return "valid";
}

export function validateLicense(l: { council: string; license_number: string; issue_date?: string | null; expiry_date: string }) {
  if (!(l.council in COUNCILS)) throw new Error("Choose a professional council.");
  if (!l.license_number.trim()) throw new Error("Enter the licence number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.expiry_date)) throw new Error("Enter the expiry date.");
  if (l.issue_date && l.expiry_date <= l.issue_date) throw new Error("Expiry must be after the issue date.");
}

/** A clinician may practise only with an unexpired licence from the council their role requires. */
export function requiredLicenseStatus(role: string, licenses: { council: string; expiry_date: string }[], today: string): LicenseStatus | null {
  const council = ROLE_COUNCIL[role];
  if (!council) return null;
  const latest = licenses.filter((l) => l.council === council).map((l) => l.expiry_date).sort().at(-1);
  return licenseStatus(latest, today);
}

/** Map a free-text job title (e.g. "Medical Officer", "Staff Nurse") to the council licence it requires. */
export function requiredCouncilForPosition(position: string | null | undefined): Council | null {
  const p = (position ?? "").toLowerCase();
  if (!p) return null;
  if (/\b(doctor|physician|medical officer|dentist|surgeon|consultant)\b/.test(p)) return "KMPDC";
  if (/\b(clinical officer)\b/.test(p)) return "COC";
  if (/\b(nurse|nursing|midwife|midwifery)\b/.test(p)) return "NCK";
  if (/\b(pharmacist|pharmaceutical technologist)\b/.test(p)) return "PPB";
  if (/\b(lab|laboratory)\b/.test(p)) return "KMLTTB";
  return null;
}

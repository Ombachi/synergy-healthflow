import type { AppRole } from "@/hooks/use-auth";

/**
 * Canonical set of clinical roles — anyone directly involved in delivering
 * care at an encounter. Non-clinical roles (procurement, store_keeper,
 * hr_*, cashier-only, billing_officer, insurance_officer) are deliberately
 * excluded and must not appear in clinical route allow-lists below.
 */
export const CLINICAL_ROLES: AppRole[] = [
  "doctor",
  "nurse",
  "physio",
  "nutritionist",
  "lab_tech",
  "pharmacist",
  "radiologist",
  "receptionist",
  "admissions_officer",
];

// Sub-domain role sets for gated inpatient areas.
const THEATRE_ROLES: AppRole[] = ["doctor", "nurse"];
const ICU_ROLES: AppRole[] = ["doctor", "nurse", "physio"];
const MATERNITY_ROLES: AppRole[] = ["doctor", "nurse"];
const EMERGENCY_ROLES: AppRole[] = ["doctor", "nurse", "receptionist"];

// Roles allowed for each module route. Admin always has access.
// Empty array = admin only.

export const ROUTE_ROLES: Record<string, AppRole[]> = {
  // Front desk / patient flow
  "/reception": ["receptionist"],
  "/appointments": ["receptionist", "doctor"],
  // Queue is a clinical/front-desk board only — no pharmacist/lab_tech/cashier/billing.
  "/queue": ["receptionist", "nurse", "doctor"],

  // Patient
  "/me": ["patient"],
  // Patient self-service assessments — patient/athlete portal only.
  "/assessments": ["patient", "athlete"],

  // Clinical — reception/nursing open visits; doctors/therapists continue consultations.
  "/visits": ["receptionist", "nurse", "doctor", "physio", "nutritionist"],
  "/lab": ["lab_tech"],
  "/lab-order": ["doctor", "physio", "nurse"],
  "/pharmacy": ["pharmacist"],
  // Prescribers only — pharmacists dispense at /pharmacy, they do not prescribe.
  "/prescribe": ["doctor", "physio"],
  "/radiology": ["radiologist"],

  // Billing & insurance
  "/billing": ["cashier", "billing_officer"],
  "/insurance": ["insurance_officer", "billing_officer", "cashier"],
  "/service-catalog": [], // admin only

  // Sports & Athletes
  "/sports": ["physio", "nutritionist"],
  "/physio": ["physio"],
  "/nutrition": ["nutritionist"],

  // Inventory / store
  "/inventory": ["store_keeper"],
  "/store": ["store_keeper"],
  "/audit-inventory": ["store_keeper"],

  // Procurement
  "/procurement": ["procurement"],

  // Admin-only
  "/audit": [],
  "/users": [],
  "/department": [],
  "/lab-templates": [],
  "/admin-kpi": [],
  "/roster": [],

  // Removed from clinical-staff nav — kept for admins only.
  "/beds": ["nurse", "doctor", "receptionist", "admissions_officer"],
  "/my-inpatients": ["doctor", "nurse", "admissions_officer"],

  // ========= HAIMS (Hospital Admission & Inpatient Management) =========
  "/haims": [], // admin only
  "/admissions": ["receptionist", "nurse", "doctor", "admissions_officer"],
  "/nursing-station": ["nurse", "doctor", "admissions_officer"],
  "/ward-rounds": ["doctor", "physio", "nurse"],
  "/emar": ["nurse", "pharmacist", "doctor"],
  "/monitoring": ["nurse", "doctor", "physio"],
  "/care-plans": ["nurse", "doctor", "physio", "nutritionist"],
  "/inpatient-procedures": ["doctor", "nurse", "physio"],
  "/allied-health": ["physio", "nutritionist", "doctor"],
  "/infection-control": ["doctor", "nurse"],
  "/surgery": ["doctor", "nurse"],
  "/discharge-planning": ["doctor", "nurse", "billing_officer"],
  "/ward-analytics": ["doctor", "nurse"],
  "/preauth": ["insurance_officer", "billing_officer"],
  "/sla": [],
  "/sports-medicine": ["physio"],
  "/anti-doping": ["physio"],

  // Orders (stock requests live globally for lab/pharmacy/store)
  "/orders/stock-requests": ["lab_tech", "pharmacist", "store_keeper"],

  // HR / Employee Self-Service — moved to the staff portal.
  // Only HR admins retain in-app access; regular staff will access via staff.vitalis.health.
  "/hr/me": ["hr_officer", "hr_manager", "dept_manager"],
  "/hr/leave": ["hr_officer", "hr_manager", "dept_manager"],
  "/hr/payslips": ["hr_officer", "hr_manager", "dept_manager"],
  "/hr/documents": ["hr_officer", "hr_manager", "dept_manager"],
  "/hr/admin": ["hr_officer", "hr_manager"],

  // Workplace modules — also gated to HR admins (staff portal owns the rest).
  "/requests": ["hr_officer", "hr_manager", "dept_manager"],
  "/attendance": ["hr_officer", "hr_manager", "dept_manager"],
  "/leave-inbox": ["hr_officer", "hr_manager", "dept_manager"],
  "/announcements": ["hr_officer", "hr_manager", "dept_manager"],
  // Tenders & bids remain in the procurement dashboard.
  "/tenders": ["procurement"],

  // Clinical safety additions
  "/controlled-drugs": ["pharmacist"],

  // Finance ops
  "/cash-reconciliation": ["cashier", "billing_officer"],
  "/credit-notes": ["cashier", "billing_officer"],

  // Completed reports archive (searchable, all clinical + finance roles)
  "/completed": ["doctor", "nurse", "pharmacist", "lab_tech", "radiologist", "physio", "nutritionist", "cashier", "billing_officer", "admissions_officer"],

  // Compliance & audit (admin-only)
  "/admin/soft-deleted": [],
  "/admin/consent": [],
  "/admin/breaches": [],
  "/admin/access-reviews": [],
  "/admin/errors": [],
};





// Prefix-based rules for dynamic routes (path starts with key).
export const ROUTE_PREFIX_ROLES: Record<string, AppRole[]> = {
  "/visits/": ["receptionist", "nurse", "doctor", "physio", "nutritionist"],
  "/department/": [],
  "/orders/": ["lab_tech", "pharmacist", "store_keeper"],
  "/print/wristband/": ["receptionist", "nurse", "doctor"],
  "/print/sample/": ["lab_tech", "nurse", "doctor"],
  "/print/drug/": ["pharmacist", "store_keeper"],
  "/print/prescription/": ["doctor", "pharmacist"],
  // Sub-domain coming-soon prefixes — MUST be listed before the generic
  // "/coming-soon/" catch-all so canAccess() matches them first.
  "/coming-soon/theatre-": THEATRE_ROLES,
  "/coming-soon/surgical-": THEATRE_ROLES,
  "/coming-soon/anaesthesia-": THEATRE_ROLES,
  "/coming-soon/recovery": THEATRE_ROLES,
  "/coming-soon/icu-": ICU_ROLES,
  "/coming-soon/critical-care-": ICU_ROLES,
  "/coming-soon/ventilator-": ICU_ROLES,
  "/coming-soon/sedation": ICU_ROLES,
  "/coming-soon/maternity-": MATERNITY_ROLES,
  "/coming-soon/antenatal": MATERNITY_ROLES,
  "/coming-soon/labour-": MATERNITY_ROLES,
  "/coming-soon/postnatal": MATERNITY_ROLES,
  "/coming-soon/newborn-": MATERNITY_ROLES,
  "/coming-soon/emergency": EMERGENCY_ROLES,
  "/coming-soon/resuscitation": EMERGENCY_ROLES,
  "/coming-soon/observation-unit": EMERGENCY_ROLES,
  // Remaining stub / coming-soon service-line pages visible to every signed-in user.
  "/coming-soon/": CLINICAL_ROLES.concat(["cashier", "insurance_officer", "store_keeper", "procurement", "billing_officer", "hr_officer", "hr_manager", "dept_manager", "patient", "athlete"]),

};

// Always visible to all signed-in users.
// Queue display moved off ALWAYS_VISIBLE — surfaces on admin-only kiosk config.
export const ALWAYS_VISIBLE = new Set<string>([
  "/dashboard",
  "/messages",
]);


export function canAccess(path: string, roles: AppRole[]): boolean {
  if (ALWAYS_VISIBLE.has(path)) return true;
  if (roles.includes("admin")) return true;
  const allowed = ROUTE_ROLES[path];
  if (allowed) {
    if (allowed.length === 0) return false;
    return allowed.some((r) => roles.includes(r));
  }
  for (const [prefix, prefixRoles] of Object.entries(ROUTE_PREFIX_ROLES)) {
    if (path.startsWith(prefix)) {
      if (prefixRoles.length === 0) return false;
      return prefixRoles.some((r) => roles.includes(r));
    }
  }
  return false;
}

// Where each role should land after sign-in.
export const ROLE_HOME: Partial<Record<AppRole, string>> = {
  patient: "/me",
  receptionist: "/reception",
  nurse: "/queue",
  doctor: "/queue",
  lab_tech: "/lab",
  pharmacist: "/pharmacy",
  radiologist: "/radiology",
  cashier: "/billing",
  billing_officer: "/billing",
  insurance_officer: "/insurance",
  store_keeper: "/store",
  procurement: "/procurement",
  physio: "/physio",
  nutritionist: "/nutrition",
  athlete: "/me",
};

import type { AppRole } from "@/hooks/use-auth";

// Roles allowed for each module route. Admin always has access.
// Empty array = admin only.
export const ROUTE_ROLES: Record<string, AppRole[]> = {
  // Front desk / patient flow
  "/reception": ["receptionist"],
  "/appointments": ["receptionist", "doctor"],
  "/queue": ["receptionist", "nurse", "doctor", "lab_tech", "pharmacist", "radiologist", "cashier", "billing_officer"],

  // Patient
  "/me": ["patient"],

  // Clinical — reception/nursing open visits; doctors/therapists continue consultations.
  "/visits": ["receptionist", "nurse", "doctor", "physio", "nutritionist"],
  "/lab": ["lab_tech"],
  "/pharmacy": ["pharmacist"],
  "/radiology": ["radiologist"],

  // Billing & insurance
  "/billing": ["cashier", "billing_officer"],
  "/insurance": ["insurance_officer", "billing_officer", "cashier"],
  "/service-catalog": [], // admin only

  // Sports & athletes (no clinical staff)
  "/sports": ["coach", "physio", "nutritionist", "team_manager"],
  "/coach": ["coach"],
  "/team-manager": ["team_manager"],
  "/physio": ["physio"],
  "/nutrition": ["nutritionist"],

  // Inventory / store — central store is the source of truth
  "/inventory": ["store_keeper"],
  "/store": ["store_keeper"],
  "/audit-inventory": ["store_keeper"],

  // Procurement
  "/procurement": ["procurement"],

  // Admin-only
  "/audit": [],
  "/users": [],
  "/team": [],
  "/department": [], // admin-only analytics (and /department/$dept)
  "/lab-templates": [], // admin-only
  "/admin-kpi": [], // admin-only KPI command center
  "/roster": [], // admin-only rostering
  "/beds": ["doctor", "nurse"], // admin always allowed; doctors/nurses can use
  "/preauth": ["doctor", "insurance_officer", "billing_officer"],

  // Orders (stock requests live globally for lab/pharmacy/store)
  "/orders/stock-requests": ["lab_tech", "pharmacist", "store_keeper"],

  // HR / Employee Self-Service — visible to every signed-in user (their own data)
  "/hr/me": [
    "doctor","nurse","coach","lab_tech","pharmacist","radiologist","receptionist","cashier",
    "billing_officer","insurance_officer","physio","nutritionist","team_manager",
    "store_keeper","procurement","patient","athlete","hr_officer","hr_manager","dept_manager",
  ],
  "/hr/leave": [
    "doctor","nurse","coach","lab_tech","pharmacist","radiologist","receptionist","cashier",
    "billing_officer","insurance_officer","physio","nutritionist","team_manager",
    "store_keeper","procurement","patient","athlete","hr_officer","hr_manager","dept_manager",
  ],
  "/hr/payslips": [
    "doctor","nurse","coach","lab_tech","pharmacist","radiologist","receptionist","cashier",
    "billing_officer","insurance_officer","physio","nutritionist","team_manager",
    "store_keeper","procurement","hr_officer","hr_manager","dept_manager",
  ],
  "/hr/documents": [
    "doctor","nurse","coach","lab_tech","pharmacist","radiologist","receptionist","cashier",
    "billing_officer","insurance_officer","physio","nutritionist","team_manager",
    "store_keeper","procurement","hr_officer","hr_manager","dept_manager",
  ],
  "/hr/admin": ["hr_officer","hr_manager"],

  // New workplace modules — open to all signed-in staff
  "/requests": [
    "doctor","nurse","coach","lab_tech","pharmacist","radiologist","receptionist","cashier",
    "billing_officer","insurance_officer","physio","nutritionist","team_manager",
    "store_keeper","procurement","hr_officer","hr_manager","dept_manager",
  ],
  "/attendance": [
    "doctor","nurse","coach","lab_tech","pharmacist","radiologist","receptionist","cashier",
    "billing_officer","insurance_officer","physio","nutritionist","team_manager",
    "store_keeper","procurement","hr_officer","hr_manager","dept_manager",
  ],
  "/leave-inbox": ["hr_officer","hr_manager","dept_manager"],
  "/tenders": [
    "doctor","nurse","coach","lab_tech","pharmacist","radiologist","receptionist","cashier",
    "billing_officer","insurance_officer","physio","nutritionist","team_manager",
    "store_keeper","procurement","hr_officer","hr_manager","dept_manager","patient",
  ],
  "/announcements": [
    "doctor","nurse","coach","lab_tech","pharmacist","radiologist","receptionist","cashier",
    "billing_officer","insurance_officer","physio","nutritionist","team_manager",
    "store_keeper","procurement","hr_officer","hr_manager","dept_manager","patient","athlete",
  ],


  // Sports Medicine / ABP / Anti-Doping
  "/sports-medicine": ["doctor","physio","coach","lab_tech","nutritionist","team_manager"],
  "/anti-doping": ["doctor","physio","lab_tech"],

  // Patient self-service assessments
  "/assessments": [
    "patient","athlete","doctor","nurse","physio","nutritionist","coach",
  ],

  // Clinical safety additions
  "/controlled-drugs": ["pharmacist"],

  // Finance ops
  "/cash-reconciliation": ["cashier", "billing_officer"],
  "/credit-notes": ["cashier", "billing_officer"],

  // Compliance & audit (admin-only)
  "/admin/soft-deleted": [],
  "/admin/consent": [],
  "/admin/breaches": [],
  "/admin/access-reviews": [],
  "/admin/errors": [],
  "/sla": ["lab_tech", "radiologist", "doctor"],
};




// Prefix-based rules for dynamic routes (path starts with key).
export const ROUTE_PREFIX_ROLES: Record<string, AppRole[]> = {
  "/visits/": ["receptionist", "nurse", "doctor", "physio", "nutritionist"],
  "/department/": [], // admin only
  "/orders/": ["lab_tech", "pharmacist", "store_keeper"],
  "/print/wristband/": ["receptionist", "nurse", "doctor"],
  "/print/sample/": ["lab_tech", "nurse", "doctor"],
  "/print/drug/": ["pharmacist", "store_keeper"],
  "/print/prescription/": ["doctor", "pharmacist"],
};

// Always visible to all signed-in users.
export const ALWAYS_VISIBLE = new Set<string>([
  "/dashboard",
  "/messages",
  "/display/queue",
]);


export function canAccess(path: string, roles: AppRole[]): boolean {
  if (ALWAYS_VISIBLE.has(path)) return true;
  if (roles.includes("admin")) return true;
  const allowed = ROUTE_ROLES[path];
  if (allowed) {
    if (allowed.length === 0) return false; // explicitly admin-only
    return allowed.some((r) => roles.includes(r));
  }
  // Dynamic routes — match by prefix.
  for (const [prefix, prefixRoles] of Object.entries(ROUTE_PREFIX_ROLES)) {
    if (path.startsWith(prefix)) {
      if (prefixRoles.length === 0) return false;
      return prefixRoles.some((r) => roles.includes(r));
    }
  }
  return false; // deny by default
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
  coach: "/coach",
  physio: "/physio",
  nutritionist: "/nutrition",
  team_manager: "/team-manager",
  athlete: "/me",
};

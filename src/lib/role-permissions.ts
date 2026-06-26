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
};

// Prefix-based rules for dynamic routes (path starts with key).
export const ROUTE_PREFIX_ROLES: Record<string, AppRole[]> = {
  "/visits/": ["receptionist", "nurse", "doctor", "physio", "nutritionist"],
  "/department/": [], // admin only
  "/orders/": ["lab_tech", "pharmacist", "store_keeper"],
};

// Always visible to all signed-in users.
export const ALWAYS_VISIBLE = new Set<string>([
  "/dashboard",
  "/messages",
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

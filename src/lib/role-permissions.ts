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

  // Clinical — physio & nutritionist can also place orders/prescribe via the visit workspace
  "/visits": ["doctor", "physio", "nutritionist"],
  "/medical": ["doctor", "physio", "nutritionist"],
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
  if (!allowed) return true; // unknown routes default open
  if (allowed.length === 0) return false; // explicitly admin-only
  return allowed.some((r) => roles.includes(r));
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

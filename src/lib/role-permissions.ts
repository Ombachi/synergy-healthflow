import type { AppRole } from "@/hooks/use-auth";

// Roles allowed for each module route. Admin always has access.
export const ROUTE_ROLES: Record<string, AppRole[]> = {
  "/reception": ["receptionist"],
  "/appointments": ["receptionist", "doctor", "nurse"],
  "/queue": ["receptionist", "nurse", "doctor", "lab_tech", "pharmacist", "radiologist", "cashier"],
  "/visits": ["doctor", "nurse"],
  "/me": ["patient"],
  "/medical": ["doctor", "nurse"],
  "/lab": ["lab_tech", "doctor", "nurse"],
  "/pharmacy": ["pharmacist", "doctor", "nurse"],
  "/radiology": ["radiologist", "doctor", "nurse"],
  "/billing": ["cashier", "receptionist"],
  "/insurance": ["insurance_officer", "cashier"],
  "/service-catalog": ["cashier"],
  "/sports": ["coach", "physio", "doctor", "nutritionist", "team_manager"],
  "/coach": ["coach"],
  "/team-manager": ["team_manager"],
  "/physio": ["physio"],
  "/nutrition": ["nutritionist"],
  "/inventory": ["pharmacist", "doctor", "nurse"],
  "/store": ["pharmacist"], // storekeeper alias
  "/procurement": [],        // admin only
  "/audit-inventory": [],    // admin only
  "/audit": [],              // admin only
  "/users": [],              // admin only
  "/team": [],               // admin only
};

// Always visible to all signed-in users.
export const ALWAYS_VISIBLE = new Set<string>([
  "/dashboard",
  "/onboarding",
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

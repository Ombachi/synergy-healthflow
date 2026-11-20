import type { AppRole } from "@/hooks/use-auth";

export function isPlatformAdministrator(roles: readonly AppRole[]): boolean {
  return roles.includes("superadmin");
}

export function resolveWorkspaceRoles(globalRoles: AppRole[], memberships: { facility_id: string; role: AppRole | null }[], facilityId: string): AppRole[] {
  if (isPlatformAdministrator(globalRoles)) return ["superadmin"];
  const own = memberships.filter((m) => m.facility_id === facilityId);
  return [...new Set(own.flatMap((m) => m.role ? [m.role] : globalRoles.filter((r) => r !== "superadmin" && r !== "facility_admin")))];
}
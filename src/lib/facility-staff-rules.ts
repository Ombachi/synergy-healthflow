export const DEPARTMENT_ROLES = [
  "doctor", "nurse", "lab_tech", "pharmacist", "radiologist", "receptionist",
  "cashier", "billing_officer", "insurance_officer", "physio", "nutritionist",
  "store_keeper", "procurement", "hr_officer", "hr_manager", "dept_manager",
  "admissions_officer", "fleet_manager", "driver",
] as const;

export const PROTECTED_STAFF_ROLES = ["superadmin", "facility_admin", "admin", "patient", "athlete"];

export function canEditDepartmentRole(role: string | null): boolean {
  return !PROTECTED_STAFF_ROLES.includes(role ?? "");
}

export function roleLabel(role: string | null): string {
  return role ? role.replaceAll("_", " ") : "Unassigned";
}
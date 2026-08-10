import { useAuthContext } from "@/components/auth-provider";
import type { AuthState } from "@/hooks/use-auth-state";
export type { AuthState };



export type AppRole =
  | "admin" | "doctor" | "nurse" | "patient" | "athlete"
  | "lab_tech" | "pharmacist" | "radiologist"
  | "receptionist" | "cashier" | "insurance_officer"
  | "physio" | "nutritionist"
  | "store_keeper" | "procurement" | "billing_officer"
  | "hr_officer" | "hr_manager" | "dept_manager"
  | "admissions_officer"
  | "fleet_manager" | "driver";

export const ALL_ROLES: AppRole[] = [
  "admin", "doctor", "nurse",
  "lab_tech", "pharmacist", "radiologist",
  "receptionist", "cashier", "billing_officer", "insurance_officer",
  "physio", "nutritionist",
  "store_keeper", "procurement",
  "hr_officer", "hr_manager", "dept_manager",
  "admissions_officer",
  "fleet_manager", "driver",
  "patient", "athlete",
];



export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  onboarded: boolean;
  onboarded_as: AppRole | null;
}

/**
 * Reads the app-wide auth state resolved once by <AuthProvider /> in __root.
 */
export function useAuth(): AuthState {
  const ctx = useAuthContext();
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}



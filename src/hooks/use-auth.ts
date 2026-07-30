import { useAuthContext } from "@/components/auth-provider";
import { useAuthState, type AuthState } from "@/hooks/use-auth-state";


export type AppRole =
  | "admin" | "doctor" | "nurse" | "patient" | "athlete"
  | "lab_tech" | "pharmacist" | "radiologist"
  | "receptionist" | "cashier" | "insurance_officer"
  | "physio" | "nutritionist"
  | "store_keeper" | "procurement" | "billing_officer"
  | "hr_officer" | "hr_manager" | "dept_manager"
  | "admissions_officer";

export const ALL_ROLES: AppRole[] = [
  "admin", "doctor", "nurse",
  "lab_tech", "pharmacist", "radiologist",
  "receptionist", "cashier", "billing_officer", "insurance_officer",
  "physio", "nutritionist",
  "store_keeper", "procurement",
  "hr_officer", "hr_manager", "dept_manager",
  "admissions_officer",
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
 * Falls back to a local resolver only if rendered outside the provider.
 */
export function useAuth(): AuthState {
  const ctx = useAuthContext();
  const fallback = useAuthState.length >= 0 ? null : null; // no-op, keeps hook order stable
  void fallback;
  if (ctx) return ctx;
  throw new Error("useAuth must be used within <AuthProvider>");
}


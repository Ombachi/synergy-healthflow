import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin" | "doctor" | "coach" | "nurse" | "patient" | "athlete"
  | "lab_tech" | "pharmacist" | "radiologist"
  | "receptionist" | "cashier" | "insurance_officer"
  | "physio" | "nutritionist" | "team_manager"
  | "store_keeper" | "procurement" | "billing_officer"
  | "hr_officer" | "hr_manager" | "dept_manager";

export const ALL_ROLES: AppRole[] = [
  "admin", "doctor", "nurse", "coach",
  "lab_tech", "pharmacist", "radiologist",
  "receptionist", "cashier", "billing_officer", "insurance_officer",
  "physio", "nutritionist", "team_manager",
  "store_keeper", "procurement",
  "hr_officer", "hr_manager", "dept_manager",
  "patient", "athlete",
];


export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  onboarded: boolean;
  onboarded_as: AppRole | null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSession(s: Session | null) {
      if (!active) return;
      setSession(s);
      setUser(s?.user ?? null);
      if (!s?.user) {
        setRoles([]);
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const [roleRows, profileRow] = await Promise.all([
        fetchRoles(s.user.id),
        fetchProfile(s.user.id),
      ]);
      if (!active) return;
      setRoles(roleRows);
      setProfile(profileRow);
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      void loadSession(s);
    });

    supabase.auth.getSession().then(({ data }) => {
      void loadSession(data.session);
    });

    async function fetchRoles(userId: string) {
      const { data } = await supabase
        .from("user_roles" as never)
        .select("role")
        .eq("user_id", userId);
      return ((data as { role: AppRole }[] | null) ?? []).map((r) => r.role);
    }

    async function fetchProfile(userId: string) {
      const { data } = await supabase
        .from("profiles" as never)
        .select("id, full_name, phone, onboarded, onboarded_as")
        .eq("id", userId)
        .maybeSingle();
      return (data as unknown as Profile | null) ?? null;
    }

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));

  return { session, user, roles, profile, loading, hasRole, hasAnyRole };
}

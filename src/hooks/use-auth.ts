import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin" | "doctor" | "coach" | "nurse" | "patient" | "athlete"
  | "lab_tech" | "pharmacist" | "radiologist"
  | "receptionist" | "cashier" | "insurance_officer";

export const ALL_ROLES: AppRole[] = [
  "admin", "doctor", "nurse", "coach",
  "lab_tech", "pharmacist", "radiologist",
  "receptionist", "cashier", "insurance_officer",
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => {
          fetchRoles(s.user.id);
          fetchProfile(s.user.id);
        }, 0);
      } else {
        setRoles([]);
        setProfile(null);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        fetchRoles(data.session.user.id);
        fetchProfile(data.session.user.id);
      }
      setLoading(false);
    });

    async function fetchRoles(userId: string) {
      const { data } = await supabase
        .from("user_roles" as never)
        .select("role")
        .eq("user_id", userId);
      setRoles(((data as { role: AppRole }[] | null) ?? []).map((r) => r.role));
    }

    async function fetchProfile(userId: string) {
      const { data } = await supabase
        .from("profiles" as never)
        .select("id, full_name, phone, onboarded, onboarded_as")
        .eq("id", userId)
        .maybeSingle();
      setProfile((data as unknown as Profile | null) ?? null);
    }

    return () => sub.subscription.unsubscribe();
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));

  return { session, user, roles, profile, loading, hasRole, hasAnyRole };
}

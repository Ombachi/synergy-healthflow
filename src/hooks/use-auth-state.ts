import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/hooks/use-auth";

export interface AuthState {
  session: Session | null;
  user: User | null;
  roles: AppRole[];
  profile: Profile | null;
  loading: boolean;
  hasRole: (r: AppRole) => boolean;
  hasAnyRole: (rs: AppRole[]) => boolean;
}

/** Raw auth resolver. Use `useAuth()` in components — it reads the shared provider. */
export function useAuthState(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

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
      const [roleRows, profileRow] = await Promise.all([
        fetchRoles(s.user.id),
        fetchProfile(s.user.id),
      ]);
      if (!active) return;
      setRoles(roleRows);
      setProfile(profileRow);
      setLoading(false);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Ignore token refreshes — they must not re-trigger a loading state.
      if (event === "TOKEN_REFRESHED") return;
      void loadSession(s);
    });

    supabase.auth.getSession().then(({ data }) => {
      void loadSession(data.session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user,
    roles,
    profile,
    loading,
    hasRole: (r: AppRole) => roles.includes(r),
    hasAnyRole: (rs: AppRole[]) => rs.some((r) => roles.includes(r)),
  };
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FALLBACK_FACILITIES, loadActiveFacilityId, loadFacilities, saveActiveFacilityId,
  modulesForTier, type Facility, type ModuleKey, type Tier,
} from "@/lib/facilities";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/use-auth";
import { ALL_ROLES } from "@/hooks/use-auth";
import { setPdfFacility } from "@/lib/pdf-brand";
import { useAuthContext } from "@/components/auth-provider";

interface FacilityState {
  loading: boolean;
  error: string | null;
  roles: AppRole[];
  refresh: () => void;
  activeFacility: Facility;
  availableFacilities: Facility[];
  allFacilities: Facility[];
  setActiveFacility: (id: string) => void;
  isMultiFacilityAdmin: boolean;
  enabledModules: Record<ModuleKey, boolean>;
}

const Ctx = createContext<FacilityState | null>(null);

export function FacilityProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const auth = useAuthContext();
  const isAdmin = !!auth?.roles.includes("admin");
  const [all, setAll] = useState<Facility[]>(FALLBACK_FACILITIES);
  const [activeId, setActiveId] = useState<string>(FALLBACK_FACILITIES[0]?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<{ facility_id: string; role: AppRole | null; is_primary: boolean }[]>([]);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    const stored = loadActiveFacilityId();
    if (stored) setActiveId(stored);
  }, []);

  // Prefer the branches saved in the database once signed in.
  useEffect(() => {
    if (auth?.loading) { setLoading(true); return; }
    const userId = auth?.user?.id;
    if (!userId) { setAll([]); setMemberships([]); setError(null); setLoading(false); return; }
    if (auth.roles.length > 0 && auth.roles.every((r) => r === "patient" || r === "athlete")) {
      setAll([]); setMemberships([]); setError(null); setLoading(false); return;
    }
    setLoading(true); setError(null);
    let cancelled = false;
    (async () => {
      const [facResult, modResult, memberResult] = await Promise.all([
        supabase.from("facilities").select("*").order("created_at"),
        supabase.from("facility_modules").select("facility_id, module, enabled"),
        supabase.from("user_facilities").select("facility_id, role, is_primary").eq("user_id", userId),
      ]);
      if (cancelled) return;
      if (facResult.error || modResult.error || memberResult.error) throw new Error("Unable to load your facilities. Please try again when the database is available.");
      const facs = facResult.data ?? [];
      const mods = modResult.data ?? [];
      const memberRows = memberResult.data ?? [];
      setMemberships(memberRows.map((m) => ({ ...m, role: ALL_ROLES.find((r) => r === m.role) ?? null })));
      if (!facs.length) throw new Error("No facilities are assigned to your account.");
      const local = loadFacilities();
      const mapped: Facility[] = facs.map((f) => {
        const s = (f.settings ?? {}) as Record<string, unknown>;
        const tier = (["starter", "pro", "enterprise"].includes(f.tier) ? f.tier : "starter") as Tier;
        const modules = modulesForTier(tier);
        const own = (mods ?? []).filter((m) => m.facility_id === f.id);
        if (own.length) {
          (Object.keys(modules) as ModuleKey[]).forEach((k) => { modules[k] = false; });
          own.forEach((m) => { if (m.module in modules) modules[m.module as ModuleKey] = m.enabled; });
        }
        const fallback = local.find((l) => l.code === f.code);
        return {
          ...(fallback ?? FALLBACK_FACILITIES[0]),
          id: f.id, name: f.name, code: f.code,
          facility_type: (f.facility_type as Facility["facility_type"]) ?? "hospital",
          tier, address: f.address ?? fallback?.address ?? "", phone: f.phone ?? fallback?.phone ?? "",
          email: f.email ?? fallback?.email ?? "", is_active: f.is_active, modules,
          tax_pin: (s.tax_pin as string) ?? fallback?.tax_pin,
          currency: (s.currency as string) ?? fallback?.currency ?? "KES",
          website: (s.website as string) ?? "", tagline: (s.tagline as string) ?? "",
          billing_model: (s.billing_model === "per_provider" ? "per_provider" : "flat_fee"),
          seats: Number(s.seats ?? 0),
        };
      });
      const allowed = isAdmin ? mapped : mapped.filter((f) => f.is_active && memberRows.some((m) => m.facility_id === f.id));
      if (!allowed.length) throw new Error("No active facilities are assigned to your account.");
      setAll(mapped);
      const primary = memberRows.find((m) => m.is_primary)?.facility_id;
      setActiveId((cur) => allowed.some((m) => m.id === cur) ? cur : allowed.find((f) => f.id === primary)?.id ?? allowed[0]?.id ?? "");
      setLoading(false);
    })().catch(() => { if (!cancelled) { setAll([]); setError("Unable to load an authorized facility. Check the database connection and staff assignments, then refresh."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [auth?.user?.id, auth?.loading, auth?.roles, isAdmin, revision]);

  // Only database-authorized branches can be selected.
  const available = useMemo(() => (isAdmin ? all : all.filter((f) => f.is_active && memberships.some((m) => m.facility_id === f.id))), [all, isAdmin, memberships]);
  const activeFacility = available.find((f) => f.id === activeId) ?? available[0] ?? FALLBACK_FACILITIES[0];

  useEffect(() => { setPdfFacility(activeFacility); }, [activeFacility]);

  const setActiveFacility = useCallback((id: string) => {
    if (!available.some((f) => f.id === id)) return;
    void qc.cancelQueries();
    setActiveId(id);
    saveActiveFacilityId(id);
    void qc.invalidateQueries();
  }, [qc, available]);

  const value: FacilityState = {
    loading, error, refresh,
    roles: isAdmin ? (auth?.roles ?? []) : memberships.find((m) => m.facility_id === activeFacility.id)?.role ? memberships.filter((m) => m.facility_id === activeFacility.id).flatMap((m) => m.role ? [m.role] : []) : (auth?.roles ?? []),
    activeFacility,
    availableFacilities: available,
    allFacilities: all,
    setActiveFacility,
    isMultiFacilityAdmin: isAdmin || available.length > 1,
    enabledModules: activeFacility.modules,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFacility(): FacilityState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useFacility must be used within <FacilityProvider>");
  return c;
}

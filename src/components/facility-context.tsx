import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FACILITIES_EVENT, FALLBACK_FACILITIES, loadActiveFacilityId, loadFacilities, saveActiveFacilityId,
  modulesForTier, type Facility, type ModuleKey, type Tier,
} from "@/lib/facilities";
import { supabase } from "@/integrations/supabase/client";
import { setPdfFacility } from "@/lib/pdf-brand";
import { useAuthContext } from "@/components/auth-provider";

interface FacilityState {
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
  const [activeId, setActiveId] = useState<string>(FALLBACK_FACILITIES[0]!.id);

  useEffect(() => {
    const sync = () => setAll(loadFacilities());
    sync();
    const stored = loadActiveFacilityId();
    if (stored) setActiveId(stored);
    window.addEventListener(FACILITIES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(FACILITIES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Prefer the branches saved in the database once signed in.
  useEffect(() => {
    if (!auth?.user) return;
    let cancelled = false;
    (async () => {
      const [{ data: facs }, { data: mods }] = await Promise.all([
        supabase.from("facilities").select("*").order("created_at"),
        supabase.from("facility_modules").select("facility_id, module, enabled"),
      ]);
      if (cancelled || !facs || facs.length === 0) return;
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
          ...(fallback ?? FALLBACK_FACILITIES[0]!),
          id: f.id, name: f.name, code: f.code,
          facility_type: (f.facility_type as Facility["facility_type"]) ?? "hospital",
          tier, address: f.address ?? fallback?.address ?? "", phone: f.phone ?? fallback?.phone ?? "",
          email: f.email ?? fallback?.email ?? "", is_active: f.is_active, modules,
          tax_pin: (s.tax_pin as string) ?? fallback?.tax_pin,
          currency: (s.currency as string) ?? fallback?.currency ?? "KES",
        };
      });
      setAll(mapped);
      setActiveId((cur) => (mapped.some((m) => m.id === cur) ? cur : mapped[0]!.id));
    })();
    return () => { cancelled = true; };
  }, [auth?.user]);

  // Admins can see every branch; staff only active ones. Until the
  // user_facilities table exists, staff get all active branches.
  const available = useMemo(() => (isAdmin ? all : all.filter((f) => f.is_active)), [all, isAdmin]);
  const activeFacility = available.find((f) => f.id === activeId) ?? available[0] ?? FALLBACK_FACILITIES[0]!;

  useEffect(() => { setPdfFacility(activeFacility); }, [activeFacility]);

  const setActiveFacility = useCallback((id: string) => {
    setActiveId(id);
    saveActiveFacilityId(id);
    void qc.invalidateQueries();
  }, [qc]);

  const value: FacilityState = {
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

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  FACILITIES_EVENT, FALLBACK_FACILITIES, loadActiveFacilityId, loadFacilities, saveActiveFacilityId,
  type Facility, type ModuleKey,
} from "@/lib/facilities";
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

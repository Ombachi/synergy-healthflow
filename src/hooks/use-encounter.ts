import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Encounter-type map: given a set of visit_ids, tells you which are inpatient
 * (linked to an active admission) vs outpatient. Backed by the existing
 * `admissions.visit_id` column — no schema change required.
 *
 * Used to power Outpatient | Inpatient | All tabs on Lab, Pharmacy, Radiology,
 * and Nurse queues before the encounter_id/encounter_type migration lands.
 */
export type EncounterType = "outpatient" | "inpatient";

export function useEncounterMap() {
  return useQuery({
    queryKey: ["encounter-map"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admissions" as never)
        .select("visit_id, discharged_at")
        .is("discharged_at", null);
      if (error) throw error;
      const inpatient = new Set<string>();
      ((data as unknown as { visit_id: string | null }[]) ?? []).forEach((row) => {
        if (row.visit_id) inpatient.add(row.visit_id);
      });
      return {
        inpatientVisitIds: inpatient,
        typeOf(visitId: string | null | undefined): EncounterType {
          return visitId && inpatient.has(visitId) ? "inpatient" : "outpatient";
        },
      };
    },
  });
}

export type EncounterFilter = "all" | EncounterType;

/**
 * UI helper: renders a small tri-tab filter with counts.
 * Kept dumb — parent owns the state.
 */
export function encounterCounts<T extends { visit_id: string | null }>(
  rows: T[],
  inpatientVisitIds: Set<string> | undefined,
) {
  const inp = rows.filter((r) => r.visit_id && inpatientVisitIds?.has(r.visit_id)).length;
  return { all: rows.length, inpatient: inp, outpatient: rows.length - inp };
}

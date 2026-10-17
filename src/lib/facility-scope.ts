import { supabase } from "@/integrations/supabase/client";

export function requireFacilityId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Select a saved facility before loading records.");
  }
  return id;
}

/** Encounter ownership wins; patient ownership is used only for encounter-less orders. */
export function operationalScope(table: string, facilityId: string, columns = "*") {
  return supabase.from(table as never).select(columns)
    .eq("facility_id", requireFacilityId(facilityId));
}
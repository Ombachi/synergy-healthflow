import { supabase } from "@/integrations/supabase/client";

export function requireFacilityId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Select a saved facility before loading records.");
  }
  return id;
}

/** Encounter ownership wins; patient ownership is used only for encounter-less orders. */
export function operationalScope(table: string, facilityId: string, columns = "*") {
  const id = requireFacilityId(facilityId);
  if (table === "prescriptions") {
    return supabase.from(table as never).select(`${columns},visits!inner(facility_id)`)
      .eq("visits.facility_id", id);
  }
  if (["lab_orders", "imaging_orders", "invoices", "admissions"].includes(table)) {
    return supabase.from(table as never).select(`${columns},visits(facility_id),patients(facility_id)`)
      .eq("visits.facility_id", id).eq("patients.facility_id", id)
      .or("visits.not.is.null,and(visit_id.is.null,patients.not.is.null)");
  }
  if (["admission_requests", "refill_requests"].includes(table)) {
    return supabase.from(table as never).select(`${columns},patients!inner(facility_id)`)
      .eq("patients.facility_id", id);
  }
  return supabase.from(table as never).select(columns).eq("facility_id", id);
}
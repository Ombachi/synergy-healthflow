import { supabase } from "@/integrations/supabase/client";
import { requireFacilityId, encounterFacilityFilter } from "@/lib/facility-filter";
export { requireFacilityId } from "@/lib/facility-filter";

/** Encounter ownership wins; patient ownership is used only for encounter-less orders. */
export function operationalScope(table: string, facilityId: string, columns = "*") {
  const id = requireFacilityId(facilityId);
  if (table === "prescriptions") {
    return supabase.from(table as never).select(`${columns},visits!inner(facility_id)`)
      .eq("visits.facility_id", id);
  }
  if (["lab_orders", "imaging_orders", "invoices", "admissions"].includes(table)) {
    return supabase.from(table as never).select(`${columns},scope_visit:visits(facility_id),scope_patient:patients(facility_id)`)
      .eq("scope_visit.facility_id", id).eq("scope_patient.facility_id", id)
      .or(encounterFacilityFilter());
  }
  if (["admission_requests", "refill_requests"].includes(table)) {
    return supabase.from(table as never).select(`${columns},patients!inner(facility_id)`)
      .eq("patients.facility_id", id);
  }
  return supabase.from(table as never).select(columns).eq("facility_id", id);
}
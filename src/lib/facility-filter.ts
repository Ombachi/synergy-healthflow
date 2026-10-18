export function requireFacilityId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Select a saved facility before loading records.");
  }
  return id;
}

/** Filter embedded matches without requiring a transferred patient's home branch to match. */
export function encounterFacilityFilter(): string {
  return "and(visit_id.not.is.null,scope_visit.not.is.null),and(visit_id.is.null,scope_patient.not.is.null)";
}
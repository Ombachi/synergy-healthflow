import { requireFacilityId } from "./facility-filter";

// All HR queries use direct record ownership, not the creator's current branch.
export function hrFacilityScope(facilityId: string, userId: string, manager: boolean) {
  const id = requireFacilityId(facilityId);
  if (!userId) throw new Error("Sign in before opening staff records.");
  return { facilityId: id, ownerId: manager ? null : userId, publishedOnly: !manager };
}

export function requireBranchRecord(id: string, records: readonly { id: string }[]) {
  if (!id || !records.some(record => record.id === id)) {
    throw new Error("Choose a record from the selected facility.");
  }
  return id;
}
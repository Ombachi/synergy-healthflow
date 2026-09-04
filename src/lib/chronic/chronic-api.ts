// Data access for the chronic care module.
// Every read degrades gracefully: until the chronic-care migration has been
// applied the tables do not exist, so we surface an empty list plus a
// `schemaMissing` flag instead of throwing and blanking the dashboard.
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_REFILL_POLICY,
  type ChronicMedication,
  type RefillPolicy,
  type FulfillmentStatus,
  type RefillDecision,
} from "./refill-engine";

export interface RefillRequestRow {
  id: string;
  medication_id: string;
  patient_id: string;
  encounter_id: string | null;
  medication: string;
  dose: string | null;
  frequency: string | null;
  quantity: number | null;
  status: FulfillmentStatus;
  decision: RefillDecision | null;
  reason: string | null;
  requested_on: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  dispensed_by: string | null;
  dispensed_at: string | null;
  inventory_item_id: string | null;
  dispensed_quantity: number | null;
  notes: string | null;
}

export interface ChronicResult<T> {
  rows: T[];
  schemaMissing: boolean;
}

const MISSING = /(does not exist|schema cache|relation .* does not exist)/i;

function handle<T>(data: unknown, error: { message: string } | null): ChronicResult<T> {
  if (error) {
    if (MISSING.test(error.message)) return { rows: [], schemaMissing: true };
    throw new Error(error.message);
  }
  return { rows: (data as T[]) ?? [], schemaMissing: false };
}

export async function fetchChronicMedications(patientId?: string): Promise<ChronicResult<ChronicMedication>> {
  let q = supabase.from("chronic_medications" as never).select("*").order("start_date", { ascending: false });
  if (patientId) q = q.eq("patient_id", patientId);
  const { data, error } = await q;
  return handle<ChronicMedication>(data, error);
}

export async function fetchRefillRequests(patientId?: string): Promise<ChronicResult<RefillRequestRow>> {
  let q = supabase.from("refill_requests" as never).select("*").order("requested_on", { ascending: false });
  if (patientId) q = q.eq("patient_id", patientId);
  const { data, error } = await q;
  return handle<RefillRequestRow>(data, error);
}

export async function fetchRefillPolicy(): Promise<RefillPolicy> {
  const { data, error } = await supabase
    .from("refill_policies" as never)
    .select("*")
    .eq("scope", "default")
    .maybeSingle();
  if (error || !data) return DEFAULT_REFILL_POLICY;
  const row = data as unknown as Partial<RefillPolicy>;
  return { ...DEFAULT_REFILL_POLICY, ...row };
}

/** Raise a fulfillment request. The unique partial index prevents duplicates. */
export async function createRefillRequest(draft: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("refill_requests" as never).insert(draft as never);
  if (error) {
    if (/duplicate key/i.test(error.message)) throw new Error("An open refill request already exists for this medication");
    throw new Error(error.message);
  }
}

export async function updateRefillRequest(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("refill_requests" as never).update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
}

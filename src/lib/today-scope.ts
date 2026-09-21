// Shared "served today" scoping helpers.
//
// Worklists across the app must NOT ship the full historical dataset to the
// browser. By default every directory/archive view loads only records tied to
// an encounter on the current calendar date; anything older is reachable only
// through an explicit search.
import { supabase } from "@/integrations/supabase/client";

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfTodayISO(): string {
  return startOfToday().toISOString();
}

export function isToday(value?: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const t = startOfToday();
  return d >= t;
}

/** A search term only takes effect from 2 characters. */
export function isSearching(term: string): boolean {
  return term.trim().length >= 2;
}

export interface TodayVisit {
  id: string;
  patient_id: string;
  status: string | null;
  current_stage: string | null;
  opened_at: string;
}

/** Visits (encounters) opened today, active or completed. */
export async function fetchTodayVisits(): Promise<TodayVisit[]> {
  const { data, error } = await supabase
    .from("visits" as never)
    .select("id, patient_id, status, current_stage, opened_at")
    .gte("opened_at", startOfTodayISO())
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return ((data as unknown as TodayVisit[]) ?? []).filter(
    (v) => !v.status || ["active", "open", "completed", "closed"].includes(v.status),
  );
}

export async function fetchTodayPatientIds(): Promise<string[]> {
  const visits = await fetchTodayVisits();
  return Array.from(new Set(visits.map((v) => v.patient_id).filter(Boolean)));
}

export const TODAY_EMPTY_MESSAGE =
  "No patients served today. Use the search bar to locate records.";

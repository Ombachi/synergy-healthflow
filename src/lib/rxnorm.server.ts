import { parseRxNavDrugs, type RxConcept } from "./rxnorm-parse";

export async function fetchRxNavDrugs(query: string): Promise<RxConcept[]> {
  const res = await fetch(`https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`RxNav ${res.status}`);
  return parseRxNavDrugs(await res.json());
}

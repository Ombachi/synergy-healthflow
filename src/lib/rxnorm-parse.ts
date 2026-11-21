export interface RxConcept { rxcui: string; name: string; tty: string | null; synonym: string | null; strength: string | null; dose_form: string | null }

const FORM_RE = /\b(Oral Tablet|Oral Capsule|Extended Release Oral Tablet|Delayed Release Oral Tablet|Oral Solution|Oral Suspension|Injectable Solution|Injection|Topical Cream|Topical Ointment|Ophthalmic Solution|Rectal Suppository|Inhalation Powder|Metered Dose Inhaler|Chewable Tablet|Tablet|Capsule|Syrup|Suspension|Solution|Cream|Ointment|Patch|Spray)\b.*$/i;
const STRENGTH_RE = /(\d+(?:\.\d+)?\s*(?:MG|MCG|G|ML|UNT|%|MEQ)(?:\/(?:\d+(?:\.\d+)?\s*)?(?:ML|MG|HR|ACTUAT))?)/gi;

/** Parse RxNav drugs.json; keeps clinical/branded drugs (SCD/SBD/GPCK/BPCK). */
export function parseRxNavDrugs(json: unknown): RxConcept[] {
  const groups = (json as { drugGroup?: { conceptGroup?: { tty?: string; conceptProperties?: { rxcui: string; name: string; synonym?: string; tty?: string }[] }[] } })?.drugGroup?.conceptGroup ?? [];
  const out: RxConcept[] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    if (!g.tty || !["SCD", "SBD", "GPCK", "BPCK"].includes(g.tty)) continue;
    for (const c of g.conceptProperties ?? []) {
      if (!c.rxcui || !c.name || seen.has(c.rxcui)) continue;
      seen.add(c.rxcui);
      const strengths = c.name.match(STRENGTH_RE);
      const form = c.name.match(FORM_RE);
      out.push({ rxcui: c.rxcui, name: c.name, tty: c.tty ?? g.tty, synonym: c.synonym || null,
        strength: strengths ? strengths.join(" / ") : null, dose_form: form ? form[1]! : null });
    }
  }
  return out.sort((a, b) => (a.tty === "SCD" ? 0 : 1) - (b.tty === "SCD" ? 0 : 1) || a.name.localeCompare(b.name));
}

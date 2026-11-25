// Browser-safe: turns rows from public.drug_interactions into CDS cards.
import { OVERRIDE_REASONS, type CdsCard } from "./cds-hooks-runner";

export interface DbInteractionRow {
  drug_a: string; drug_b: string; severity: string | null;
  mechanism?: string | null; description?: string | null; management?: string | null;
}

export type InteractionLevel = "contraindicated" | "major" | "moderate" | "minor";

export function normalizeSeverity(s: string | null | undefined): InteractionLevel {
  const v = (s ?? "").toLowerCase();
  if (v.startsWith("contra")) return "contraindicated";
  if (v.startsWith("maj") || v === "severe" || v === "high") return "major";
  if (v.startsWith("mod") || v === "medium") return "moderate";
  return "minor";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim();
const mentions = (med: string, drug: string) => {
  const d = norm(drug);
  return d.length > 2 && norm(med).split(/\s+/).join(" ").includes(d);
};

/** Contraindicated & major → critical (needs signed override); moderate → warning; minor ignored. */
export function interactionCards(draft: string, activeMeds: string[], rows: DbInteractionRow[]): CdsCard[] {
  const cards: CdsCard[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const level = normalizeSeverity(r.severity);
    if (level === "minor") continue;
    for (const [mine, other] of [[r.drug_a, r.drug_b], [r.drug_b, r.drug_a]] as const) {
      if (!mentions(draft, mine)) continue;
      const hit = activeMeds.find((m) => mentions(m, other));
      if (!hit) continue;
      const id = `db-ddi:${[mine, other].map(norm).sort().join("+")}`;
      if (seen.has(id)) continue;
      seen.add(id);
      cards.push({
        uuid: id, alertType: "interaction",
        indicator: level === "moderate" ? "warning" : "critical",
        summary: `${level.toUpperCase()}: ${mine} + ${other} (active: ${hit})`,
        detail: r.description || r.mechanism || "Clinically significant drug–drug interaction.",
        source: { label: "Facility interaction library" },
        suggestions: [], overrideReasons: OVERRIDE_REASONS,
        monograph: {
          mechanism: r.mechanism || r.description || "—",
          consequence: r.description || "—",
          action: r.management || (level === "moderate" ? "Monitor closely or adjust dose." : "Avoid combination unless benefit outweighs risk."),
          evidence: "B", severity: level === "moderate" ? "warning" : "critical", drugs: [mine, other],
        },
      });
    }
  }
  return cards;
}

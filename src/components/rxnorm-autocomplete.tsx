import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { searchRxNorm } from "@/lib/rxnorm.functions";
import type { RxConcept } from "@/lib/rxnorm-parse";

export function RxNormAutocomplete({ onPick }: { onPick: (c: RxConcept) => void }) {
  const search = useServerFn(searchRxNorm);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<RxConcept[]>([]);
  const [state, setState] = useState<{ loading: boolean; source?: string; error?: string | null }>({ loading: false });
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      setState({ loading: true });
      try {
        const r = await search({ data: { query: q.trim() } });
        if (live) { setRows(r.results); setState({ loading: false, source: r.source, error: r.error }); }
      } catch { if (live) setState({ loading: false, error: "Drug search failed" }); }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [q, search]);
  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search RxNorm clinical drugs (e.g. amoxicillin 500)…" />
      <div className="text-[11px] text-muted-foreground">
        {state.loading ? "Searching…" : state.error ? <span className="text-destructive">{state.error}</span>
          : state.source ? `${rows.length} results · ${state.source === "rxnav" ? "NLM RxNav" : "offline cache"}` : "Standardised drugs with RxCUI, strength and form"}
      </div>
      <ul className="max-h-80 divide-y overflow-auto rounded border">
        {rows.map((c) => (
          <li key={c.rxcui}>
            <button type="button" onClick={() => onPick(c)} className="w-full px-3 py-2 text-left text-sm hover:bg-muted">
              <div className="font-medium">{c.synonym ?? c.name}</div>
              <div className="text-[11px] text-muted-foreground">RxCUI {c.rxcui} · {c.strength ?? "—"} · {c.dose_form ?? c.tty}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

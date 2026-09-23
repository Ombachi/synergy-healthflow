import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchIcd11Codes } from "@/lib/icd11.functions";

interface IcdRow { code: string; title: string; chapter: string | null }

export function IcdPicker({ value, onPick }: { value: string; onPick: (row: IcdRow) => void }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const search = useServerFn(searchIcd11Codes);

  const results = useQuery({
    queryKey: ["icd11", q],
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => await search({ data: { query: q, limit: 15 } }),
  });

  const rows = results.data?.results ?? [];
  const err = results.data?.error ?? (results.isError ? "ICD-11 lookup failed" : null);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-7"
          placeholder="Search ICD-11 (WHO)..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && q.length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {results.isFetching && <div className="p-2 text-xs text-muted-foreground">Searching WHO ICD-11…</div>}
          {!results.isFetching && err && <div className="p-2 text-xs text-destructive">{err}</div>}
          {!results.isFetching && !err && rows.length === 0 && (
            <div className="p-2 text-xs text-muted-foreground">No match. Type a custom code.</div>
          )}
          {rows.map((r) => (
            <button
              key={`${r.code}-${r.title}`}
              type="button"
              className="block w-full px-2 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={() => {
                onPick({ code: r.code, title: r.title, chapter: r.chapter });
                setQ(`${r.code} ${r.title}`);
                setOpen(false);
              }}
            >
              <span className="font-mono text-xs text-primary">{r.code || "—"}</span>
              <span className="ml-2">{r.title}</span>
              {r.chapter && <span className="ml-2 text-xs text-muted-foreground">· {r.chapter}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Search, X, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface CatalogItem {
  id: string;
  primary: string;      // main name
  secondary?: string;   // code / class / pack
  tag?: string;         // category
}

interface Props<T extends CatalogItem> {
  items: T[];
  loading?: boolean;
  storageKey: string;                 // localStorage key for recents
  onPick: (item: T) => void;
  renderAction?: (item: T) => React.ReactNode;
  emptyLabel?: string;
  placeholder?: string;
}

/**
 * Reusable searchable catalog list with tag chips + recent items (localStorage).
 * Hydration-safe: recents load in useEffect.
 */
export function CatalogSearch<T extends CatalogItem>({
  items, loading, storageKey, onPick, renderAction, emptyLabel = "No results", placeholder = "Search…",
}: Props<T>) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setRecentIds(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [storageKey]);

  const tags = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.tag) s.add(it.tag);
    return Array.from(s).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (tag && it.tag !== tag) return false;
      if (!needle) return true;
      return it.primary.toLowerCase().includes(needle)
        || (it.secondary?.toLowerCase().includes(needle) ?? false);
    }).slice(0, 300);
  }, [items, q, tag]);

  const recents = useMemo(() => {
    const map = new Map(items.map((i) => [i.id, i]));
    return recentIds.map((id) => map.get(id)).filter(Boolean) as T[];
  }, [items, recentIds]);

  function handlePick(it: T) {
    const next = [it.id, ...recentIds.filter((id) => id !== it.id)].slice(0, 8);
    setRecentIds(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
    onPick(it);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8 pr-8" />
        {q && (
          <button onClick={() => setQ("")} aria-label="Clear search"
            className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-muted">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTag(null)}
            className={`rounded-full px-2.5 py-0.5 text-xs transition ${
              tag === null ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
            }`}
          >All</button>
          {tags.map((t) => (
            <button key={t} onClick={() => setTag(t === tag ? null : t)}
              className={`rounded-full px-2.5 py-0.5 text-xs capitalize transition ${
                t === tag ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
              }`}
            >{t.replace(/[_/]/g, " ")}</button>
          ))}
        </div>
      )}

      {recents.length > 0 && !q && !tag && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-[11px] uppercase text-muted-foreground">
            <Clock className="h-3 w-3" /> Recent
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recents.map((r) => (
              <button key={r.id} onClick={() => handlePick(r)}
                className="rounded border bg-card px-2 py-1 text-xs hover:bg-accent">
                {r.primary}{r.secondary ? ` · ${r.secondary}` : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-[240px] overflow-auto rounded-md border bg-card">
        {loading && <div className="p-4 text-xs text-muted-foreground">Loading…</div>}
        {!loading && filtered.length === 0 && <div className="p-4 text-xs text-muted-foreground">{emptyLabel}</div>}
        <div className="divide-y">
          {filtered.map((it) => (
            <div key={it.id} className="flex items-center gap-3 p-2.5 text-sm hover:bg-accent/40">
              <button className="flex-1 text-left" onClick={() => handlePick(it)}>
                <div className="font-medium">{it.primary}</div>
                {it.secondary && <div className="text-xs text-muted-foreground">{it.secondary}</div>}
              </button>
              {it.tag && (
                <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground sm:inline">
                  {it.tag.replace(/[_/]/g, " ")}
                </span>
              )}
              {renderAction?.(it)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

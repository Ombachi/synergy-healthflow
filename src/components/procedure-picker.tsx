import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

interface Service { id: string; name: string; code: string | null; category: string | null }

/**
 * Search-select picker for procedures/services from the service catalog.
 * Filters to doctor-orderable categories (procedure, doctor, physio, nutrition).
 */
export function ProcedurePickerInline({
  value, onChange,
}: { value: string; onChange: (name: string) => void }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);

  const services = useQuery({
    queryKey: ["procedure-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_catalog" as never)
        .select("id, name, code, category")
        .in("category", ["procedure", "doctor", "physio", "nutrition"] as never)
        .eq("active", true).order("name").limit(500);
      if (error) throw error;
      return (data as unknown as Service[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = services.data ?? [];
    if (!needle) return list.slice(0, 30);
    return list.filter((s) =>
      s.name.toLowerCase().includes(needle) || (s.code ?? "").toLowerCase().includes(needle),
    ).slice(0, 30);
  }, [services.data, q]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search procedure (e.g. wound dressing, nebulisation, ECG)…"
          value={q}
          onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); setQ(s.name); onChange(s.name); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <div>
                <div className="font-medium">{s.name}</div>
                {s.code && <div className="text-[11px] text-muted-foreground">{s.code}</div>}
              </div>
              {s.category && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                  {s.category}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

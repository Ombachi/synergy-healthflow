import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface IcdRow { code: string; title: string; chapter: string | null }

export function IcdPicker({ value, onPick }: { value: string; onPick: (row: IcdRow) => void }) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);

  const results = useQuery({
    queryKey: ["icd", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("icd11_codes" as never)
        .select("code, title, chapter")
        .or(`code.ilike.%${q}%,title.ilike.%${q}%`)
        .limit(15);
      if (error) throw error;
      return (data as unknown as IcdRow[]) ?? [];
    },
  });

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-7"
          placeholder="Search ICD-11..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && q.length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {results.isLoading && <div className="p-2 text-xs text-muted-foreground">Searching…</div>}
          {results.data?.length === 0 && <div className="p-2 text-xs text-muted-foreground">No match. Type a custom code.</div>}
          {results.data?.map((r) => (
            <button
              key={r.code}
              type="button"
              className="block w-full px-2 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={() => { onPick(r); setQ(`${r.code} ${r.title}`); setOpen(false); }}
            >
              <span className="font-mono text-xs text-primary">{r.code}</span>
              <span className="ml-2">{r.title}</span>
              {r.chapter && <span className="ml-2 text-xs text-muted-foreground">· {r.chapter}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

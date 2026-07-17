import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

interface Drug {
  id: string;
  drug_name: string;
  medication_class: string | null;
  default_dose: string | null;
  default_frequency: string | null;
  default_duration: string | null;
  instructions: string | null;
}

/**
 * Inline searchable drug picker — pattern-matches ProcedurePickerInline.
 * When a drug is chosen, calls onPick with the full row so the caller can
 * pre-fill dose/frequency/duration/instructions.
 */
export function DrugPickerInline({
  onPick,
  placeholder = "Search medication (e.g. amoxicillin, paracetamol)…",
}: {
  onPick: (drug: Drug) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const drugs = useQuery({
    queryKey: ["drug-catalog-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drug_catalog" as never)
        .select("id, drug_name, medication_class, default_dose, default_frequency, default_duration, instructions")
        .eq("active", true)
        .order("drug_name")
        .limit(2000);
      if (error) throw error;
      return (data as unknown as Drug[]) ?? [];
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = drugs.data ?? [];
    if (!needle) return list.slice(0, 30);
    return list
      .filter(
        (d) =>
          d.drug_name.toLowerCase().includes(needle) ||
          (d.medication_class ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 30);
  }, [drugs.data, q]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={placeholder}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-lg">
          {filtered.map((d) => (
            <button
              key={d.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(d);
                setQ("");
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <div className="min-w-0">
                <div className="truncate font-medium">{d.drug_name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {[d.medication_class, d.default_dose, d.default_frequency].filter(Boolean).join(" · ") || "medication"}
                </div>
              </div>
              {d.medication_class && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                  {d.medication_class}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

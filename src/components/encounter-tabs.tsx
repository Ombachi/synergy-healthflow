import type { EncounterFilter } from "@/hooks/use-encounter";

export function EncounterTabs({
  value,
  onChange,
  counts,
}: {
  value: EncounterFilter;
  onChange: (v: EncounterFilter) => void;
  counts: { all: number; outpatient: number; inpatient: number };
}) {
  const tabs: { key: EncounterFilter; label: string; count: number }[] = [
    { key: "outpatient", label: "Outpatient", count: counts.outpatient },
    { key: "inpatient", label: "Inpatient", count: counts.inpatient },
    { key: "all", label: "All", count: counts.all },
  ];
  return (
    <div className="flex items-center gap-1 rounded-md border bg-muted/40 p-0.5 text-xs">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`flex-1 rounded px-2 py-1 transition ${
              active ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {t.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Heart, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function useCount(table: string) {
  return useQuery({
    queryKey: ["count", table],
    queryFn: async () => {
      const { count, error } = await supabase
        .from(table as never)
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
}

function Dashboard() {
  const patients = useCount("patients");
  const athletes = useCount("athletes");
  const inventory = useCount("inventory_items");

  const cards = [
    { title: "Patients", icon: Heart, value: patients.data ?? "—", color: "text-rose-500" },
    { title: "Athletes", icon: Activity, value: athletes.data ?? "—", color: "text-emerald-500" },
    { title: "Inventory items", icon: Package, value: inventory.data ?? "—", color: "text-amber-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">Quick view across all modules.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{c.title}</div>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div className="mt-2 text-3xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

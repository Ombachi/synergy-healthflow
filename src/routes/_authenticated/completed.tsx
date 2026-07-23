import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, Search, FlaskConical, Pill, ScanLine, HeartPulse, Receipt } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/completed")({
  head: () => ({
    meta: [
      { title: "Completed reports — Litu Vault" },
      { name: "description", content: "Fulfilled lab, pharmacy, radiology, nursing and billing records with search." },
    ],
  }),
  component: CompletedReports,
});

interface Row {
  id: string;
  when: string;
  who: string | null;
  primary: string;
  secondary: string | null;
}

function useCompleted<T>(key: string, load: () => Promise<T[]>) {
  return useQuery({ queryKey: [`completed-${key}`], queryFn: load });
}

async function fetchPatientMap(ids: string[]): Promise<Record<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return {};
  const { data } = await supabase.from("patients" as never)
    .select("id, full_name, medical_record_number").in("id", uniq as never);
  const map: Record<string, string> = {};
  (data as unknown as { id: string; full_name: string; medical_record_number: string | null }[] | null)?.forEach((p) => {
    map[p.id] = `${p.full_name}${p.medical_record_number ? ` · ${p.medical_record_number}` : ""}`;
  });
  return map;
}

function groupByDate(rows: Row[]): Array<{ date: string; items: Row[] }> {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const d = new Date(r.when).toLocaleDateString();
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(r);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
}

function CompletedReports() {
  const [tab, setTab] = useState("lab");
  const [q, setQ] = useState("");

  const labs = useCompleted<Row>("labs", async () => {
    const { data } = await supabase.from("lab_results" as never)
      .select("id, order_id, result_value, units, abnormal_flag, performed_at")
      .not("performed_at", "is", null)
      .order("performed_at", { ascending: false }).limit(500);
    const arr = (data as unknown as Array<{ id: string; order_id: string | null; result_value: string | null; units: string | null; abnormal_flag: string | null; performed_at: string }>) ?? [];
    const orderIds = arr.map((r) => r.order_id).filter(Boolean) as string[];
    const { data: orders } = orderIds.length
      ? await supabase.from("lab_orders" as never).select("id, patient_id, test_name").in("id", orderIds as never)
      : { data: [] as unknown };
    const om = new Map((orders as unknown as { id: string; patient_id: string; test_name: string | null }[] | null ?? []).map((o) => [o.id, o]));
    const pm = await fetchPatientMap((orders as unknown as { patient_id: string }[] | null ?? []).map((o) => o.patient_id));
    return arr.map((r) => {
      const o = r.order_id ? om.get(r.order_id) : undefined;
      return {
        id: r.id, when: r.performed_at, who: o ? pm[o.patient_id] ?? null : null,
        primary: `${o?.test_name ?? "Lab result"}: ${r.result_value ?? "—"} ${r.units ?? ""} ${r.abnormal_flag ?? ""}`.trim(),
        secondary: null,
      };
    });
  });

  const rx = useCompleted<Row>("pharmacy", async () => {
    const { data } = await supabase.from("pharmacy_dispenses" as never)
      .select("id, prescription_id, quantity, dispensed_at, status")
      .eq("status", "dispensed").order("dispensed_at", { ascending: false }).limit(500);
    const arr = (data as unknown as Array<{ id: string; prescription_id: string; quantity: number; dispensed_at: string }>) ?? [];
    const rxIds = arr.map((r) => r.prescription_id).filter(Boolean);
    const { data: rxs } = rxIds.length
      ? await supabase.from("prescriptions" as never).select("id, medication, dose, visit_id").in("id", rxIds as never)
      : { data: [] as unknown };
    const rm = new Map((rxs as unknown as { id: string; medication: string; dose: string | null; visit_id: string }[] | null ?? []).map((p) => [p.id, p]));
    const visitIds = Array.from(rm.values()).map((r) => r.visit_id).filter(Boolean);
    const { data: visits } = visitIds.length
      ? await supabase.from("visits" as never).select("id, patient_id").in("id", visitIds as never)
      : { data: [] as unknown };
    const vm = new Map((visits as unknown as { id: string; patient_id: string }[] | null ?? []).map((v) => [v.id, v.patient_id]));
    const pm = await fetchPatientMap(Array.from(vm.values()));
    return arr.map((d) => {
      const p = rm.get(d.prescription_id);
      const pid = p ? vm.get(p.visit_id) : undefined;
      return {
        id: d.id, when: d.dispensed_at, who: pid ? pm[pid] ?? null : null,
        primary: `${p?.medication ?? "Prescription"}${p?.dose ? ` · ${p.dose}` : ""}`,
        secondary: `Qty ${d.quantity}`,
      };
    });
  });

  const imaging = useCompleted<Row>("radiology", async () => {
    const { data } = await supabase.from("imaging_orders" as never)
      .select("id, patient_id, modality, body_part, status, updated_at")
      .in("status", ["completed", "reported"] as never)
      .order("updated_at", { ascending: false }).limit(500);
    const arr = (data as unknown as Array<{ id: string; patient_id: string; modality: string | null; body_part: string | null; updated_at: string }>) ?? [];
    const pm = await fetchPatientMap(arr.map((r) => r.patient_id));
    return arr.map((r) => ({
      id: r.id, when: r.updated_at, who: pm[r.patient_id] ?? null,
      primary: `${r.modality ?? "Imaging"} · ${r.body_part ?? "—"}`, secondary: null,
    }));
  });

  const nursing = useCompleted<Row>("nursing", async () => {
    const { data } = await supabase.from("clinical_tasks" as never)
      .select("id, patient_id, title, status, completed_at, category")
      .eq("status", "completed").not("completed_at", "is", null)
      .order("completed_at", { ascending: false }).limit(500);
    const arr = (data as unknown as Array<{ id: string; patient_id: string; title: string; category: string | null; completed_at: string }>) ?? [];
    const pm = await fetchPatientMap(arr.map((r) => r.patient_id));
    return arr.map((r) => ({
      id: r.id, when: r.completed_at, who: pm[r.patient_id] ?? null,
      primary: r.title, secondary: r.category,
    }));
  });

  const billing = useCompleted<Row>("billing", async () => {
    const { data } = await supabase.from("invoices" as never)
      .select("id, patient_id, total_cents, status, updated_at")
      .in("status", ["paid", "settled"] as never)
      .order("updated_at", { ascending: false }).limit(500);
    const arr = (data as unknown as Array<{ id: string; patient_id: string; total_cents: number | null; status: string; updated_at: string }>) ?? [];
    const pm = await fetchPatientMap(arr.map((r) => r.patient_id));
    return arr.map((r) => ({
      id: r.id, when: r.updated_at, who: pm[r.patient_id] ?? null,
      primary: `Invoice paid`, secondary: r.total_cents != null ? `KES ${(r.total_cents / 100).toLocaleString()}` : null,
    }));
  });

  const active = { lab: labs, pharmacy: rx, radiology: imaging, nursing, billing }[tab as "lab"];
  const rows: Row[] = active?.data ?? [];
  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => `${r.who ?? ""} ${r.primary} ${r.secondary ?? ""}`.toLowerCase().includes(s));
  }, [rows, q]);
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Archive className="h-6 w-6 text-primary" /> Completed reports</h1>
        <p className="text-sm text-muted-foreground">Fulfilled records grouped by date, searchable by patient, MRN, item, or category.</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search completed records…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="lab"><FlaskConical className="mr-1 h-4 w-4" />Lab</TabsTrigger>
          <TabsTrigger value="pharmacy"><Pill className="mr-1 h-4 w-4" />Pharmacy</TabsTrigger>
          <TabsTrigger value="radiology"><ScanLine className="mr-1 h-4 w-4" />Radiology</TabsTrigger>
          <TabsTrigger value="nursing"><HeartPulse className="mr-1 h-4 w-4" />Nursing</TabsTrigger>
          <TabsTrigger value="billing"><Receipt className="mr-1 h-4 w-4" />Billing</TabsTrigger>
        </TabsList>
        {(["lab", "pharmacy", "radiology", "nursing", "billing"] as const).map((k) => (
          <TabsContent key={k} value={k} className="mt-4 space-y-4">
            {active?.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!active?.isLoading && groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No completed {k} records{q ? " matching your search" : ""}.</p>
            )}
            {groups.map((g) => (
              <div key={g.date} className="rounded-lg border bg-card">
                <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.date} · {g.items.length}
                </div>
                <ul className="divide-y">
                  {g.items.map((it) => (
                    <li key={it.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{it.primary}</div>
                        {it.secondary && <div className="truncate text-xs text-muted-foreground">{it.secondary}</div>}
                        {it.who && <div className="truncate text-xs text-muted-foreground">{it.who}</div>}
                      </div>
                      <div className="shrink-0 text-xs text-muted-foreground">{new Date(it.when).toLocaleTimeString()}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, Search, FlaskConical, Pill, ScanLine, HeartPulse, Receipt, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { AppRole } from "@/hooks/use-auth";
import { LabDocumentBrowser } from "@/components/lab-document-viewer";

export const Route = createFileRoute("/_authenticated/completed")({
  head: () => ({
    meta: [
      { title: "Completed reports — Litu Vault" },
      { name: "description", content: "Fulfilled lab, pharmacy, radiology, nursing and billing records with search." },
    ],
  }),
  component: CompletedReports,
});

type TabKey = "lab" | "pharmacy" | "radiology" | "nursing" | "billing";

interface Row {
  id: string;
  when: string;
  patientName: string | null;
  patientMrn: string | null;
  primary: string;
  secondary: string | null;
  details: { label: string; value: string | null }[];
}

async function fetchPatientMap(ids: string[]) {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return {} as Record<string, { full_name: string; mrn: string | null }>;
  const { data } = await supabase.from("patients" as never)
    .select("id, full_name, medical_record_number").in("id", uniq as never);
  const map: Record<string, { full_name: string; mrn: string | null }> = {};
  (data as unknown as { id: string; full_name: string; medical_record_number: string | null }[] | null)?.forEach((p) => {
    map[p.id] = { full_name: p.full_name, mrn: p.medical_record_number };
  });
  return map;
}

function groupByDate(rows: Row[]) {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const d = new Date(r.when).toLocaleDateString("en-GB");
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(r);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, items]) => ({ date, items }));
}

// Role → visible tabs mapping. Admin sees everything.
const ROLE_TABS: Partial<Record<AppRole, TabKey[]>> = {
  admin: ["lab", "pharmacy", "radiology", "nursing", "billing"],
  lab_tech: ["lab"],
  pharmacist: ["pharmacy"],
  radiologist: ["radiology"],
  nurse: ["nursing"],
  doctor: ["lab", "pharmacy", "radiology", "nursing"],
  billing_officer: ["billing"],
  receptionist: ["billing"],
};

function CompletedReports() {
  const { roles } = useAuth();
  const visibleTabs = useMemo<TabKey[]>(() => {
    const set = new Set<TabKey>();
    roles.forEach((r) => (ROLE_TABS[r] ?? []).forEach((t) => set.add(t)));
    return (["lab", "pharmacy", "radiology", "nursing", "billing"] as TabKey[]).filter((t) => set.has(t));
  }, [roles]);

  const [tab, setTab] = useState<TabKey>(visibleTabs[0] ?? "lab");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const labs = useQuery({
    queryKey: ["completed-labs"],
    enabled: visibleTabs.includes("lab"),
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase.from("lab_results" as never)
        .select("id, order_id, result_value, units, abnormal_flag, performed_at, comments, reference_range")
        .not("performed_at", "is", null)
        .order("performed_at", { ascending: false }).limit(500);
      const arr = (data as unknown as Array<{ id: string; order_id: string | null; result_value: string | null; units: string | null; abnormal_flag: string | null; performed_at: string; comments: string | null; reference_range: string | null }>) ?? [];
      const orderIds = arr.map((r) => r.order_id).filter(Boolean) as string[];
      const { data: orders } = orderIds.length
        ? await supabase.from("lab_orders" as never).select("id, patient_id, test_id, priority, clinical_notes").in("id", orderIds as never)
        : { data: [] as unknown };
      const orderList = (orders as unknown as { id: string; patient_id: string; test_id: string | null; priority: string | null; clinical_notes: string | null }[] | null) ?? [];
      const om = new Map(orderList.map((o) => [o.id, o]));
      const testIds = orderList.map((o) => o.test_id).filter(Boolean) as string[];
      const { data: tests } = testIds.length
        ? await supabase.from("lab_tests_catalog" as never).select("id, name").in("id", testIds as never)
        : { data: [] as unknown };
      const tm = new Map(((tests as unknown as { id: string; name: string }[] | null) ?? []).map((t) => [t.id, t.name]));
      const pm = await fetchPatientMap(orderList.map((o) => o.patient_id));
      return arr.map((r) => {
        const o = r.order_id ? om.get(r.order_id) : undefined;
        const p = o ? pm[o.patient_id] : undefined;
        const testName = o?.test_id ? tm.get(o.test_id) ?? "Lab result" : "Lab result";
        return {
          id: r.id,
          when: r.performed_at,
          patientName: p?.full_name ?? null,
          patientMrn: p?.mrn ?? null,
          primary: testName,
          secondary: `${r.result_value ?? "—"}${r.units ? ` ${r.units}` : ""}${r.abnormal_flag ? ` · ${r.abnormal_flag}` : ""}`,
          details: [
            { label: "Result", value: r.result_value },
            { label: "Units", value: r.units },
            { label: "Reference range", value: r.reference_range },
            { label: "Flag", value: r.abnormal_flag },
            { label: "Priority", value: o?.priority ?? null },
            { label: "Clinical notes", value: o?.clinical_notes ?? null },
            { label: "Comments", value: r.comments },
          ],
        };
      });
    },
  });

  const rx = useQuery({
    queryKey: ["completed-pharmacy"],
    enabled: visibleTabs.includes("pharmacy"),
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase.from("pharmacy_dispenses" as never)
        .select("id, prescription_id, quantity, dispensed_at, status, instructions")
        .eq("status", "dispensed").order("dispensed_at", { ascending: false }).limit(500);
      const arr = (data as unknown as Array<{ id: string; prescription_id: string; quantity: number; dispensed_at: string; instructions: string | null }>) ?? [];
      const rxIds = arr.map((r) => r.prescription_id).filter(Boolean);
      const { data: rxs } = rxIds.length
        ? await supabase.from("prescriptions" as never).select("id, medication, dose, frequency, duration, visit_id").in("id", rxIds as never)
        : { data: [] as unknown };
      const rm = new Map(((rxs as unknown as { id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null; visit_id: string }[] | null) ?? []).map((p) => [p.id, p]));
      const visitIds = Array.from(rm.values()).map((r) => r.visit_id).filter(Boolean);
      const { data: visits } = visitIds.length
        ? await supabase.from("visits" as never).select("id, patient_id").in("id", visitIds as never)
        : { data: [] as unknown };
      const vm = new Map(((visits as unknown as { id: string; patient_id: string }[] | null) ?? []).map((v) => [v.id, v.patient_id]));
      const pm = await fetchPatientMap(Array.from(vm.values()));
      return arr.map((d) => {
        const p = rm.get(d.prescription_id);
        const pid = p ? vm.get(p.visit_id) : undefined;
        const pat = pid ? pm[pid] : undefined;
        return {
          id: d.id,
          when: d.dispensed_at,
          patientName: pat?.full_name ?? null,
          patientMrn: pat?.mrn ?? null,
          primary: p?.medication ?? "Prescription",
          secondary: `Qty ${d.quantity}${p?.dose ? ` · ${p.dose}` : ""}${p?.frequency ? ` · ${p.frequency}` : ""}`,
          details: [
            { label: "Medication", value: p?.medication ?? null },
            { label: "Dose", value: p?.dose ?? null },
            { label: "Frequency", value: p?.frequency ?? null },
            { label: "Duration", value: p?.duration ?? null },
            { label: "Quantity dispensed", value: String(d.quantity) },
            { label: "Dispensing instructions", value: d.instructions },
          ],
        };
      });
    },
  });

  const imaging = useQuery({
    queryKey: ["completed-radiology"],
    enabled: visibleTabs.includes("radiology"),
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase.from("imaging_orders" as never)
        .select("id, patient_id, modality, body_part, status, updated_at, clinical_question, findings, report, priority")
        .in("status", ["completed", "reported"] as never)
        .order("updated_at", { ascending: false }).limit(500);
      const arr = (data as unknown as Array<{ id: string; patient_id: string; modality: string | null; body_part: string | null; updated_at: string; clinical_question: string | null; findings: string | null; report: string | null; priority: string | null }>) ?? [];
      const pm = await fetchPatientMap(arr.map((r) => r.patient_id));
      return arr.map((r) => ({
        id: r.id,
        when: r.updated_at,
        patientName: pm[r.patient_id]?.full_name ?? null,
        patientMrn: pm[r.patient_id]?.mrn ?? null,
        primary: `${r.modality ?? "Imaging"} · ${r.body_part ?? "—"}`,
        secondary: r.priority ?? null,
        details: [
          { label: "Modality", value: r.modality },
          { label: "Body part", value: r.body_part },
          { label: "Clinical question", value: r.clinical_question },
          { label: "Findings", value: r.findings },
          { label: "Report", value: r.report },
        ],
      }));
    },
  });

  const nursing = useQuery({
    queryKey: ["completed-nursing"],
    enabled: visibleTabs.includes("nursing"),
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase.from("clinical_tasks" as never)
        .select("id, patient_id, title, status, completed_at, category, description, priority")
        .eq("status", "completed").not("completed_at", "is", null)
        .order("completed_at", { ascending: false }).limit(500);
      const arr = (data as unknown as Array<{ id: string; patient_id: string; title: string; category: string | null; completed_at: string; description: string | null; priority: string | null }>) ?? [];
      const pm = await fetchPatientMap(arr.map((r) => r.patient_id));
      return arr.map((r) => ({
        id: r.id,
        when: r.completed_at,
        patientName: pm[r.patient_id]?.full_name ?? null,
        patientMrn: pm[r.patient_id]?.mrn ?? null,
        primary: r.title,
        secondary: r.category,
        details: [
          { label: "Category", value: r.category },
          { label: "Priority", value: r.priority },
          { label: "Description", value: r.description },
        ],
      }));
    },
  });

  const billing = useQuery({
    queryKey: ["completed-billing"],
    enabled: visibleTabs.includes("billing"),
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase.from("invoices" as never)
        .select("id, patient_id, total_cents, paid_cents, status, updated_at")
        .in("status", ["paid", "settled"] as never)
        .order("updated_at", { ascending: false }).limit(500);
      const arr = (data as unknown as Array<{ id: string; patient_id: string; total_cents: number | null; paid_cents: number | null; status: string; updated_at: string }>) ?? [];
      const pm = await fetchPatientMap(arr.map((r) => r.patient_id));
      return arr.map((r) => ({
        id: r.id,
        when: r.updated_at,
        patientName: pm[r.patient_id]?.full_name ?? null,
        patientMrn: pm[r.patient_id]?.mrn ?? null,
        primary: `Invoice · ${r.status}`,
        secondary: r.total_cents != null ? `KES ${(r.total_cents / 100).toLocaleString("en-GB")}` : null,
        details: [
          { label: "Total", value: r.total_cents != null ? `KES ${(r.total_cents / 100).toLocaleString("en-GB")}` : null },
          { label: "Paid", value: r.paid_cents != null ? `KES ${(r.paid_cents / 100).toLocaleString("en-GB")}` : null },
          { label: "Status", value: r.status },
        ],
      }));
    },
  });

  const map: Record<TabKey, ReturnType<typeof useQuery<Row[]>>> = { lab: labs, pharmacy: rx, radiology: imaging, nursing, billing };
  const active = map[tab];
  const rows: Row[] = active?.data ?? [];
  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => `${r.patientName ?? ""} ${r.patientMrn ?? ""} ${r.primary} ${r.secondary ?? ""}`.toLowerCase().includes(s));
  }, [rows, q]);
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  if (visibleTabs.length === 0) {
    return <p className="text-sm text-muted-foreground">You don't have access to any completed record archives.</p>;
  }

  const TAB_META: Record<TabKey, { label: string; icon: typeof FlaskConical }> = {
    lab: { label: "Lab", icon: FlaskConical },
    pharmacy: { label: "Pharmacy", icon: Pill },
    radiology: { label: "Radiology", icon: ScanLine },
    nursing: { label: "Nursing", icon: HeartPulse },
    billing: { label: "Billing", icon: Receipt },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Archive className="h-6 w-6 text-primary" /> Completed reports</h1>
        <p className="text-sm text-muted-foreground">Fulfilled records grouped by date. Click any row to expand its details.</p>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by patient, MRN, or item…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          {visibleTabs.map((k) => {
            const Meta = TAB_META[k];
            const Icon = Meta.icon;
            return <TabsTrigger key={k} value={k}><Icon className="mr-1 h-4 w-4" />{Meta.label}</TabsTrigger>;
          })}
        </TabsList>
        {visibleTabs.map((k) => (
          <TabsContent key={k} value={k} className="mt-4 space-y-4">
            {k === "lab" ? (
              <LabDocumentBrowser />
            ) : (
              <>
                {active?.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {!active?.isLoading && groups.length === 0 && (
                  <p className="text-sm text-muted-foreground">No completed {TAB_META[k].label.toLowerCase()} records{q ? " matching your search" : ""}.</p>
                )}
                {groups.map((g) => (
                  <div key={g.date} className="rounded-lg border bg-card">
                    <div className="border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.date} · {g.items.length}
                    </div>
                    <ul className="divide-y">
                      {g.items.map((it) => {
                        const isOpen = expanded.has(it.id);
                        return (
                          <li key={it.id} className="text-sm">
                            <button
                              type="button"
                              onClick={() => toggle(it.id)}
                              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-accent/40"
                            >
                              <div className="flex min-w-0 items-start gap-2">
                                <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                <div className="min-w-0">
                                  <div className="truncate font-medium">
                                    {it.patientName ?? "Unknown patient"}
                                    {it.patientMrn && <span className="ml-2 font-mono text-xs text-muted-foreground">{it.patientMrn}</span>}
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    {it.primary}{it.secondary ? ` · ${it.secondary}` : ""}
                                  </div>
                                </div>
                              </div>
                              <div className="shrink-0 text-xs text-muted-foreground">{new Date(it.when).toLocaleTimeString("en-GB")}</div>
                            </button>
                            {isOpen && (
                              <div className="border-t bg-muted/20 px-8 py-3">
                                <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                                  {it.details.filter((d) => d.value).map((d) => (
                                    <div key={d.label} className="text-xs">
                                      <dt className="font-medium uppercase tracking-wide text-muted-foreground">{d.label}</dt>
                                      <dd className="mt-0.5 whitespace-pre-wrap">{d.value}</dd>
                                    </div>
                                  ))}
                                  {it.details.every((d) => !d.value) && (
                                    <div className="text-xs text-muted-foreground">No additional details recorded.</div>
                                  )}
                                </dl>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

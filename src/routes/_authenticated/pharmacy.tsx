import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pill, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PatientContext } from "@/components/patient-context";
import { RoleGate } from "@/components/role-gate";
// Stock requests moved to global navigation under Orders (/orders/stock-requests).
import { WorkflowChip } from "@/components/workflow-chip";
import { useEncounterMap, encounterCounts, type EncounterFilter } from "@/hooks/use-encounter";
import { EncounterTabs } from "@/components/encounter-tabs";

export const Route = createFileRoute("/_authenticated/pharmacy")({ component: () => <RoleGate path="/pharmacy"><PharmacyPortal /></RoleGate> });

interface Rx { id: string; visit_id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null; instructions: string | null; created_at: string }
interface Dispense { id: string; prescription_id: string; quantity: number; status: string; dispensed_at: string; inventory_item_id: string | null }
interface InvItem { id: string; name: string; sku: string | null; quantity: number; reorder_threshold: number; category: string | null }

function PharmacyPortal() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canDispense = hasAnyRole(["pharmacist", "admin"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "dispensed">("pending");
  const [encFilter, setEncFilter] = useState<EncounterFilter>("all");
  const [search, setSearch] = useState("");
  const encMap = useEncounterMap();

  const rx = useQuery({ queryKey: ["pharm-rx"], queryFn: async () => {
    const { data, error } = await supabase.from("prescriptions" as never).select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error; return (data as unknown as Rx[]) ?? [];
  }});
  const dispenses = useQuery({ queryKey: ["pharm-disp"], queryFn: async () => {
    const { data, error } = await supabase.from("pharmacy_dispenses" as never).select("*").order("dispensed_at", { ascending: false });
    if (error) throw error; return (data as unknown as Dispense[]) ?? [];
  }});
  const inv = useQuery({ queryKey: ["pharm-inv"], queryFn: async () => {
    const { data, error } = await supabase.from("inventory_items" as never).select("*").order("name");
    if (error) throw error; return (data as unknown as InvItem[]) ?? [];
  }});

  const visitIds = Array.from(new Set((rx.data ?? []).map((r) => r.visit_id).filter(Boolean)));
  const visitPatients = useQuery({
    queryKey: ["pharm-visit-patients", visitIds.join(",")], enabled: visitIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("visits" as never).select("id, patient_id").in("id", visitIds as never);
      return (data as unknown as { id: string; patient_id: string }[]) ?? [];
    },
  });
  const patientFor = (visitId: string) => visitPatients.data?.find((v) => v.id === visitId)?.patient_id;

  const [dispOpen, setDispOpen] = useState<Rx | null>(null);
  const [form, setForm] = useState({ inventory_item_id: "", quantity: 0, instructions: "" });

  const dispense = useMutation({
    mutationFn: async () => {
      if (!dispOpen) return;
      const qty = Number(form.quantity);
      if (!qty || qty <= 0) throw new Error("Quantity required");
      const item = inv.data?.find((i) => i.id === form.inventory_item_id);
      if (form.inventory_item_id && item && item.quantity < qty) throw new Error(`Only ${item.quantity} in stock`);
      const { error: e1 } = await supabase.from("pharmacy_dispenses" as never).insert({
        prescription_id: dispOpen.id, inventory_item_id: form.inventory_item_id || null,
        quantity: qty, instructions: form.instructions || dispOpen.instructions, dispensed_by: user!.id, status: "dispensed",
      } as never);
      if (e1) throw e1;
      if (form.inventory_item_id && item) {
        await supabase.from("inventory_items" as never).update({ quantity: item.quantity - qty } as never).eq("id", item.id);
        await supabase.from("inventory_movements" as never).insert({
          inventory_item_id: item.id, change: -qty, reason: `Dispense for ${dispOpen.medication}`,
          prescription_id: dispOpen.id, by_user: user!.id,
        } as never);
      }
    },
    onSuccess: () => {
      setDispOpen(null); setForm({ inventory_item_id: "", quantity: 0, instructions: "" });
      qc.invalidateQueries({ queryKey: ["pharm-disp"] });
      qc.invalidateQueries({ queryKey: ["pharm-inv"] });
      toast.success("Dispensed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lowStock = inv.data?.filter((i) => i.quantity <= i.reorder_threshold) ?? [];

  const statusOf = (r: Rx) => dispenses.data?.find((d) => d.prescription_id === r.id) ? "dispensed" : "pending";
  const encCounts = useMemo(
    () => encounterCounts(rx.data ?? [], encMap.data?.inpatientVisitIds),
    [rx.data, encMap.data?.inpatientVisitIds],
  );
  const filtered = useMemo(() => {
    const inp = encMap.data?.inpatientVisitIds;
    return (rx.data ?? []).filter((r) => {
      const s = statusOf(r);
      if (filter !== "all" && s !== filter) return false;
      if (encFilter !== "all") {
        const isInp = !!(r.visit_id && inp?.has(r.visit_id));
        if (encFilter === "inpatient" && !isInp) return false;
        if (encFilter === "outpatient" && isInp) return false;
      }
      if (search && !r.medication.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rx.data, dispenses.data, filter, encFilter, search, encMap.data?.inpatientVisitIds]); // eslint-disable-line

  const selected = filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null;
  const selDispense = selected && dispenses.data?.find((d) => d.prescription_id === selected.id);
  const selPid = selected && patientFor(selected.visit_id);

  return (
    <div className="grid h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[360px_1fr]">
      {/* LEFT PANEL: queue + filters + low stock + stock requests */}
      <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
        {lowStock.length > 0 && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs">
            <div className="flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3 text-amber-600" /> {lowStock.length} low-stock alerts</div>
          </div>
        )}
        {/* Stock requests now live in the global Orders area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-3">
            <div className="flex items-center gap-2 font-semibold"><Pill className="h-4 w-4 text-rose-500" /> Prescription queue</div>
            <div className="relative mt-2">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search medication..." value={search} onChange={(e)=>setSearch(e.target.value)} className="h-8 pl-7 text-xs" />
            </div>
            <div className="mt-2">
              <EncounterTabs value={encFilter} onChange={setEncFilter} counts={encCounts} />
            </div>
            <div className="mt-2 flex gap-1 text-xs">
              {(["pending","dispensed","all"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`flex-1 rounded px-2 py-1 capitalize transition ${filter===f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {filtered.length === 0 && <div className="p-4 text-xs text-muted-foreground">No prescriptions.</div>}
            {filtered.map((r) => {
              const active = r.id === selected?.id;
              const s = statusOf(r);
              return (
                <button key={r.id} onClick={() => setSelectedId(r.id)}
                  className={`flex w-full flex-col gap-0.5 border-l-4 border-b p-3 text-left text-xs transition ${
                    active ? "bg-accent border-l-primary" : "border-l-transparent hover:bg-accent/40"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{r.medication}</span>
                    <WorkflowChip status={s} />
                  </div>
                  <span className="text-muted-foreground">{[r.dose, r.frequency, r.duration].filter(Boolean).join(" · ") || "—"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT: selected prescription */}
      <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a prescription.</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto">
            <div className="flex items-center justify-between border-b bg-muted/30 p-4">
              <div>
                <div className="text-lg font-semibold">{selected.medication}</div>
                <div className="text-xs text-muted-foreground">{new Date(selected.created_at).toLocaleString()}</div>
              </div>
              <WorkflowChip status={selDispense ? "dispensed" : "pending"} />
            </div>

            <div className="space-y-4 p-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-3">
                <Detail label="Dose" value={selected.dose ?? "—"} />
                <Detail label="Frequency" value={selected.frequency ?? "—"} />
                <Detail label="Duration" value={selected.duration ?? "—"} />
              </div>
              {selected.instructions && (
                <div className="rounded border bg-muted/30 p-3 text-xs">
                  <div className="font-medium">Instructions</div>
                  <div className="text-muted-foreground">{selected.instructions}</div>
                </div>
              )}
              {selPid && <PatientContext patientId={selPid} visitId={selected.visit_id} />}
              {selDispense && (
                <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs">
                  <div className="font-medium">Dispensed</div>
                  <div className="text-muted-foreground">Qty {selDispense.quantity} · {new Date(selDispense.dispensed_at).toLocaleString()}</div>
                </div>
              )}
              {canDispense && !selDispense && (
                <Button onClick={() => setDispOpen(selected)}><Pill className="h-4 w-4" /> Dispense</Button>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!dispOpen} onOpenChange={(v) => !v && setDispOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dispense: {dispOpen?.medication}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div>
              <Label>Link to inventory item (optional)</Label>
              <select className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
                value={form.inventory_item_id} onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })}>
                <option value="">— none —</option>
                {inv.data?.map((i) => <option key={i.id} value={i.id}>{i.name} (qty {i.quantity})</option>)}
              </select>
            </div>
            <div><Label>Quantity</Label><Input type="number" value={form.quantity || ""} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
            <div><Label>Instructions to patient</Label><Textarea rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => dispense.mutate()} disabled={dispense.isPending}>Dispense & deduct stock</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

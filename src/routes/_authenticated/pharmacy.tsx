import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pill, Package, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PatientContext } from "@/components/patient-context";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/pharmacy")({ component: () => <RoleGate path="/pharmacy"><PharmacyPortal /></RoleGate> });

interface Rx { id: string; visit_id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null; instructions: string | null; created_at: string }
interface Dispense { id: string; prescription_id: string; quantity: number; status: string; dispensed_at: string; inventory_item_id: string | null }
interface InvItem { id: string; name: string; sku: string | null; quantity: number; reorder_threshold: number; category: string | null }
interface Movement { id: string; inventory_item_id: string; change: number; reason: string | null; created_at: string }

function PharmacyPortal() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canDispense = hasAnyRole(["pharmacist", "admin"]);

  const rx = useQuery({
    queryKey: ["pharm-rx"],
    queryFn: async () => {
      const { data, error } = await supabase.from("prescriptions" as never).select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data as unknown as Rx[]) ?? [];
    },
  });
  const dispenses = useQuery({
    queryKey: ["pharm-disp"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharmacy_dispenses" as never).select("*").order("dispensed_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Dispense[]) ?? [];
    },
  });
  const inv = useQuery({
    queryKey: ["pharm-inv"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items" as never).select("*").order("name");
      if (error) throw error;
      return (data as unknown as InvItem[]) ?? [];
    },
  });
  const movs = useQuery({
    queryKey: ["pharm-mov"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_movements" as never).select("*").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data as unknown as Movement[]) ?? [];
    },
  });

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
        const { error: e2 } = await supabase.from("inventory_items" as never)
          .update({ quantity: item.quantity - qty } as never).eq("id", item.id);
        if (e2) throw e2;
        const { error: e3 } = await supabase.from("inventory_movements" as never).insert({
          inventory_item_id: item.id, change: -qty, reason: `Dispense for ${dispOpen.medication}`,
          prescription_id: dispOpen.id, by_user: user!.id,
        } as never);
        if (e3) throw e3;
      }
    },
    onSuccess: () => {
      setDispOpen(null); setForm({ inventory_item_id: "", quantity: 0, instructions: "" });
      qc.invalidateQueries({ queryKey: ["pharm-disp"] });
      qc.invalidateQueries({ queryKey: ["pharm-inv"] });
      qc.invalidateQueries({ queryKey: ["pharm-mov"] });
      toast.success("Dispensed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lowStock = inv.data?.filter((i) => i.quantity <= i.reorder_threshold) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Pill className="h-6 w-6 text-primary" /> Pharmacy portal</h1>
        <p className="text-sm text-muted-foreground">Dispense prescriptions and manage stock.</p>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-amber-600" /> Low stock alerts</div>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {lowStock.map((i) => <li key={i.id}>{i.name} — {i.quantity} left (reorder at {i.reorder_threshold})</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card lg:col-span-2">
          <div className="border-b p-3 font-medium">Prescription queue</div>
          <div className="divide-y">
            {rx.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No prescriptions.</div>}
            {rx.data?.map((r) => {
              const d = dispenses.data?.find((x) => x.prescription_id === r.id);
              const pid = patientFor(r.visit_id);
              return (
                <div key={r.id} className="p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{r.medication}</div>
                      <div className="text-xs text-muted-foreground">{[r.dose, r.frequency, r.duration].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {d ? (
                        <span className="rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-700">Dispensed × {d.quantity}</span>
                      ) : canDispense ? (
                        <Button size="sm" onClick={() => setDispOpen(r)}>Dispense</Button>
                      ) : <span className="text-xs text-muted-foreground">Pending</span>}
                    </div>
                  </div>
                  {pid && <PatientContext patientId={pid} visitId={r.visit_id} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="border-b p-3 font-medium flex items-center gap-2"><Package className="h-4 w-4" /> Inventory</div>
          <div className="max-h-96 divide-y overflow-auto">
            {inv.data?.map((i) => (
              <div key={i.id} className="flex items-center justify-between p-2 text-sm">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-muted-foreground">{i.sku ?? ""}</div>
                </div>
                <div className={`font-mono text-sm ${i.quantity <= i.reorder_threshold ? "text-amber-600" : ""}`}>{i.quantity}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 font-medium">Recent stock movements</div>
        <div className="divide-y">
          {movs.data?.length === 0 && <div className="p-3 text-sm text-muted-foreground">No movements.</div>}
          {movs.data?.map((m) => {
            const item = inv.data?.find((i) => i.id === m.inventory_item_id);
            return (
              <div key={m.id} className="flex justify-between p-2 text-xs">
                <div>{item?.name ?? m.inventory_item_id.slice(0,8)} — {m.reason}</div>
                <div className={m.change < 0 ? "text-destructive" : "text-green-700"}>{m.change > 0 ? "+" : ""}{m.change}</div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!dispOpen} onOpenChange={(v) => !v && setDispOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dispense: {dispOpen?.medication}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div>
              <Label>Link to inventory item (optional)</Label>
              <select className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
                value={form.inventory_item_id}
                onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })}>
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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCcw, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchRefillRequests, updateRefillRequest, type RefillRequestRow } from "@/lib/chronic/chronic-api";

interface InvItem { id: string; name: string; quantity: number }

const OPEN_STATUSES = ["requested", "pharmacy_review", "clinician_review", "approved"];

/**
 * Pharmacy-side worklist for chronic refill fulfillment requests:
 * review → approve/reject → dispense with inventory decrement and an
 * inventory movement, then the source order's refill counter is advanced.
 */
export function RefillQueue() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canAct = hasAnyRole(["pharmacist", "admin"]);
  const [dispensing, setDispensing] = useState<RefillRequestRow | null>(null);
  const [form, setForm] = useState({ inventory_item_id: "", quantity: 0 });

  const requests = useQuery({ queryKey: ["refill-requests"], queryFn: () => fetchRefillRequests() });
  const inv = useQuery({
    queryKey: ["refill-inv"],
    queryFn: async () => {
      const { data } = await supabase.from("inventory_items" as never).select("id, name, quantity").order("name");
      return (data as unknown as InvItem[]) ?? [];
    },
  });

  const open = (requests.data?.rows ?? []).filter((r) => OPEN_STATUSES.includes(r.status));

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      updateRefillRequest(id, { status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["refill-requests"] }); toast.success("Request updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const dispense = useMutation({
    mutationFn: async () => {
      if (!dispensing) return;
      const qty = Number(form.quantity);
      if (!qty || qty <= 0) throw new Error("Quantity required");
      const item = inv.data?.find((i) => i.id === form.inventory_item_id);
      if (item && item.quantity < qty) throw new Error(`Only ${item.quantity} in stock`);

      await updateRefillRequest(dispensing.id, {
        status: "dispensed",
        dispensed_by: user?.id ?? null,
        dispensed_at: new Date().toISOString(),
        inventory_item_id: form.inventory_item_id || null,
        dispensed_quantity: qty,
      });

      if (item) {
        await supabase.from("inventory_items" as never)
          .update({ quantity: item.quantity - qty } as never).eq("id", item.id);
        await supabase.from("inventory_movements" as never).insert({
          inventory_item_id: item.id, change: -qty,
          reason: `Chronic refill: ${dispensing.medication}`, by_user: user?.id ?? null,
        } as never);
      }

      // Advance the chronic order: count the refill and restart the supply clock.
      const { data: med } = await supabase.from("chronic_medications" as never)
        .select("refills_used").eq("id", dispensing.medication_id).maybeSingle();
      const used = Number((med as unknown as { refills_used?: number } | null)?.refills_used ?? 0);
      await supabase.from("chronic_medications" as never).update({
        refills_used: used + 1,
        start_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      } as never).eq("id", dispensing.medication_id);
    },
    onSuccess: () => {
      setDispensing(null);
      qc.invalidateQueries({ queryKey: ["refill-requests"] });
      qc.invalidateQueries({ queryKey: ["refill-inv"] });
      qc.invalidateQueries({ queryKey: ["chronic-meds"] });
      qc.invalidateQueries({ queryKey: ["pharm-inv"] });
      toast.success("Refill dispensed and stock updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (requests.data?.schemaMissing) {
    return (
      <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        Chronic refill queue becomes active once the chronic-care tables are created.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <RefreshCcw className="h-4 w-4 text-primary" /> Chronic refill requests
        </div>
        <span className="rounded bg-muted px-2 py-0.5 text-xs">{open.length}</span>
      </div>
      <div className="divide-y">
        {open.length === 0 && <div className="p-3 text-xs text-muted-foreground">No open refill requests</div>}
        {open.map((r) => (
          <div key={r.id} className="space-y-1 p-3 text-sm">
            <div className="font-medium">{r.medication} {r.dose && <span className="text-muted-foreground">· {r.dose}</span>}</div>
            <div className="text-xs text-muted-foreground">{r.frequency} · {r.reason}</div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize">{r.status.replace(/_/g, " ")}</span>
              {canAct && r.status !== "approved" && (
                <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, status: "approved" })}>Approve</Button>
              )}
              {canAct && (
                <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: r.id, status: "rejected" })}>Reject</Button>
              )}
              {canAct && (
                <Button size="sm" onClick={() => { setDispensing(r); setForm({ inventory_item_id: "", quantity: Number(r.quantity ?? 0) }); }}>
                  <PackageCheck className="mr-1 h-3 w-3" /> Dispense
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!dispensing} onOpenChange={(o) => !o && setDispensing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Dispense refill</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Inventory item</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
                value={form.inventory_item_id}
                onChange={(e) => setForm({ ...form, inventory_item_id: e.target.value })}
              >
                <option value="">No stock link</option>
                {(inv.data ?? []).map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.quantity})</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispensing(null)}>Cancel</Button>
            <Button onClick={() => dispense.mutate()} disabled={dispense.isPending}>Dispense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

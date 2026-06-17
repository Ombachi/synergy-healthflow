import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WorkflowChip } from "@/components/workflow-chip";

interface Req { id: string; department: string | null; status: string; notes: string | null; created_at: string; requester_id: string }
interface ReqItem { id: string; request_id: string; item_id: string; qty_requested: number; qty_approved: number | null; qty_issued: number | null }
interface Item { id: string; name: string; quantity: number }
interface Profile { id: string; full_name: string | null }

// Store keeper inbox: review, approve/reject, and fulfill (with partial-fill).
export function StockRequestInbox() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const allowed = hasAnyRole(["store_keeper", "admin"]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [fulfilling, setFulfilling] = useState<Req | null>(null);
  const [fulfillQty, setFulfillQty] = useState<Record<string, number>>({});

  const reqs = useQuery({
    queryKey: ["sk-requests", filter],
    enabled: allowed,
    queryFn: async () => {
      let q = supabase.from("stock_requests" as never).select("*").order("created_at", { ascending: false });
      if (filter === "open") q = q.in("status", ["submitted", "approved", "partially_fulfilled"] as never);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as Req[]) ?? [];
    },
  });

  const reqItems = useQuery({
    queryKey: ["sk-request-items", (reqs.data ?? []).map((r) => r.id).join(",")],
    enabled: (reqs.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (reqs.data ?? []).map((r) => r.id);
      const { data, error } = await supabase.from("stock_request_items" as never).select("*").in("request_id", ids as never);
      if (error) throw error;
      return (data as unknown as ReqItem[]) ?? [];
    },
  });

  const itemIds = Array.from(new Set((reqItems.data ?? []).map((x) => x.item_id)));
  const items = useQuery({
    queryKey: ["sk-items", itemIds.join(",")],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items" as never).select("id, name, quantity").in("id", itemIds as never);
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
  });

  const requesterIds = Array.from(new Set((reqs.data ?? []).map((r) => r.requester_id)));
  const profiles = useQuery({
    queryKey: ["sk-profiles", requesterIds.join(",")],
    enabled: requesterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles" as never).select("id, full_name").in("id", requesterIds as never);
      if (error) throw error;
      return (data as unknown as Profile[]) ?? [];
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, approveAll }: { id: string; status: string; approveAll?: boolean }) => {
      if (approveAll) {
        const lines = (reqItems.data ?? []).filter((x) => x.request_id === id);
        for (const l of lines) {
          await supabase.from("stock_request_items" as never)
            .update({ qty_approved: l.qty_requested } as never).eq("id", l.id);
        }
      }
      const { error } = await supabase.from("stock_requests" as never).update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sk-requests"] });
      qc.invalidateQueries({ queryKey: ["sk-request-items"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fulfill = useMutation({
    mutationFn: async () => {
      if (!fulfilling) return;
      const lines = (reqItems.data ?? []).filter((x) => x.request_id === fulfilling.id);
      let totalIssued = 0; let totalApproved = 0;
      for (const l of lines) {
        const issue = Number(fulfillQty[l.id] ?? l.qty_approved ?? 0);
        const newIssued = (l.qty_issued ?? 0) + issue;
        totalIssued += newIssued;
        totalApproved += Number(l.qty_approved ?? l.qty_requested);
        if (issue > 0) {
          const item = items.data?.find((i) => i.id === l.item_id);
          if (item) {
            if (item.quantity < issue) throw new Error(`Insufficient stock for ${item.name} (have ${item.quantity})`);
            await supabase.from("inventory_items" as never)
              .update({ quantity: item.quantity - issue } as never).eq("id", item.id);
            await supabase.from("inventory_movements" as never).insert({
              inventory_item_id: item.id, change: -issue,
              reason: `Issued to ${fulfilling.department ?? "department"} (req ${fulfilling.id.slice(0,8)})`,
              by_user: user!.id,
            } as never);
          }
          await supabase.from("stock_request_items" as never)
            .update({ qty_issued: newIssued } as never).eq("id", l.id);
        }
      }
      const status = totalIssued >= totalApproved && totalApproved > 0 ? "fulfilled" : "partially_fulfilled";
      await supabase.from("stock_requests" as never).update({ status } as never).eq("id", fulfilling.id);
    },
    onSuccess: () => {
      setFulfilling(null); setFulfillQty({});
      qc.invalidateQueries({ queryKey: ["sk-requests"] });
      qc.invalidateQueries({ queryKey: ["sk-request-items"] });
      qc.invalidateQueries({ queryKey: ["sk-items"] });
      qc.invalidateQueries({ queryKey: ["store-items"] });
      toast.success("Issued from central store");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!allowed) return null;

  const itemName = (id: string) => items.data?.find((i) => i.id === id)?.name ?? id.slice(0, 8);
  const onHand = (id: string) => items.data?.find((i) => i.id === id)?.quantity ?? 0;
  const requesterName = (id: string) => profiles.data?.find((p) => p.id === id)?.full_name ?? "—";
  const lineFor = (rid: string) => (reqItems.data ?? []).filter((x) => x.request_id === rid);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <div>
          <div className="font-medium">Incoming stock requests</div>
          <div className="text-xs text-muted-foreground">Approve, reject, or fulfill (full or partial) requests from departments.</div>
        </div>
        <div className="flex gap-1 rounded border p-0.5 text-xs">
          {(["open", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded px-2 py-1 capitalize ${filter === f ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>{f}</button>
          ))}
        </div>
      </div>
      <div className="divide-y">
        {(reqs.data ?? []).length === 0 && <div className="p-3 text-xs text-muted-foreground">Nothing here.</div>}
        {reqs.data?.map((r) => {
          const lines = lineFor(r.id);
          return (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium capitalize">{r.department ?? "department"} · {requesterName(r.requester_id)}</div>
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <WorkflowChip status={r.status} />
              </div>
              <table className="mt-2 w-full text-xs">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="pb-1">Item</th><th>Requested</th><th>Approved</th><th>Issued</th><th>On hand</th></tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1">{itemName(l.item_id)}</td>
                      <td>{l.qty_requested}</td>
                      <td>{l.qty_approved ?? "—"}</td>
                      <td>{l.qty_issued ?? 0}</td>
                      <td className={onHand(l.item_id) < l.qty_requested ? "text-rose-600" : ""}>{onHand(l.item_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.notes && <div className="mt-1 text-xs italic text-muted-foreground">{r.notes}</div>}
              <div className="mt-2 flex justify-end gap-2">
                {r.status === "submitted" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: "rejected" })}>
                      <X className="h-3 w-3" /> Reject
                    </Button>
                    <Button size="sm" onClick={() => setStatus.mutate({ id: r.id, status: "approved", approveAll: true })}>
                      <Check className="h-3 w-3" /> Approve
                    </Button>
                  </>
                )}
                {(r.status === "approved" || r.status === "partially_fulfilled") && (
                  <Button size="sm" onClick={() => {
                    setFulfilling(r);
                    const init: Record<string, number> = {};
                    lines.forEach((l) => { init[l.id] = Math.max(0, (l.qty_approved ?? l.qty_requested) - (l.qty_issued ?? 0)); });
                    setFulfillQty(init);
                  }}><Truck className="h-3 w-3" /> Fulfill</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!fulfilling} onOpenChange={(v) => !v && setFulfilling(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Issue stock from central store</DialogTitle></DialogHeader>
          {fulfilling && (
            <div className="space-y-2">
              {lineFor(fulfilling.id).map((l) => {
                const remaining = (l.qty_approved ?? l.qty_requested) - (l.qty_issued ?? 0);
                return (
                  <div key={l.id} className="grid grid-cols-12 items-center gap-2 text-sm">
                    <div className="col-span-7">
                      <div className="font-medium">{itemName(l.item_id)}</div>
                      <div className="text-xs text-muted-foreground">Remaining to issue: {remaining} · on hand {onHand(l.item_id)}</div>
                    </div>
                    <div className="col-span-5">
                      <Input
                        type="number" min={0} max={Math.min(remaining, onHand(l.item_id))}
                        value={fulfillQty[l.id] ?? 0}
                        onChange={(e) => setFulfillQty({ ...fulfillQty, [l.id]: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => fulfill.mutate()} disabled={fulfill.isPending}>Confirm issue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

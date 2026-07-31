import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/audit-inventory")({
  component: AuditInventory,
});

interface Movement { id: string; item_id: string; qty: number; kind: string; created_at: string; notes: string | null; batch_id: string | null }
interface Item { id: string; name: string }
interface Batch { id: string; item_id: string; batch_no: string | null; expiry_date: string | null; qty_on_hand: number }
interface Writeoff { id: string; batch_id: string; qty: number; reason: string; created_at: string }

function AuditInventory() {
  const { hasRole, user } = useAuth();
  const allowed = hasRole("admin");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ batch_id: "", qty: 0, reason: "expired" });

  const items = useQuery({
    queryKey: ["audit-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items" as never).select("id, name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
    enabled: allowed,
  });

  const movements = useQuery({
    queryKey: ["audit-movements"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_movements" as never).select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data as unknown as Movement[]) ?? [];
    },
    enabled: allowed,
  });

  const batches = useQuery({
    queryKey: ["audit-batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_batches" as never).select("*").gt("qty_on_hand", 0).order("expiry_date", { nullsFirst: false });
      if (error) throw error;
      return (data as unknown as Batch[]) ?? [];
    },
    enabled: allowed,
  });

  const writeoffs = useQuery({
    queryKey: ["audit-writeoffs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("writeoffs" as never).select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data as unknown as Writeoff[]) ?? [];
    },
    enabled: allowed,
  });

  async function doWriteoff() {
    if (!form.batch_id || !form.qty) return toast.error("Pick batch and qty");
    const { error } = await supabase.from("writeoffs" as never).insert({
      batch_id: form.batch_id, qty: form.qty, reason: form.reason, approved_by: user?.id,
    } as never);
    if (error) return toast.error(error.message);
    const batch = batches.data?.find((b) => b.id === form.batch_id);
    if (batch) {
      await supabase.from("stock_batches" as never).update({ qty_on_hand: Math.max(0, batch.qty_on_hand - form.qty) } as never).eq("id", form.batch_id);
      await supabase.from("stock_movements" as never).insert({
        item_id: batch.item_id, batch_id: form.batch_id, qty: form.qty, kind: "writeoff", performed_by: user?.id,
      } as never);
    }
    toast.success("Write-off recorded");
    setOpen(false);
    setForm({ batch_id: "", qty: 0, reason: "expired" });
    qc.invalidateQueries({ queryKey: ["audit-writeoffs"] });
    qc.invalidateQueries({ queryKey: ["audit-batches"] });
    qc.invalidateQueries({ queryKey: ["audit-movements"] });
  }

  if (!allowed) return <p className="text-sm text-muted-foreground">Auditor access only.</p>;

  const expiredBatches = (batches.data ?? []).filter((b) => b.expiry_date && new Date(b.expiry_date) < new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Inventory audit</h1>
          <p className="text-sm text-muted-foreground">Stock movements, expiry, write-offs.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="destructive">Record write-off</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Write-off batch</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Batch</Label>
                <select className="w-full rounded border bg-background p-2 text-sm" value={form.batch_id} onChange={(e) => setForm({ ...form, batch_id: e.target.value })}>
                  <option value="">Pick batch…</option>
                  {batches.data?.map((b) => {
                    const item = items.data?.find((i) => i.id === b.item_id);
                    return <option key={b.id} value={b.id}>{item?.name} • {b.batch_no ?? "—"} • exp {b.expiry_date ?? "—"} • qty {b.qty_on_hand}</option>;
                  })}
                </select>
              </div>
              <div><Label>Quantity</Label><Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} /></div>
              <div>
                <Label>Reason</Label>
                <select className="w-full rounded border bg-background p-2 text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
                  <option value="expired">Expired</option>
                  <option value="damaged">Damaged</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <Button onClick={doWriteoff} className="w-full">Confirm write-off</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Movements (recent)</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{movements.data?.length ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-rose-600">Expired batches</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-rose-600">{expiredBatches.length}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Write-offs (recent)</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{writeoffs.data?.length ?? 0}</CardContent></Card>
      </div>

      {expiredBatches.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-rose-600">Expired batches still on hand</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expiredBatches.map((b) => {
                const item = items.data?.find((i) => i.id === b.item_id);
                return (
                  <div key={b.id} className="flex items-center justify-between rounded border border-rose-200 bg-rose-50 p-3 text-sm">
                    <div>
                      <div className="font-medium">{item?.name ?? b.item_id}</div>
                      <div className="text-xs text-muted-foreground">Batch {b.batch_no ?? "—"} • Expired {b.expiry_date}</div>
                    </div>
                    <span className="text-rose-700">{b.qty_on_hand} on hand</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Stock movements log</CardTitle></CardHeader>
        <CardContent>
          {movements.data?.length === 0 ? <p className="text-sm text-muted-foreground">No movements recorded.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-2">When</th><th>Item</th><th>Kind</th><th className="text-right">Qty</th></tr></thead>
              <tbody>
                {movements.data?.map((m) => {
                  const item = items.data?.find((i) => i.id === m.item_id);
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="py-2 text-xs">{new Date(m.created_at).toLocaleString("en-GB")}</td>
                      <td>{item?.name ?? m.item_id.slice(0, 8)}</td>
                      <td><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{m.kind}</span></td>
                      <td className="text-right">{m.qty}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent write-offs</CardTitle></CardHeader>
        <CardContent>
          {writeoffs.data?.length === 0 ? <p className="text-sm text-muted-foreground">No write-offs.</p> : (
            <div className="space-y-2">
              {writeoffs.data?.map((w) => (
                <div key={w.id} className="flex items-center justify-between rounded border p-3 text-sm">
                  <div>
                    <div className="font-medium">Batch {w.batch_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString("en-GB")} • {w.reason}</div>
                  </div>
                  <span>{w.qty}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

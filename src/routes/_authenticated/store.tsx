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
import { StockRequestInbox } from "@/components/stock-request-inbox";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/store")({
  component: () => <StoreDashboard />,
});

interface Batch { id: string; item_id: string; batch_no: string | null; expiry_date: string | null; qty_on_hand: number; location_id: string | null }
interface Item { id: string; name: string; quantity: number; reorder_threshold: number }
interface Location { id: string; name: string; kind: string }
interface GRN { id: string; received_at: string; notes: string | null; po_id: string | null }

function StoreDashboard() {
  const { hasAnyRole, user } = useAuth();
  const allowed = hasAnyRole(["admin", "store_keeper", "pharmacist"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ item_id: "", batch_no: "", expiry_date: "", qty: 0, unit_cost_cents: 0, location_id: "" });

  const items = useQuery({
    queryKey: ["store-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_items" as never).select("id, name, quantity, reorder_threshold").order("name");
      if (error) throw error;
      return (data as unknown as Item[]) ?? [];
    },
    enabled: allowed,
  });

  const batches = useQuery({
    queryKey: ["store-batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_batches" as never).select("*").gt("qty_on_hand", 0).order("expiry_date", { nullsFirst: false });
      if (error) throw error;
      return (data as unknown as Batch[]) ?? [];
    },
    enabled: allowed,
  });

  const locations = useQuery({
    queryKey: ["store-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_locations" as never).select("*").order("name");
      if (error) throw error;
      return (data as unknown as Location[]) ?? [];
    },
    enabled: allowed,
  });

  const grns = useQuery({
    queryKey: ["store-grns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("goods_received_notes" as never).select("*").order("received_at", { ascending: false }).limit(10);
      if (error) throw error;
      return (data as unknown as GRN[]) ?? [];
    },
    enabled: allowed,
  });

  async function receiveStock() {
    if (!form.item_id || !form.qty) return toast.error("Pick an item and quantity");
    const { data: grn, error: e1 } = await supabase.from("goods_received_notes" as never)
      .insert({ received_by: user?.id, notes: "Manual receipt" } as never).select().single();
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase.from("grn_items" as never).insert({
      grn_id: (grn as { id: string }).id,
      item_id: form.item_id,
      batch_no: form.batch_no || null,
      expiry_date: form.expiry_date || null,
      qty: form.qty,
      unit_cost_cents: form.unit_cost_cents,
      location_id: form.location_id || null,
    } as never);
    if (e2) return toast.error(e2.message);
    toast.success("Stock received");
    setOpen(false);
    setForm({ item_id: "", batch_no: "", expiry_date: "", qty: 0, unit_cost_cents: 0, location_id: "" });
    qc.invalidateQueries({ queryKey: ["store-items"] });
    qc.invalidateQueries({ queryKey: ["store-batches"] });
    qc.invalidateQueries({ queryKey: ["store-grns"] });
  }

  if (!allowed) return <p className="text-sm text-muted-foreground">Storekeeper access only.</p>;

  const lowStock = (items.data ?? []).filter((i) => i.quantity <= i.reorder_threshold);
  const expiringSoon = (batches.data ?? []).filter((b) => {
    if (!b.expiry_date) return false;
    const days = (new Date(b.expiry_date).getTime() - Date.now()) / 86400000;
    return days < 60;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Store</h1>
          <p className="text-sm text-muted-foreground">Receive goods, track batches, monitor expiry.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button>Receive stock</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Receive stock (GRN)</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Item</Label>
                <select className="w-full rounded border bg-background p-2 text-sm" value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                  <option value="">Select item…</option>
                  {items.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Batch no</Label><Input value={form.batch_no} onChange={(e) => setForm({ ...form, batch_no: e.target.value })} /></div>
                <div><Label>Expiry</Label><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
                <div><Label>Quantity</Label><Input type="number" value={form.qty} onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })} /></div>
                <div><Label>Unit cost (cents)</Label><Input type="number" value={form.unit_cost_cents} onChange={(e) => setForm({ ...form, unit_cost_cents: Number(e.target.value) })} /></div>
              </div>
              <div>
                <Label>Location</Label>
                <select className="w-full rounded border bg-background p-2 text-sm" value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
                  <option value="">No location</option>
                  {locations.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <Button onClick={receiveStock} className="w-full">Confirm receipt</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Items</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{items.data?.length ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Active batches</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{batches.data?.length ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-rose-600">Low stock</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-rose-600">{lowStock.length}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-amber-600">Expiring &lt; 60d</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-amber-600">{expiringSoon.length}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Batches on hand (FEFO order)</CardTitle></CardHeader>
        <CardContent>
          {batches.data?.length === 0 ? <p className="text-sm text-muted-foreground">No active batches.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground"><tr><th className="pb-2">Item</th><th>Batch</th><th>Expiry</th><th className="text-right">Qty</th></tr></thead>
              <tbody>
                {batches.data?.map((b) => {
                  const item = items.data?.find((i) => i.id === b.item_id);
                  const days = b.expiry_date ? (new Date(b.expiry_date).getTime() - Date.now()) / 86400000 : null;
                  return (
                    <tr key={b.id} className="border-t">
                      <td className="py-2">{item?.name ?? b.item_id}</td>
                      <td>{b.batch_no ?? "—"}</td>
                      <td className={days !== null && days < 60 ? "text-amber-600" : ""}>{b.expiry_date ?? "—"}</td>
                      <td className="text-right">{b.qty_on_hand}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent GRNs</CardTitle></CardHeader>
        <CardContent>
          {grns.data?.length === 0 ? <p className="text-sm text-muted-foreground">No goods received yet.</p> : (
            <div className="space-y-2">
              {grns.data?.map((g) => (
                <div key={g.id} className="flex items-center justify-between rounded border p-3 text-sm">
                  <div>
                    <div className="font-medium">GRN {g.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(g.received_at).toLocaleString("en-GB")}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{g.notes ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Incoming stock requests from lab/pharmacy departments */}
      <StockRequestInbox />
    </div>
  );
}

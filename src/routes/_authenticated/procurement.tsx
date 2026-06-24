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

export const Route = createFileRoute("/_authenticated/procurement")({
  component: ProcurementDashboard,
});

interface Supplier { id: string; name: string; email: string | null; phone: string | null; active: boolean }
interface PO { id: string; supplier_id: string; status: string; expected_at: string | null; total_cents: number; created_at: string }
interface Request { id: string; department: string | null; status: string; created_at: string; requester_id: string }

function ProcurementDashboard() {
  const { hasRole, user } = useAuth();
  const allowed = hasRole("admin") || hasRole("procurement");
  const qc = useQueryClient();
  const [openSupplier, setOpenSupplier] = useState(false);
  const [openPO, setOpenPO] = useState(false);
  const [supplier, setSupplier] = useState({ name: "", email: "", phone: "", address: "" });
  const [po, setPO] = useState({ supplier_id: "", expected_at: "", notes: "" });

  const suppliers = useQuery({
    queryKey: ["proc-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers" as never).select("*").order("name");
      if (error) throw error;
      return (data as unknown as Supplier[]) ?? [];
    },
    enabled: allowed,
  });

  const pos = useQuery({
    queryKey: ["proc-pos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_orders" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as PO[]) ?? [];
    },
    enabled: allowed,
  });

  const requests = useQuery({
    queryKey: ["proc-requests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_requests" as never).select("*").in("status", ["requested", "approved"]).order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Request[]) ?? [];
    },
    enabled: allowed,
  });

  async function addSupplier() {
    if (!supplier.name) return toast.error("Name required");
    const { error } = await supabase.from("suppliers" as never).insert(supplier as never);
    if (error) return toast.error(error.message);
    toast.success("Supplier added");
    setOpenSupplier(false);
    setSupplier({ name: "", email: "", phone: "", address: "" });
    qc.invalidateQueries({ queryKey: ["proc-suppliers"] });
  }

  async function createPO() {
    if (!po.supplier_id) return toast.error("Pick supplier");
    const { error } = await supabase.from("purchase_orders" as never).insert({
      supplier_id: po.supplier_id,
      expected_at: po.expected_at || null,
      notes: po.notes || null,
      created_by: user?.id,
      status: "sent",
    } as never);
    if (error) return toast.error(error.message);
    toast.success("PO created");
    setOpenPO(false);
    setPO({ supplier_id: "", expected_at: "", notes: "" });
    qc.invalidateQueries({ queryKey: ["proc-pos"] });
  }

  if (!allowed) return <p className="text-sm text-muted-foreground">Procurement access only.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Procurement</h1>
          <p className="text-sm text-muted-foreground">Suppliers, purchase orders, stock requests.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={openSupplier} onOpenChange={setOpenSupplier}>
            <DialogTrigger asChild><Button variant="outline">Add supplier</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New supplier</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={supplier.name} onChange={(e) => setSupplier({ ...supplier, name: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={supplier.email} onChange={(e) => setSupplier({ ...supplier, email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={supplier.phone} onChange={(e) => setSupplier({ ...supplier, phone: e.target.value })} /></div>
                <div><Label>Address</Label><Input value={supplier.address} onChange={(e) => setSupplier({ ...supplier, address: e.target.value })} /></div>
                <Button onClick={addSupplier} className="w-full">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={openPO} onOpenChange={setOpenPO}>
            <DialogTrigger asChild><Button>Create PO</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Supplier</Label>
                  <select className="w-full rounded border bg-background p-2 text-sm" value={po.supplier_id} onChange={(e) => setPO({ ...po, supplier_id: e.target.value })}>
                    <option value="">Pick supplier…</option>
                    {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div><Label>Expected by</Label><Input type="date" value={po.expected_at} onChange={(e) => setPO({ ...po, expected_at: e.target.value })} /></div>
                <div><Label>Notes</Label><Input value={po.notes} onChange={(e) => setPO({ ...po, notes: e.target.value })} /></div>
                <Button onClick={createPO} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm">Suppliers</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{suppliers.data?.length ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Open POs</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{pos.data?.filter((p) => ["draft", "sent", "partial"].includes(p.status)).length ?? 0}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pending requests</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{requests.data?.length ?? 0}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Purchase orders</CardTitle></CardHeader>
        <CardContent>
          {pos.data?.length === 0 ? <p className="text-sm text-muted-foreground">No POs yet.</p> : (
            <div className="space-y-2">
              {pos.data?.map((p) => {
                const s = suppliers.data?.find((x) => x.id === p.supplier_id);
                return (
                  <div key={p.id} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div>
                      <div className="font-medium">{s?.name ?? "Unknown supplier"}</div>
                      <div className="text-xs text-muted-foreground">Expected: {p.expected_at ?? "—"}</div>
                    </div>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">{p.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Suppliers</CardTitle></CardHeader>
        <CardContent>
          {suppliers.data?.length === 0 ? <p className="text-sm text-muted-foreground">No suppliers yet.</p> : (
            <div className="grid gap-2 md:grid-cols-2">
              {suppliers.data?.map((s) => (
                <div key={s.id} className="rounded border p-3 text-sm">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.email ?? "—"} • {s.phone ?? "—"}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

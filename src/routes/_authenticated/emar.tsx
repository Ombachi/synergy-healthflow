import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pill, Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RoleGate } from "@/components/role-gate";
import { AdmissionPicker } from "@/components/admission-picker";

export const Route = createFileRoute("/_authenticated/emar")({
  component: () => <RoleGate path="/emar"><EmarPage /></RoleGate>,
});

interface Med { id: string; medication: string; dose: string; route: string; frequency: string; status: string; prn: boolean; indication: string | null; start_at: string; stop_at: string | null }
interface Adm { id: string; administered_at: string; status: string; dose_given: string | null; reason_not_given: string | null }

function EmarPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [adm, setAdm] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [order, setOrder] = useState({ medication: "", dose: "", route: "po", frequency: "bd", indication: "", prn: false });
  const [give, setGive] = useState<{ orderId: string; status: string; note: string; dose: string } | null>(null);

  const meds = useQuery({
    queryKey: ["med-orders", adm], enabled: !!adm,
    queryFn: async () => {
      const { data } = await supabase.from("medication_orders" as never).select("*").eq("admission_id", adm).order("created_at", { ascending: false });
      return (data as unknown as Med[]) ?? [];
    },
  });
  const admins = useQuery({
    queryKey: ["mar-admins", adm], enabled: !!adm && (meds.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (meds.data ?? []).map((m) => m.id);
      const { data } = await supabase.from("mar_administrations" as never).select("*, medication_order_id").in("medication_order_id", ids as never).order("administered_at", { ascending: false });
      return (data as unknown as (Adm & { medication_order_id: string })[]) ?? [];
    },
  });

  const createOrder = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("medication_orders" as never).insert({
        admission_id: adm, prescribed_by: user?.id, ...order, indication: order.indication || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Medication ordered"); setOrderOpen(false); setOrder({ medication: "", dose: "", route: "po", frequency: "bd", indication: "", prn: false }); qc.invalidateQueries({ queryKey: ["med-orders", adm] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const record = useMutation({
    mutationFn: async () => {
      if (!give) return;
      const { error } = await supabase.from("mar_administrations" as never).insert({
        medication_order_id: give.orderId, administered_by: user?.id, status: give.status,
        dose_given: give.dose || null, reason_not_given: give.status === "given" ? null : (give.note || null),
        notes: give.status === "given" ? (give.note || null) : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recorded"); setGive(null); qc.invalidateQueries({ queryKey: ["mar-admins", adm] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const discontinue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("medication_orders" as never).update({ status: "discontinued", stop_at: new Date().toISOString() } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Discontinued"); qc.invalidateQueries({ queryKey: ["med-orders", adm] }); },
  });

  const adminsFor = (id: string) => (admins.data ?? []).filter((a) => a.medication_order_id === id).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Pill className="h-6 w-6" /> Electronic MAR</h1>
          <p className="text-sm text-muted-foreground">Inpatient medication orders and administration record.</p>
        </div>
        {adm && (
          <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />New order</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Order medication</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Medication</Label><Input value={order.medication} onChange={(e) => setOrder((f) => ({ ...f, medication: e.target.value }))} /></div>
                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Dose</Label><Input value={order.dose} onChange={(e) => setOrder((f) => ({ ...f, dose: e.target.value }))} placeholder="500mg" /></div>
                  <div>
                    <Label>Route</Label>
                    <Select value={order.route} onValueChange={(v) => setOrder((f) => ({ ...f, route: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["po", "iv", "im", "sc", "pr", "top", "neb", "other"].map((r) => <SelectItem key={r} value={r}>{r.toUpperCase()}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Frequency</Label>
                    <Select value={order.frequency} onValueChange={(v) => setOrder((f) => ({ ...f, frequency: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{["od", "bd", "tds", "qds", "q4h", "q6h", "q8h", "q12h", "prn", "stat"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Indication</Label><Input value={order.indication} onChange={(e) => setOrder((f) => ({ ...f, indication: e.target.value }))} /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={order.prn} onChange={(e) => setOrder((f) => ({ ...f, prn: e.target.checked }))} /> PRN (as needed)</label>
              </div>
              <DialogFooter><Button disabled={!order.medication || !order.dose} onClick={() => createOrder.mutate()}>Order</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card><CardContent className="p-4"><AdmissionPicker value={adm} onChange={setAdm} /></CardContent></Card>

      {adm && (
        <div className="space-y-3">
          {(meds.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No medications ordered.</p>}
          {(meds.data ?? []).map((m) => (
            <Card key={m.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    {m.medication} <Badge variant="outline">{m.dose}</Badge>
                    <Badge variant="secondary" className="uppercase">{m.route}</Badge>
                    <Badge variant="secondary">{m.frequency}</Badge>
                    {m.prn && <Badge className="bg-amber-500">PRN</Badge>}
                    {m.status !== "active" && <Badge variant="outline" className="capitalize">{m.status}</Badge>}
                  </span>
                  {m.status === "active" && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setGive({ orderId: m.id, status: "given", note: "", dose: m.dose })}><Check className="mr-1 h-4 w-4" />Give</Button>
                      <Button size="sm" variant="outline" onClick={() => setGive({ orderId: m.id, status: "held", note: "", dose: "" })}>Hold</Button>
                      <Button size="sm" variant="ghost" onClick={() => discontinue.mutate(m.id)}><X className="h-4 w-4" /></Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs">
                {m.indication && <div className="text-muted-foreground mb-2">{m.indication}</div>}
                <div className="space-y-1">
                  {adminsFor(m.id).map((a) => (
                    <div key={a.id} className="flex justify-between border-b py-1">
                      <span><Badge variant={a.status === "given" ? "default" : "outline"} className="capitalize">{a.status}</Badge> {a.dose_given && `· ${a.dose_given}`} {a.reason_not_given && `· ${a.reason_not_given}`}</span>
                      <span className="text-muted-foreground">{new Date(a.administered_at).toLocaleString("en-GB")}</span>
                    </div>
                  ))}
                  {adminsFor(m.id).length === 0 && <p className="text-muted-foreground">No administrations yet.</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!give} onOpenChange={(o) => !o && setGive(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record administration</DialogTitle></DialogHeader>
          {give && (
            <div className="grid gap-3">
              <div>
                <Label>Status</Label>
                <Select value={give.status} onValueChange={(v) => setGive({ ...give, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["given", "held", "refused", "missed", "self_administered"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {give.status === "given" && <div><Label>Dose given</Label><Input value={give.dose} onChange={(e) => setGive({ ...give, dose: e.target.value })} /></div>}
              <div><Label>Notes {give.status !== "given" && "/ reason"}</Label><Textarea value={give.note} onChange={(e) => setGive({ ...give, note: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter><Button onClick={() => record.mutate()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

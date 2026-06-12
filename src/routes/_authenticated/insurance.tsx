import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/insurance")({ component: InsurancePage });

interface Policy { id: string; patient_id: string; insurer: string; member_number: string; scheme: string | null; valid_from: string | null; valid_to: string | null; active: boolean }
interface Claim { id: string; invoice_id: string; policy_id: string | null; preauth_code: string | null; status: string; approved_amount_cents: number | null; notes: string | null; created_at: string }
interface Invoice { id: string; patient_id: string; total_cents: number; status: string }
interface Patient { id: string; full_name: string }

const money = (c: number | null) => c == null ? "—" : (c/100).toLocaleString(undefined, { style: "currency", currency: "KES" });

function InsurancePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [polOpen, setPolOpen] = useState(false);
  const [polForm, setPolForm] = useState({ patient_id: "", insurer: "", member_number: "", scheme: "" });
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimForm, setClaimForm] = useState({ invoice_id: "", policy_id: "", preauth_code: "", notes: "" });

  const policies = useQuery({
    queryKey: ["policies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_policies" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Policy[]) ?? [];
    },
  });
  const claims = useQuery({
    queryKey: ["claims"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_claims" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Claim[]) ?? [];
    },
  });
  const invoices = useQuery({
    queryKey: ["ins-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices" as never).select("id, patient_id, total_cents, status")
        .neq("status", "paid").neq("status", "void");
      if (error) throw error;
      return (data as unknown as Invoice[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["ins-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name").order("full_name");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  const createPolicy = useMutation({
    mutationFn: async () => {
      if (!polForm.patient_id || !polForm.insurer || !polForm.member_number) throw new Error("Fill all required");
      const { error } = await supabase.from("insurance_policies" as never).insert(polForm as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setPolOpen(false); setPolForm({ patient_id: "", insurer: "", member_number: "", scheme: "" });
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createClaim = useMutation({
    mutationFn: async () => {
      if (!claimForm.invoice_id) throw new Error("Pick an invoice");
      const { error } = await supabase.from("insurance_claims" as never).insert({
        invoice_id: claimForm.invoice_id,
        policy_id: claimForm.policy_id || null,
        preauth_code: claimForm.preauth_code || null,
        notes: claimForm.notes || null,
        processed_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setClaimOpen(false); setClaimForm({ invoice_id: "", policy_id: "", preauth_code: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["claims"] });
      toast.success("Claim filed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateClaim = useMutation({
    mutationFn: async ({ id, status, amount }: { id: string; status: string; amount?: number }) => {
      const patch: Record<string, unknown> = { status, processed_by: user!.id };
      if (amount != null) patch.approved_amount_cents = amount;
      const { error } = await supabase.from("insurance_claims" as never).update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["claims"] }); toast.success("Claim updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Shield className="h-6 w-6 text-primary" /> Insurance</h1>
        <p className="text-sm text-muted-foreground">Policies, pre-authorisations, and claim status.</p>
      </div>

      <Tabs defaultValue="claims">
        <TabsList>
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="claims" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" />New claim</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>File insurance claim</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Invoice</Label>
                    <Select value={claimForm.invoice_id} onValueChange={(v) => setClaimForm({ ...claimForm, invoice_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{invoices.data?.map((i) => <SelectItem key={i.id} value={i.id}>{patientName(i.patient_id)} — {money(i.total_cents)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Policy</Label>
                    <Select value={claimForm.policy_id} onValueChange={(v) => setClaimForm({ ...claimForm, policy_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                      <SelectContent>{policies.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.insurer} · {p.member_number}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Pre-auth code</Label><Input value={claimForm.preauth_code} onChange={(e) => setClaimForm({ ...claimForm, preauth_code: e.target.value })} /></div>
                  <div><Label>Notes</Label><Textarea rows={2} value={claimForm.notes} onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => createClaim.mutate()} disabled={createClaim.isPending}>File</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="divide-y">
              {claims.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No claims.</div>}
              {claims.data?.map((c) => {
                const inv = invoices.data?.find((i) => i.id === c.invoice_id);
                return (
                  <div key={c.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <div>
                      <div className="font-medium">{inv ? patientName(inv.patient_id) : "—"}</div>
                      <div className="text-xs text-muted-foreground">Pre-auth: {c.preauth_code ?? "—"} · {new Date(c.created_at).toLocaleString()}</div>
                      {c.notes && <div className="mt-1 text-xs italic">{c.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right text-xs">
                        <div>Invoice: {money(inv?.total_cents ?? 0)}</div>
                        {c.approved_amount_cents != null && <div className="text-green-700">Approved: {money(c.approved_amount_cents)}</div>}
                      </div>
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        c.status === "approved" ? "bg-green-500/10 text-green-700" :
                        c.status === "rejected" ? "bg-rose-500/10 text-rose-700" :
                        c.status === "paid" ? "bg-blue-500/10 text-blue-700" :
                        "bg-amber-500/10 text-amber-700"
                      }`}>{c.status}</span>
                      {c.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => {
                            const a = prompt("Approved amount (KES)?");
                            if (a) updateClaim.mutate({ id: c.id, status: "approved", amount: Math.round(parseFloat(a) * 100) });
                          }}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => updateClaim.mutate({ id: c.id, status: "rejected" })}>Reject</Button>
                        </div>
                      )}
                      {c.status === "approved" && (
                        <Button size="sm" variant="outline" onClick={() => updateClaim.mutate({ id: c.id, status: "paid" })}>Mark paid</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="policies" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={polOpen} onOpenChange={setPolOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" />Add policy</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add insurance policy</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Patient</Label>
                    <Select value={polForm.patient_id} onValueChange={(v) => setPolForm({ ...polForm, patient_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{patients.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Insurer</Label><Input value={polForm.insurer} onChange={(e) => setPolForm({ ...polForm, insurer: e.target.value })} /></div>
                  <div><Label>Member number</Label><Input value={polForm.member_number} onChange={(e) => setPolForm({ ...polForm, member_number: e.target.value })} /></div>
                  <div><Label>Scheme</Label><Input value={polForm.scheme} onChange={(e) => setPolForm({ ...polForm, scheme: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => createPolicy.mutate()} disabled={createPolicy.isPending}>Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="divide-y">
              {policies.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No policies.</div>}
              {policies.data?.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <div className="font-medium">{patientName(p.patient_id)}</div>
                    <div className="text-xs text-muted-foreground">{p.insurer} · {p.member_number} · {p.scheme ?? "—"}</div>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs ${p.active ? "bg-green-500/10 text-green-700" : "bg-muted text-muted-foreground"}`}>{p.active ? "active" : "inactive"}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { Pager, usePager } from "@/components/pager";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, Plus, BedDouble } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/admissions")({
  component: () => <RoleGate path="/admissions"><AdmissionsPage /></RoleGate>,
});

interface Req {
  id: string; patient_id: string; reason: string; requested_bed_type: string; acuity: string | null;
  isolation_required: boolean; status: string; preferred_ward_id: string | null; created_at: string;
  admission_id: string | null;
}

function AdmissionsPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    patient_id: "", reason: "", requested_bed_type: "general", acuity: "stable",
    isolation_required: false, preferred_ward_id: "", notes: "",
  });

  const requests = useQuery({
    queryKey: ["adm-req"],
    queryFn: async () => {
      const { data } = await supabase.from("admission_requests" as never).select("*").order("created_at", { ascending: false });
      const pendingPager = usePager(pending, 10);

  return (data as unknown as Req[]) ?? [];
    },
  });
  const wards = useQuery({
    queryKey: ["wards"],
    queryFn: async () => {
      const { data } = await supabase.from("wards" as never).select("id, name").order("name");
      const pendingPager = usePager(pending, 10);

  return (data as unknown as { id: string; name: string }[]) ?? [];
    },
  });
  const beds = useQuery({
    queryKey: ["beds-free"],
    queryFn: async () => {
      const { data } = await supabase.from("beds" as never).select("id, code, ward_id, status, bed_type").eq("status", "free");
      const pendingPager = usePager(pending, 10);

  return (data as unknown as { id: string; code: string; ward_id: string; status: string; bed_type: string }[]) ?? [];
    },
  });
  const patientSearch = useQuery({
    queryKey: ["patient-search", search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never).select("id, full_name, medical_record_number")
        .or(`full_name.ilike.%${search}%,medical_record_number.ilike.%${search}%`).limit(10);
      const pendingPager = usePager(pending, 10);

  return (data as unknown as { id: string; full_name: string; medical_record_number: string | null }[]) ?? [];
    },
  });
  const pIds = Array.from(new Set((requests.data ?? []).map((r) => r.patient_id)));
  const patients = useQuery({
    queryKey: ["adm-req-patients", pIds.join(",")],
    enabled: pIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never).select("id, full_name").in("id", pIds as never);
      const pendingPager = usePager(pending, 10);

  return (data as unknown as { id: string; full_name: string }[]) ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("admission_requests" as never).insert({
        patient_id: form.patient_id, reason: form.reason,
        requested_bed_type: form.requested_bed_type, acuity: form.acuity,
        isolation_required: form.isolation_required,
        preferred_ward_id: form.preferred_ward_id || null,
        notes: form.notes || null, requested_by: user?.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Admission requested");
      setOpen(false); setSearch("");
      setForm({ patient_id: "", reason: "", requested_bed_type: "general", acuity: "stable", isolation_required: false, preferred_ward_id: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["adm-req"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allocate = useMutation({
    mutationFn: async (r: Req) => {
      // pick first free bed: preferred ward if set, matching bed_type
      const candidates = (beds.data ?? []).filter((b) => {
        if (r.preferred_ward_id && b.ward_id !== r.preferred_ward_id) return false;
        if (r.requested_bed_type && b.bed_type !== r.requested_bed_type) return false;
        return true;
      });
      const bed = candidates[0] ?? (beds.data ?? []).find((b) => !r.preferred_ward_id || b.ward_id === r.preferred_ward_id) ?? (beds.data ?? [])[0];
      if (!bed) throw new Error("No free beds available");
      const { data: adm, error: aErr } = await supabase.from("admissions" as never).insert({
        patient_id: r.patient_id, bed_id: bed.id, admission_reason: r.reason,
        acuity: r.acuity, isolation_required: r.isolation_required, admitted_by: user?.id,
      } as never).select("id").single();
      if (aErr) throw aErr;
      const admId = (adm as { id: string }).id;
      const { error: uErr } = await supabase.from("admission_requests" as never)
        .update({ status: "allocated", admission_id: admId } as never).eq("id", r.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      toast.success("Bed allocated & patient admitted");
      qc.invalidateQueries({ queryKey: ["adm-req"] });
      qc.invalidateQueries({ queryKey: ["beds-free"] });
      qc.invalidateQueries({ queryKey: ["haims-active-admissions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admission_requests" as never).update({ status: "cancelled" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cancelled"); qc.invalidateQueries({ queryKey: ["adm-req"] }); },
  });

  const pName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? id.slice(0, 8);
  const pending = (requests.data ?? []).filter((r) => r.status === "pending");

  const pendingPager = usePager(pending, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><ClipboardList className="h-6 w-6" /> Admission requests</h1>
          <p className="text-sm text-muted-foreground">Request an admission, then allocate a bed to activate the inpatient stay.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" />New request</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Request admission</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Patient</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or MRN" />
                <div className="mt-2 max-h-40 space-y-1 overflow-auto">
                  {(patientSearch.data ?? []).map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { setForm((f) => ({ ...f, patient_id: p.id })); setSearch(p.full_name); }}
                      className={`block w-full rounded border p-2 text-left text-sm ${form.patient_id === p.id ? "bg-primary/10" : ""}`}>
                      {p.full_name} <span className="text-muted-foreground">· {p.medical_record_number ?? "—"}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Bed type</Label>
                  <Select value={form.requested_bed_type} onValueChange={(v) => setForm((f) => ({ ...f, requested_bed_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="icu">ICU</SelectItem>
                      <SelectItem value="hdu">HDU</SelectItem>
                      <SelectItem value="isolation">Isolation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Acuity</Label>
                  <Select value={form.acuity} onValueChange={(v) => setForm((f) => ({ ...f, acuity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stable">Stable</SelectItem>
                      <SelectItem value="guarded">Guarded</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Preferred ward</Label>
                <Select value={form.preferred_ward_id} onValueChange={(v) => setForm((f) => ({ ...f, preferred_ward_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>{(wards.data ?? []).map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isolation_required} onChange={(e) => setForm((f) => ({ ...f, isolation_required: e.target.checked }))} />
                Isolation required
              </label>
              <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <DialogFooter><Button disabled={!form.patient_id || !form.reason} onClick={() => create.mutate()}>Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pending ({pending.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {pending.length === 0 && <p className="text-sm text-muted-foreground">No pending requests.</p>}
          {pendingPager.slice.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded border p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {pName(r.patient_id)}
                  <Badge variant="outline" className="capitalize">{r.requested_bed_type}</Badge>
                  {r.acuity && <Badge variant="secondary" className="capitalize">{r.acuity}</Badge>}
                  {r.isolation_required && <Badge className="bg-amber-500">Isolation</Badge>}
                </div>
                <div className="text-xs text-muted-foreground truncate">{r.reason}</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => allocate.mutate(r)} disabled={allocate.isPending}>
                  <BedDouble className="mr-1 h-4 w-4" />Allocate bed
                </Button>
                <Button size="sm" variant="ghost" onClick={() => cancel.mutate(r.id)}>Cancel</Button>
              </div>
            </div>
          ))}
          <Pager {...pendingPager} label="pending requests" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recent requests</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {(requests.data ?? []).filter((r) => r.status !== "pending").slice(0, 20).map((r) => (
            <div key={r.id} className="flex justify-between border-b py-1">
              <span>{pName(r.patient_id)} · {r.reason}</span>
              <Badge variant="outline" className="capitalize">{r.status}</Badge>
            </div>
          ))}
          <Pager {...pendingPager} label="pending requests" />
        </CardContent>
      </Card>
    </div>
  );
}

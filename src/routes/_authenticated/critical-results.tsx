import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, BellRing, Check, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/critical-results")({
  head: () => ({
    meta: [
      { title: "Critical Lab Results Register | Litu Vault" },
      { name: "description", content: "Register of all critical laboratory results with acknowledgement, clinician notification and closure tracking." },
      { property: "og:title", content: "Critical Lab Results Register | Litu Vault" },
      { property: "og:description", content: "Track, acknowledge and close every critical laboratory result." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <RoleGate path="/critical-results">
      <CriticalResults />
    </RoleGate>
  ),
});

interface Alert {
  id: string;
  order_id: string | null;
  patient_id: string | null;
  parameter_name: string;
  value_text: string | null;
  units: string | null;
  reference_range: string | null;
  abnormal_flag: string;
  detected_at: string;
  status: string;
  acknowledged_at: string | null;
  notified_to: string | null;
  notified_at: string | null;
  closed_at: string | null;
  notes: string | null;
}
interface Patient { id: string; full_name: string; medical_record_number: string | null }
interface Order { id: string; test_id: string }
interface Test { id: string; name: string }

const STATUSES = ["pending", "acknowledged", "notified", "closed"] as const;
type Status = (typeof STATUSES)[number] | "all";

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—");

function CriticalResults() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canAct = hasAnyRole(["lab_tech", "doctor", "nurse", "admin"]);
  const [status, setStatus] = useState<Status>("pending");
  const [search, setSearch] = useState("");
  const [notifyFor, setNotifyFor] = useState<Alert | null>(null);
  const [notifyTo, setNotifyTo] = useState("");
  const [notifyNotes, setNotifyNotes] = useState("");

  const alerts = useQuery({
    queryKey: ["critical-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("critical_result_alerts" as never)
        .select("*")
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Alert[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["cr-patients"],
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never).select("id, full_name, medical_record_number");
      return (data as unknown as Patient[]) ?? [];
    },
  });
  const orders = useQuery({
    queryKey: ["cr-orders"],
    queryFn: async () => {
      const { data } = await supabase.from("lab_orders" as never).select("id, test_id");
      return (data as unknown as Order[]) ?? [];
    },
  });
  const tests = useQuery({
    queryKey: ["cr-tests"],
    queryFn: async () => {
      const { data } = await supabase.from("lab_tests_catalog" as never).select("id, name");
      return (data as unknown as Test[]) ?? [];
    },
  });

  const patientOf = (id: string | null) => patients.data?.find((p) => p.id === id);
  const testOf = (orderId: string | null) => {
    const o = orders.data?.find((x) => x.id === orderId);
    return tests.data?.find((t) => t.id === o?.test_id)?.name ?? "—";
  };

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("critical_result_alerts" as never).update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["critical-alerts"] });
      toast.success("Critical result updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const counts = useMemo(() => {
    const list = alerts.data ?? [];
    return {
      all: list.length,
      pending: list.filter((a) => a.status === "pending").length,
      acknowledged: list.filter((a) => a.status === "acknowledged").length,
      notified: list.filter((a) => a.status === "notified").length,
      closed: list.filter((a) => a.status === "closed").length,
    };
  }, [alerts.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (alerts.data ?? []).filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      const p = patientOf(a.patient_id);
      return (
        a.parameter_name.toLowerCase().includes(q) ||
        (p?.full_name ?? "").toLowerCase().includes(q) ||
        (p?.medical_record_number ?? "").toLowerCase().includes(q) ||
        testOf(a.order_id).toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.data, status, search, patients.data, orders.data, tests.data]);

  function submitNotify() {
    if (!notifyFor) return;
    update.mutate({
      id: notifyFor.id,
      patch: {
        status: "notified",
        notified_to: notifyTo || null,
        notified_at: new Date().toISOString(),
        notes: notifyNotes || notifyFor.notes,
      },
    });
    setNotifyFor(null);
    setNotifyTo("");
    setNotifyNotes("");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <AlertTriangle className="h-6 w-6 text-destructive" /> Critical results
          </h1>
          <p className="text-sm text-muted-foreground">
            Every critical laboratory value is captured here until it is acknowledged, communicated and closed.
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Patient, MRN, test or analyte" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(["pending", "acknowledged", "notified", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-lg border p-3 text-left transition ${status === s ? "border-primary bg-accent" : "bg-card hover:bg-accent/40"}`}
          >
            <div className="text-xs uppercase text-muted-foreground">{s}</div>
            <div className={`text-2xl font-semibold ${s === "pending" && counts.pending > 0 ? "text-destructive" : ""}`}>{counts[s]}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-2 text-xs">
        {(["all", ...STATUSES] as Status[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 capitalize ${status === s ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Detected</th>
              <th className="px-3 py-2">Patient</th>
              <th className="px-3 py-2">Test</th>
              <th className="px-3 py-2">Analyte</th>
              <th className="px-3 py-2">Value</th>
              <th className="px-3 py-2">Flag</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Communication</th>
              {canAct && <th className="px-3 py-2 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {alerts.isLoading && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
            )}
            {!alerts.isLoading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">No critical results in this view.</td></tr>
            )}
            {rows.map((a) => {
              const p = patientOf(a.patient_id);
              return (
                <tr key={a.id} className={`border-t ${a.status === "pending" ? "bg-destructive/5" : ""}`}>
                  <td className="px-3 py-2 whitespace-nowrap">{dt(a.detected_at)}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{p?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{p?.medical_record_number ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">{testOf(a.order_id)}</td>
                  <td className="px-3 py-2 font-medium">{a.parameter_name}</td>
                  <td className="px-3 py-2 font-mono text-destructive">
                    {a.value_text ?? "—"} {a.units ?? ""}
                    <div className="text-[11px] font-sans text-muted-foreground">Ref {a.reference_range ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2 font-semibold uppercase text-destructive">{a.abnormal_flag}</td>
                  <td className="px-3 py-2 capitalize">{a.status}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {a.acknowledged_at && <div>Ack {dt(a.acknowledged_at)}</div>}
                    {a.notified_at && <div>Notified {a.notified_to ?? "clinician"} · {dt(a.notified_at)}</div>}
                    {a.closed_at && <div>Closed {dt(a.closed_at)}</div>}
                    {a.notes && <div className="italic">{a.notes}</div>}
                  </td>
                  {canAct && (
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {a.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => update.mutate({ id: a.id, patch: { status: "acknowledged", acknowledged_by: user?.id ?? null, acknowledged_at: new Date().toISOString() } })}>
                            <Check className="h-3.5 w-3.5" /> Acknowledge
                          </Button>
                        )}
                        {a.status !== "closed" && (
                          <Button size="sm" variant="outline" onClick={() => { setNotifyFor(a); setNotifyTo(a.notified_to ?? ""); setNotifyNotes(a.notes ?? ""); }}>
                            <BellRing className="h-3.5 w-3.5" /> Notify
                          </Button>
                        )}
                        {a.status !== "closed" && (
                          <Button size="sm" onClick={() => update.mutate({ id: a.id, patch: { status: "closed", closed_at: new Date().toISOString() } })}>
                            <ShieldCheck className="h-3.5 w-3.5" /> Close
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!notifyFor} onOpenChange={(o) => !o && setNotifyFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record clinician notification</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-2 text-sm">
              {notifyFor?.parameter_name}: <span className="font-mono text-destructive">{notifyFor?.value_text}</span> ({notifyFor?.abnormal_flag})
            </div>
            <div>
              <Label>Notified to</Label>
              <Input value={notifyTo} onChange={(e) => setNotifyTo(e.target.value)} placeholder="e.g. Dr Dan · phone 19:40" />
            </div>
            <div>
              <Label>Notes / read-back</Label>
              <Textarea value={notifyNotes} onChange={(e) => setNotifyNotes(e.target.value)} placeholder="Result read back and confirmed…" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitNotify}>Save notification</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

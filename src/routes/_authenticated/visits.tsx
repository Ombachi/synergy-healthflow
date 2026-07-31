import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/visits")({
  component: VisitsRouteShell,
});

interface Visit {
  id: string;
  patient_id: string;
  status: string;
  reason: string | null;
  chief_complaint: string | null;
  triage_level: string | null;
  opened_at: string;
  closed_at: string | null;
}

interface PatientOpt {
  id: string;
  full_name: string;
  medical_record_number: string | null;
}

function VisitsRouteShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname !== "/visits" && pathname !== "/visits/") return <Outlet />;
  return <Visits />;
}

function Visits() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, hasAnyRole } = useAuth();
  const canOpen = hasAnyRole(["receptionist", "nurse", "admin"]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");


  const visits = useQuery({
    queryKey: ["visits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits" as never)
        .select("id, patient_id, status, reason, chief_complaint, triage_level, opened_at, closed_at")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });

  const patients = useQuery({
    queryKey: ["patients-opt"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name, medical_record_number")
        .order("full_name");
      if (error) throw error;
      return (data as unknown as PatientOpt[]) ?? [];
    },
  });

  const patientById = (id: string) => patients.data?.find((p) => p.id === id);
  const patientName = (id: string) => patientById(id)?.full_name ?? id.slice(0, 8);
  const patientMrn = (id: string) => patientById(id)?.medical_record_number ?? "";

  const filteredVisits = (visits.data ?? []).filter((v) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      patientName(v.patient_id).toLowerCase().includes(q) ||
      patientMrn(v.patient_id).toLowerCase().includes(q) ||
      (v.reason ?? "").toLowerCase().includes(q) ||
      (v.chief_complaint ?? "").toLowerCase().includes(q)
    );
  });


  const create = useMutation({
    mutationFn: async () => {
      if (!form.patient_id) throw new Error("Pick a patient");
      const { data, error } = await supabase.from("visits" as never).insert({
        patient_id: form.patient_id,
        opened_by: user!.id,
        reason: form.reason || null,
        chief_complaint: form.chief_complaint || null,
        triage_level: form.triage_level || "routine",
        status: "open",
      } as never).select("id").single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onSuccess: (visitId) => {
      qc.invalidateQueries({ queryKey: ["visits"] });
      setOpen(false);
      setForm({});
      toast.success("Visit started");
      navigate({ to: "/visits/$visitId", params: { visitId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const triageBadge = (level: string | null) => {
    const cls =
      level === "emergent"
        ? "bg-destructive/15 text-destructive"
        : level === "urgent"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
    return <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${cls}`}>{level ?? "routine"}</span>;
  };

  const statusBadge = (s: string) => (
    <span className={`rounded px-1.5 py-0.5 text-xs capitalize ${s === "closed" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
      {s.replace("_", " ")}
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Visits</h1>
        </div>
        {canOpen && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" /> Start visit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start a new visit</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Patient *</Label>
                  <Select value={form.patient_id ?? ""} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Choose patient" /></SelectTrigger>
                    <SelectContent>
                      {patients.data?.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name}
                          {p.medical_record_number ? ` · ${p.medical_record_number}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reason for visit</Label>
                  <Input value={form.reason ?? ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
                </div>
                <div>
                  <Label>Chief complaint</Label>
                  <Textarea rows={2} value={form.chief_complaint ?? ""} onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })} />
                </div>
                <div>
                  <Label>Triage level</Label>
                  <Select value={form.triage_level ?? "routine"} onValueChange={(v) => setForm({ ...form, triage_level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="routine">Routine</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="emergent">Emergent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Opening..." : "Open visit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search patient, MRN, reason, or complaint…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8"
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Patient</th>
              <th className="px-4 py-2 font-medium">Reason</th>
              <th className="px-4 py-2 font-medium">Triage</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Opened</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {visits.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading...</td></tr>
            )}
            {!visits.isLoading && filteredVisits.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{search ? "No matches." : "No visits yet."}</td></tr>
            )}
            {filteredVisits.map((v) => {
              const mrn = patientMrn(v.patient_id);
              return (
                <tr key={v.id} className="border-t">
                  <td className="px-4 py-2">
                    <div>{patientName(v.patient_id)}</div>
                    {mrn && <div className="font-mono text-[10px] text-muted-foreground">{mrn}</div>}
                  </td>
                  <td className="px-4 py-2">{v.reason ?? "—"}</td>
                  <td className="px-4 py-2">{triageBadge(v.triage_level)}</td>
                  <td className="px-4 py-2">{statusBadge(v.status)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{new Date(v.opened_at).toLocaleString("en-GB")}</td>
                  <td className="px-4 py-2 text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/visits/$visitId" params={{ visitId: v.id }}>Open visit</Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

  );
}
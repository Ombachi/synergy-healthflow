import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { CatalogSearch, type CatalogItem } from "@/components/catalog-search";

export const Route = createFileRoute("/_authenticated/lab-order")({
  component: () => <RoleGate path="/lab-order"><LabOrderPage /></RoleGate>,
});

interface LabTest { id: string; code: string; name: string; specimen: string | null; category: string | null; turnaround_hours: number | null }
interface Visit { id: string; patient_id: string; reason: string | null; created_at: string; status: string }
interface Patient { id: string; full_name: string; medical_record_number: string | null }

function LabOrderPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [visitId, setVisitId] = useState<string>("");
  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [notes, setNotes] = useState("");

  const visits = useQuery({
    queryKey: ["lab-order-visits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never)
        .select("id, patient_id, reason, created_at, status")
        .eq("status", "open").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });

  const patients = useQuery({
    queryKey: ["lab-order-patients", (visits.data ?? []).map((v) => v.patient_id).join(",")],
    enabled: (visits.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = Array.from(new Set((visits.data ?? []).map((v) => v.patient_id)));
      const { data } = await supabase.from("patients" as never)
        .select("id, full_name, medical_record_number").in("id", ids as never);
      return (data as unknown as Patient[]) ?? [];
    },
  });

  const tests = useQuery({
    queryKey: ["lab-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_tests_catalog" as never)
        .select("id, code, name, specimen, category, turnaround_hours").order("name").limit(2000);
      if (error) throw error;
      return (data as unknown as LabTest[]) ?? [];
    },
  });

  const patientOf = (v: Visit | undefined) => patients.data?.find((p) => p.id === v?.patient_id);
  const selectedVisit = visits.data?.find((v) => v.id === visitId);
  const selectedPatient = patientOf(selectedVisit);

  const order = useMutation({
    mutationFn: async (test: LabTest) => {
      if (!selectedVisit) throw new Error("Choose a visit first");
      const { error } = await supabase.from("lab_orders" as never).insert({
        visit_id: selectedVisit.id,
        patient_id: selectedVisit.patient_id,
        test_id: test.id,
        ordered_by: user?.id ?? null,
        priority,
        clinical_notes: notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: (_d, test) => {
      qc.invalidateQueries({ queryKey: ["lab-orders"] });
      toast.success(`Ordered: ${test.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = useMemo<(CatalogItem & LabTest)[]>(() =>
    (tests.data ?? []).map((t) => ({
      ...t,
      primary: t.name,
      secondary: `${t.code}${t.specimen ? " · " + t.specimen : ""}${t.turnaround_hours ? " · " + t.turnaround_hours + "h TAT" : ""}`,
      tag: t.category ?? undefined,
    })), [tests.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <FlaskConical className="h-6 w-6 text-primary" /> Order lab tests
        </h1>
        <p className="text-sm text-muted-foreground">Search the catalogue, filter by category, and add tests to an open visit.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div>
            <Label>Visit</Label>
            <select
              value={visitId} onChange={(e) => setVisitId(e.target.value)}
              className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            >
              <option value="">— select an open visit —</option>
              {visits.data?.map((v) => {
                const p = patientOf(v);
                return (
                  <option key={v.id} value={v.id}>
                    {p?.full_name ?? "Patient"} {p?.medical_record_number ? `(${p.medical_record_number})` : ""} · {new Date(v.created_at).toLocaleDateString("en-GB")}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <Label>Priority</Label>
            <div className="mt-1 flex gap-1">
              {(["routine", "urgent", "stat"] as const).map((p) => (
                <button key={p} onClick={() => setPriority(p)}
                  className={`flex-1 rounded px-2 py-1.5 text-xs capitalize transition ${
                    priority === p ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
                  }`}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <Label>Clinical notes (optional)</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Clinical question, suspected diagnosis…" />
          </div>
          {selectedPatient && (
            <div className="rounded border bg-muted/30 p-2 text-xs">
              <div className="font-medium">{selectedPatient.full_name}</div>
              <div className="text-muted-foreground">{selectedPatient.medical_record_number ?? "—"}</div>
              {selectedVisit?.reason && <div className="mt-1 italic text-muted-foreground">Reason: {selectedVisit.reason}</div>}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <CatalogSearch
            items={items}
            loading={tests.isLoading}
            storageKey="vitalis:recent-lab-tests"
            placeholder="Search by test name or code (e.g. FBC, glucose, hepatitis)…"
            emptyLabel="No matching lab tests"
            onPick={(t) => {
              if (!visitId) { toast.error("Select a visit first"); return; }
              order.mutate(t as LabTest);
            }}
            renderAction={(t) => (
              <Button size="sm" variant="secondary" disabled={!visitId || order.isPending}
                onClick={(e) => { e.stopPropagation(); if (!visitId) { toast.error("Select a visit first"); return; } order.mutate(t as LabTest); }}>
                <Plus className="h-3 w-3" /> Request
              </Button>
            )}
          />
        </div>
      </div>
    </div>
  );
}

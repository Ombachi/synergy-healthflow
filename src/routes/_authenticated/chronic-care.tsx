import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HeartPulse, Search, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { RefillQueue } from "@/components/chronic/refill-queue";
import {
  fetchChronicMedications, fetchRefillPolicy, fetchRefillRequests, createRefillRequest,
} from "@/lib/chronic/chronic-api";
import {
  assessRefill, buildRefillRequest, adherenceRatio, adherenceBand,
  DEFAULT_REFILL_POLICY, type ChronicMedication,
} from "@/lib/chronic/refill-engine";

export const Route = createFileRoute("/_authenticated/chronic-care")({
  component: () => (
    <RoleGate path="/chronic-care">
      <ChronicCare />
    </RoleGate>
  ),
  head: () => ({
    meta: [
      { title: "Chronic Care & Refills | Litu Vault" },
      { name: "description", content: "Track chronic medications, refill eligibility and adherence across the care team." },
      { property: "og:title", content: "Chronic Care & Refills | Litu Vault" },
      { property: "og:description", content: "Active chronic medications, refill status and adherence in one workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ChronicCare() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  const isPatient = (roles.includes("patient") || roles.includes("athlete")) && !roles.some((r) =>
    ["admin", "doctor", "nurse", "pharmacist", "physio"].includes(r));
  return isPatient ? <PatientChronicView /> : <ClinicianChronicView />;
}

function useChronicData(patientId?: string) {
  const meds = useQuery({ queryKey: ["chronic-meds", patientId ?? "all"], queryFn: () => fetchChronicMedications(patientId) });
  const reqs = useQuery({ queryKey: ["refill-requests", patientId ?? "all"], queryFn: () => fetchRefillRequests(patientId) });
  const policy = useQuery({ queryKey: ["refill-policy"], queryFn: fetchRefillPolicy, initialData: DEFAULT_REFILL_POLICY });
  return { meds, reqs, policy };
}

function StatusPill({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const cls =
    tone === "ok" ? "bg-emerald-500/10 text-emerald-600"
    : tone === "warn" ? "bg-amber-500/10 text-amber-600"
    : tone === "bad" ? "bg-rose-500/10 text-rose-600"
    : "bg-muted text-muted-foreground";
  return <span className={`rounded px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}

function SchemaNotice() {
  return (
    <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
      The chronic care register is not available yet — the hospital database is paused, so the chronic
      medication tables have not been created. This workspace activates automatically once it is back online.
    </div>
  );
}

function ClinicianChronicView() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const { meds, reqs, policy } = useChronicData();

  const patients = useQuery({
    queryKey: ["chronic-patients"],
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never).select("id, full_name, medical_record_number");
      return (data as unknown as { id: string; full_name: string; medical_record_number: string | null }[]) ?? [];
    },
  });
  const nameFor = (pid: string) => patients.data?.find((p) => p.id === pid)?.full_name ?? "—";

  const openIds = (reqs.data?.rows ?? [])
    .filter((r) => ["requested", "pharmacy_review", "clinician_review", "approved"].includes(r.status))
    .map((r) => r.medication_id);

  const rows = useMemo(() => {
    const list = (meds.data?.rows ?? []).filter((m) =>
      !search ||
      m.medication.toLowerCase().includes(search.toLowerCase()) ||
      nameFor(m.patient_id).toLowerCase().includes(search.toLowerCase()));
    return list.map((m) => ({ med: m, a: assessRefill(m, policy.data) }));
  }, [meds.data, search, policy.data, patients.data]); // eslint-disable-line

  const request = useMutation({
    mutationFn: async (med: ChronicMedication) => {
      const draft = buildRefillRequest(med, assessRefill(med, policy.data), openIds);
      if (!draft) throw new Error("Refill is not due or is blocked by policy");
      await createRefillRequest({ ...draft, requested_by: user?.id ?? null });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["refill-requests"] }); toast.success("Refill request sent to pharmacy"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (meds.data?.schemaMissing) return <SchemaNotice />;

  const dueSoon = rows.filter((r) => r.a.nearing_completion).length;
  const needsReview = rows.filter((r) => r.a.decision === "requires_clinical_review").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <HeartPulse className="h-6 w-6 text-primary" /> Chronic care & refills
        </h1>
        <p className="text-sm text-muted-foreground">Active chronic therapy, refill eligibility and adherence.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Active chronic orders" value={rows.filter((r) => r.med.status === "active").length} />
        <Kpi label="Refill due within window" value={dueSoon} />
        <Kpi label="Awaiting clinical review" value={needsReview} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b p-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search patient or medication" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
          </div>
          <div className="divide-y">
            {rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">No chronic medications recorded.</div>}
            {rows.map(({ med, a }) => (
              <div key={med.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{nameFor(med.patient_id)} · {med.medication}</div>
                  <div className="text-xs text-muted-foreground">
                    {[med.dose, med.frequency, med.condition].filter(Boolean).join(" · ")}
                    {a.expected_completion && ` · ends ${a.expected_completion}`}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{a.reason}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={a.overdue ? "bad" : a.nearing_completion ? "warn" : "muted"}>
                    {a.days_remaining == null ? "supply unknown" : `${a.days_remaining}d left`}
                  </StatusPill>
                  <StatusPill tone={a.decision === "eligible" ? "ok" : a.decision === "not_due" ? "muted" : "warn"}>
                    {a.decision.replace(/_/g, " ")}
                  </StatusPill>
                  <Button size="sm" variant="outline" disabled={request.isPending || openIds.includes(med.id)}
                    onClick={() => request.mutate(med)}>
                    <RefreshCcw className="mr-1 h-3 w-3" />
                    {openIds.includes(med.id) ? "Requested" : "Request refill"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <RefillQueue />
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function PatientChronicView() {
  const { user } = useAuth();
  const patient = useQuery({
    queryKey: ["chronic-my-patient", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never).select("id, full_name").eq("user_id", user!.id).maybeSingle();
      return (data as unknown as { id: string; full_name: string } | null) ?? null;
    },
  });
  const pid = patient.data?.id;
  const { meds, reqs, policy } = useChronicData(pid);

  if (meds.data?.schemaMissing) return <SchemaNotice />;

  const list = meds.data?.rows ?? [];
  const ratio = adherenceRatio(list);
  const band = adherenceBand(ratio);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <HeartPulse className="h-6 w-6 text-primary" /> My medications
        </h1>
        <p className="text-sm text-muted-foreground">Your long-term medicines, when they run out and refill progress.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Active medicines" value={list.filter((m) => m.status === "active").length} />
        <Kpi label="Open refill requests" value={(reqs.data?.rows ?? []).filter((r) => !["dispensed", "rejected", "cancelled"].includes(r.status)).length} />
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">Adherence</div>
          <div className="mt-1 text-2xl font-semibold capitalize">
            {ratio == null ? "—" : `${Math.round(ratio * 100)}%`}
          </div>
          <div className="text-xs text-muted-foreground capitalize">{band}</div>
        </div>
      </div>

      <div className="rounded-lg border bg-card divide-y">
        {list.length === 0 && <div className="p-4 text-sm text-muted-foreground">No chronic medicines on file.</div>}
        {list.map((m) => {
          const a = assessRefill(m, policy.data);
          return (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
              <div>
                <div className="font-medium">{m.medication}</div>
                <div className="text-xs text-muted-foreground">
                  {[m.dose, m.frequency].filter(Boolean).join(" · ")}
                  {a.expected_completion && ` · supply ends ${a.expected_completion}`}
                </div>
              </div>
              <StatusPill tone={a.overdue ? "bad" : a.nearing_completion ? "warn" : "ok"}>
                {a.days_remaining == null ? "—" : a.overdue ? "refill overdue" : `${a.days_remaining} days left`}
              </StatusPill>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 text-sm font-medium">Refill requests</div>
        <div className="divide-y">
          {(reqs.data?.rows ?? []).length === 0 && <div className="p-3 text-xs text-muted-foreground">No refill requests yet.</div>}
          {(reqs.data?.rows ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <div>
                <div className="font-medium">{r.medication}</div>
                <div className="text-xs text-muted-foreground">{r.reason}</div>
              </div>
              <StatusPill tone={r.status === "dispensed" ? "ok" : r.status === "rejected" ? "bad" : "warn"}>
                {r.status.replace(/_/g, " ")}
              </StatusPill>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

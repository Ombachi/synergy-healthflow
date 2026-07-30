import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stethoscope, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { WorkflowChip } from "@/components/workflow-chip";

interface QueueEntry { id: string; visit_id: string; priority: number; entered_at: string }
interface Visit { id: string; patient_id: string; current_stage: string | null; triage_level: string | null; chief_complaint: string | null; reason: string | null; assigned_doctor_id: string | null }
interface Patient { id: string; full_name: string; date_of_birth: string | null; gender: string | null; medical_record_number: string | null; allergies: string | null }
interface VitalRow { visit_id: string; systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null; captured_at: string }
interface LabOrder { id: string; visit_id: string; test_id: string; status: string }
interface LabResult { order_id: string; result_value: string | null; units: string | null; abnormal_flag: string | null; comments: string | null }
interface ImgOrder { visit_id: string | null; modality: string; body_part: string | null; status: string; report: string | null; findings: string | null }

const PRIO_COLOR: Record<number, string> = {
  1: "bg-rose-500/15 text-rose-700 border-rose-500/40",
  2: "bg-amber-500/15 text-amber-700 border-amber-500/40",
  3: "bg-sky-500/10 text-sky-700 border-sky-500/30",
};

function ageOf(dob: string | null) {
  if (!dob) return "—";
  const y = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${y}y`;
}

export function DoctorStation() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const queue = useQuery({
    queryKey: ["doc-queue", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("visit_queue" as never)
        .select("id, visit_id, priority, entered_at")
        .eq("queue_type", "doctor").is("served_at", null)
        .order("priority").order("entered_at");
      if (error) throw error;
      return (data as unknown as QueueEntry[]) ?? [];
    },
  });

  const ids = (queue.data ?? []).map((q) => q.visit_id);
  const visits = useQuery({
    queryKey: ["doc-visits", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never)
        .select("id, patient_id, current_stage, triage_level, chief_complaint, reason, assigned_doctor_id")
        .in("id", ids as never);
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });

  // Filter out patients assigned to other doctors, and any visits that are already closed/completed.
  const myVisits = (visits.data ?? []).filter((v) =>
    (!v.assigned_doctor_id || v.assigned_doctor_id === user?.id) &&
    v.current_stage !== "closed" &&
    v.current_stage !== "completed",
  );
  const myQueueIds = new Set(myVisits.map((v) => v.id));
  const myQueue = (queue.data ?? []).filter((q) => myQueueIds.has(q.visit_id));

  const patientIds = myVisits.map((v) => v.patient_id);
  const patients = useQuery({
    queryKey: ["doc-patients", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never)
        .select("id, full_name, date_of_birth, gender, medical_record_number, allergies")
        .in("id", patientIds as never);
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  const vitals = useQuery({
    queryKey: ["doc-vitals", myVisits.map((v) => v.id).join(",")],
    enabled: myVisits.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("vitals" as never)
        .select("visit_id, systolic_bp, diastolic_bp, heart_rate, temperature_c, oxygen_saturation, captured_at")
        .in("visit_id", myVisits.map((v) => v.id) as never)
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as VitalRow[]) ?? [];
    },
  });

  const labOrders = useQuery({
    queryKey: ["doc-lab-orders", myVisits.map((v) => v.id).join(",")],
    enabled: myVisits.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_orders" as never)
        .select("id, visit_id, test_id, status")
        .in("visit_id", myVisits.map((v) => v.id) as never);
      if (error) throw error;
      return (data as unknown as LabOrder[]) ?? [];
    },
  });
  const labResults = useQuery({
    queryKey: ["doc-lab-results", (labOrders.data ?? []).map((o) => o.id).join(",")],
    enabled: (labOrders.data ?? []).length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_results" as never)
        .select("order_id, result_value, units, abnormal_flag, comments")
        .in("order_id", (labOrders.data ?? []).map((o) => o.id) as never);
      if (error) throw error;
      return (data as unknown as LabResult[]) ?? [];
    },
  });
  const imaging = useQuery({
    queryKey: ["doc-imaging", myVisits.map((v) => v.id).join(",")],
    enabled: myVisits.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("imaging_orders" as never)
        .select("visit_id, modality, body_part, status, report, findings")
        .in("visit_id", myVisits.map((v) => v.id) as never);
      if (error) throw error;
      return (data as unknown as ImgOrder[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("doc-queue-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "visit_queue" }, () => qc.invalidateQueries({ queryKey: ["doc-queue"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const patientOf = (id: string) => patients.data?.find((p) => p.id === id);
  const latestVitals = (vid: string) => vitals.data?.find((v) => v.visit_id === vid);
  const visitLabResults = (vid: string) => {
    const orders = (labOrders.data ?? []).filter((o) => o.visit_id === vid);
    return orders.map((o) => labResults.data?.find((r) => r.order_id === o.id)).filter(Boolean) as LabResult[];
  };
  const visitImagingReports = (vid: string) => (imaging.data ?? []).filter((i) => i.visit_id === vid && (i.report || i.findings));
  const elapsed = (iso: string) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m/60)}h ${m%60}m`;
  };

  // ---------------- KPI data ----------------
  const startOfToday = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };

  const seenToday = useQuery({
    queryKey: ["doc-seen-today", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("visits" as never)
        .select("id, patient_id, reason, chief_complaint, status, opened_at, closed_at")
        .eq("assigned_doctor_id", user!.id).gte("opened_at", startOfToday())
        .order("opened_at", { ascending: false });
      return (data as unknown as VisitRow[]) ?? [];
    },
  });
  const completedVisits = useQuery({
    queryKey: ["doc-completed", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("visits" as never)
        .select("id, patient_id, reason, chief_complaint, status, opened_at, closed_at")
        .eq("assigned_doctor_id", user!.id).in("status", ["closed", "completed"] as never)
        .order("closed_at", { ascending: false }).limit(100);
      return (data as unknown as VisitRow[]) ?? [];
    },
  });
  const assignedVisits = useQuery({
    queryKey: ["doc-assigned", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("visits" as never)
        .select("id, patient_id, reason, chief_complaint, status, opened_at, closed_at")
        .eq("assigned_doctor_id", user!.id).not("status", "in", "(closed,completed)")
        .order("opened_at", { ascending: false });
      return (data as unknown as VisitRow[]) ?? [];
    },
  });
  const pendingLabs = useQuery({
    queryKey: ["doc-pending-labs", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("lab_orders" as never)
        .select("id, visit_id, status, ordered_at, test_id")
        .eq("ordered_by", user!.id).neq("status", "resulted")
        .order("ordered_at", { ascending: false }).limit(100);
      return (data as unknown as PendingOrder[]) ?? [];
    },
  });
  const pendingImaging = useQuery({
    queryKey: ["doc-pending-imaging", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("imaging_orders" as never)
        .select("id, visit_id, status, modality, body_part, ordered_at")
        .eq("ordered_by", user!.id).neq("status", "reported")
        .order("ordered_at", { ascending: false }).limit(100);
      return (data as unknown as PendingImaging[]) ?? [];
    },
  });

  const pendingCount = (pendingLabs.data?.length ?? 0) + (pendingImaging.data?.length ?? 0);

  // Names for visits that are not in the live queue
  const extraPatientIds = Array.from(new Set([
    ...(seenToday.data ?? []), ...(completedVisits.data ?? []), ...(assignedVisits.data ?? []),
  ].map((v) => v.patient_id)));
  const extraPatients = useQuery({
    queryKey: ["doc-extra-patients", extraPatientIds.join(",")],
    enabled: extraPatientIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never)
        .select("id, full_name, date_of_birth, gender, medical_record_number, allergies")
        .in("id", extraPatientIds as never);
      return (data as unknown as Patient[]) ?? [];
    },
  });
  const nameOf = (pid: string) =>
    patients.data?.find((p) => p.id === pid)?.full_name
    ?? extraPatients.data?.find((p) => p.id === pid)?.full_name
    ?? "—";
  const mrnOf = (pid: string) =>
    extraPatients.data?.find((p) => p.id === pid)?.medical_record_number
    ?? patients.data?.find((p) => p.id === pid)?.medical_record_number
    ?? "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Stethoscope className="h-6 w-6 text-primary" /> Doctor workspace</h1>
          <p className="text-sm text-muted-foreground">Click a patient to open the consultation interface.</p>
        </div>
      </div>

      {/* Interactive KPI widgets */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KPIWidget label="Patients waiting" value={myQueue.length} tone="amber" active={view === "waiting"} onClick={() => setView("waiting")} />
        <KPIWidget label="Seen today" value={seenToday.data?.length ?? "—"} tone="sky" active={view === "seen"} onClick={() => setView("seen")} />
        <KPIWidget label="Completed" value={completedVisits.data?.length ?? "—"} tone="emerald" active={view === "completed"} onClick={() => setView("completed")} />
        <KPIWidget label="Pending results" value={pendingCount} tone="rose" active={view === "results"} onClick={() => setView("results")} />
        <KPIWidget label="Assigned queue" value={assignedVisits.data?.length ?? myQueue.length} tone="violet" active={view === "assigned"} onClick={() => setView("assigned")} />
      </div>

      {view !== "waiting" && (
        <button onClick={() => setView("waiting")} className="text-xs text-primary underline">
          ← Back to waiting queue
        </button>
      )}

      {view === "waiting" && (myQueue.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
          No patients in your queue. Nurses send patients here after triage.
        </div>
      ) : (
        <div className="grid gap-3">
          {myQueue.map((q) => {
            const v = visits.data!.find((x) => x.id === q.visit_id)!;
            const p = patientOf(v.patient_id);
            const vt = latestVitals(v.id);
            const resultCount = visitLabResults(v.id).length;
            const reportCount = visitImagingReports(v.id).length;
            return (
              <Link
                key={q.id}
                to="/visits/$visitId" params={{ visitId: v.id }}
                className="group flex items-center gap-4 rounded-lg border bg-card p-4 transition hover:border-primary hover:shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
                  {p?.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("") ?? "?"}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p?.full_name ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">MRN {p?.medical_record_number ?? "—"} · {ageOf(p?.date_of_birth ?? null)} · {p?.gender ?? "—"}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground line-clamp-1">{v.chief_complaint ?? v.reason ?? "—"}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded border px-1.5 py-0.5 ${PRIO_COLOR[q.priority] ?? PRIO_COLOR[3]}`}>
                      {q.priority === 1 ? "Emergency" : q.priority === 2 ? "Urgent" : "Normal"}
                    </span>
                    {v.current_stage && <WorkflowChip status={v.current_stage} />}
                    <span className="text-muted-foreground">Waiting {elapsed(q.entered_at)}</span>
                    {p?.allergies && <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-700">⚠ {p.allergies}</span>}
                    {vt && (
                      <span className="font-mono text-muted-foreground">
                        BP {vt.systolic_bp ?? "—"}/{vt.diastolic_bp ?? "—"} · HR {vt.heart_rate ?? "—"} · SpO₂ {vt.oxygen_saturation ?? "—"}%
                      </span>
                    )}
                    {resultCount > 0 && <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700">{resultCount} lab result{resultCount === 1 ? "" : "s"}</span>}
                    {reportCount > 0 && <span className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-sky-700">{reportCount} imaging report{reportCount === 1 ? "" : "s"}</span>}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </Link>
            );
          })}
        </div>
      ))}

      {view === "seen" && (
        <VisitList title="Today's encounters" rows={seenToday.data ?? []} nameOf={nameOf} mrnOf={mrnOf} />
      )}
      {view === "completed" && (
        <VisitList title="Completed consultations" rows={completedVisits.data ?? []} nameOf={nameOf} mrnOf={mrnOf} />
      )}
      {view === "assigned" && (
        <VisitList title="Assigned to me" rows={assignedVisits.data ?? []} nameOf={nameOf} mrnOf={mrnOf} />
      )}
      {view === "results" && (
        <div className="space-y-4">
          <ResultsGroup
            title="Laboratory"
            empty="No laboratory investigations awaiting review."
            rows={(pendingLabs.data ?? []).map((o) => ({
              id: o.id, visitId: o.visit_id, label: `Lab order · ${o.status}`, at: o.ordered_at,
            }))}
            nameOf={nameOf}
            visitPatient={(vid) => visitPatientId(vid, [seenToday.data, assignedVisits.data, completedVisits.data], myVisits)}
          />
          <ResultsGroup
            title="Radiology"
            empty="No imaging studies awaiting review."
            rows={(pendingImaging.data ?? []).map((o) => ({
              id: o.id, visitId: o.visit_id, label: `${o.modality}${o.body_part ? ` · ${o.body_part}` : ""} · ${o.status}`, at: o.ordered_at,
            }))}
            nameOf={nameOf}
            visitPatient={(vid) => visitPatientId(vid, [seenToday.data, assignedVisits.data, completedVisits.data], myVisits)}
          />
          <ResultsGroup title="Histopathology" empty="No histopathology reports pending." rows={[]} nameOf={nameOf} visitPatient={() => null} />
          <ResultsGroup title="Microbiology" empty="No microbiology reports pending." rows={[]} nameOf={nameOf} visitPatient={() => null} />
        </div>
      )}
    </div>
  );
}

interface VisitRow { id: string; patient_id: string; reason: string | null; chief_complaint: string | null; status: string; opened_at: string; closed_at: string | null }
interface PendingOrder { id: string; visit_id: string | null; status: string; ordered_at: string; test_id: string | null }
interface PendingImaging { id: string; visit_id: string | null; status: string; modality: string; body_part: string | null; ordered_at: string }

function visitPatientId(
  vid: string | null,
  pools: (VisitRow[] | undefined)[],
  queueVisits: { id: string; patient_id: string }[],
): string | null {
  if (!vid) return null;
  for (const pool of pools) {
    const hit = pool?.find((v) => v.id === vid);
    if (hit) return hit.patient_id;
  }
  return queueVisits.find((v) => v.id === vid)?.patient_id ?? null;
}

function VisitList({ title, rows, nameOf, mrnOf }: {
  title: string;
  rows: VisitRow[];
  nameOf: (id: string) => string;
  mrnOf: (id: string) => string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-2 text-sm font-medium">{title}</div>
      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Nothing here yet.</div>
      ) : (
        <ul className="divide-y">
          {rows.map((v) => (
            <li key={v.id}>
              <Link to="/visits/$visitId" params={{ visitId: v.id }} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="flex-1">
                  <div className="font-medium">{nameOf(v.patient_id)}</div>
                  <div className="text-xs text-muted-foreground">
                    MRN {mrnOf(v.patient_id)} · {v.chief_complaint ?? v.reason ?? "—"}
                  </div>
                </div>
                <span className="text-xs capitalize text-muted-foreground">{v.status.replace("_", " ")}</span>
                <span className="text-xs text-muted-foreground">{new Date(v.closed_at ?? v.opened_at).toLocaleString()}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultsGroup({ title, rows, empty, nameOf, visitPatient }: {
  title: string;
  rows: { id: string; visitId: string | null; label: string; at: string }[];
  empty: string;
  nameOf: (id: string) => string;
  visitPatient: (vid: string | null) => string | null;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-2 text-sm font-medium">{title}</div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <ul className="divide-y">
          {rows.map((r) => {
            const pid = visitPatient(r.visitId);
            const inner = (
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="flex-1">
                  <div className="font-medium">{pid ? nameOf(pid) : "Unassigned patient"}</div>
                  <div className="text-xs text-muted-foreground">{r.label}</div>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            );
            return (
              <li key={r.id}>
                {r.visitId ? (
                  <Link to="/visits/$visitId" params={{ visitId: r.visitId }}>{inner}</Link>
                ) : inner}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function KPIWidget({ label, value, tone, active, onClick }: {
  label: string; value: number | string; tone: "amber"|"sky"|"emerald"|"rose"|"violet";
  active?: boolean; onClick?: () => void;
}) {
  const tones: Record<string,string> = {
    amber: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    sky: "bg-sky-500/10 text-sky-700 border-sky-500/30",
    emerald: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    rose: "bg-rose-500/10 text-rose-700 border-rose-500/30",
    violet: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-3 text-left transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${tones[tone]} ${active ? "ring-2 ring-primary/60" : ""}`}
    >
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-[11px] uppercase tracking-wide">{label}</div>
    </button>
  );
}


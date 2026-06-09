import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, FileText, HeartPulse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/me")({
  component: PatientTimeline,
});

interface Patient { id: string; full_name: string }
interface Visit { id: string; opened_at: string; closed_at: string | null; status: string; reason: string | null; notes: string | null; triage_level: string | null }
interface Vital { id: string; visit_id: string; captured_at: string; systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null }
interface Rx { id: string; visit_id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null }
interface Discharge { visit_id: string; summary: string; treatment_plan: string | null; follow_up: string | null; finalized: boolean; finalized_at: string | null }

function PatientTimeline() {
  const { user } = useAuth();

  const patient = useQuery({
    queryKey: ["my-patient", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Patient | null;
    },
  });

  const pid = patient.data?.id;

  const visits = useQuery({
    queryKey: ["my-visits", pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits" as never)
        .select("id, opened_at, closed_at, status, reason, notes, triage_level")
        .eq("patient_id", pid!)
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });

  const vitals = useQuery({
    queryKey: ["my-vitals", pid],
    enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vitals" as never)
        .select("id, visit_id, captured_at, systolic_bp, diastolic_bp, heart_rate, temperature_c, oxygen_saturation")
        .eq("patient_id", pid!)
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Vital[]) ?? [];
    },
  });

  const visitIds = visits.data?.map((v) => v.id) ?? [];

  const rx = useQuery({
    queryKey: ["my-rx", visitIds.join(",")],
    enabled: visitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescriptions" as never)
        .select("id, visit_id, medication, dose, frequency, duration")
        .in("visit_id", visitIds as never);
      if (error) throw error;
      return (data as unknown as Rx[]) ?? [];
    },
  });

  const discharges = useQuery({
    queryKey: ["my-discharge", visitIds.join(",")],
    enabled: visitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discharge_summaries" as never)
        .select("visit_id, summary, treatment_plan, follow_up, finalized, finalized_at")
        .in("visit_id", visitIds as never);
      if (error) throw error;
      return (data as unknown as Discharge[]) ?? [];
    },
  });

  if (patient.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!patient.data) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">No patient profile found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete <Link to="/onboarding" className="text-primary underline">onboarding as a patient</Link> to see your health timeline.
        </p>
      </div>
    );
  }

  const recentVitals = vitals.data?.slice(0, 8) ?? [];
  const trendKeys: Array<{ key: keyof Vital; label: string }> = [
    { key: "systolic_bp", label: "Systolic BP" },
    { key: "heart_rate", label: "Heart rate" },
    { key: "oxygen_saturation", label: "SpO₂" },
    { key: "temperature_c", label: "Temp °C" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">My health timeline</h1>
        <p className="text-sm text-muted-foreground">{patient.data.full_name}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium"><HeartPulse className="h-4 w-4 text-primary" /> Vitals trend</h2>
          {recentVitals.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No vitals recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {trendKeys.map(({ key, label }) => {
                const series = recentVitals.map((v) => (v[key] as number | null) ?? null).reverse();
                const nums = series.filter((n): n is number => n != null);
                const min = Math.min(...nums), max = Math.max(...nums);
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{label}</span>
                      <span>{nums.length ? `${nums[nums.length - 1]} (min ${min} · max ${max})` : "—"}</span>
                    </div>
                    <div className="mt-1 flex h-8 items-end gap-0.5">
                      {series.map((n, i) => {
                        const h = n == null || max === min ? 30 : 5 + ((n - min) / (max - min)) * 95;
                        return <div key={i} className="flex-1 rounded-sm bg-primary/60" style={{ height: `${h}%`, opacity: n == null ? 0.2 : 1 }} />;
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium"><Activity className="h-4 w-4 text-primary" /> Active prescriptions</h2>
          {rx.data?.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {rx.data.map((r) => (
                <li key={r.id} className="rounded border p-2">
                  <div className="font-medium">{r.medication}</div>
                  <div className="text-xs text-muted-foreground">
                    {[r.dose, r.frequency, r.duration].filter(Boolean).join(" · ") || "—"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No prescriptions on record.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-primary" /> Visit history</h2>
        {visits.data?.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No visits yet.</p>}
        <div className="mt-4 space-y-4">
          {visits.data?.map((v) => {
            const ds = discharges.data?.find((d) => d.visit_id === v.id);
            return (
              <div key={v.id} className="relative border-l-2 border-primary/40 pl-4">
                <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-primary" />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-medium">{v.reason ?? "Visit"}</div>
                  <div className="text-xs text-muted-foreground">{new Date(v.opened_at).toLocaleString()}</div>
                </div>
                <div className="mt-1 text-xs">
                  <span className="capitalize text-muted-foreground">Status: {v.status.replace("_"," ")}</span>
                  {v.triage_level && <span className="ml-2 capitalize text-muted-foreground">· Triage: {v.triage_level}</span>}
                </div>
                {v.notes && <p className="mt-2 text-sm whitespace-pre-wrap">{v.notes}</p>}
                {ds && (
                  <div className="mt-2 rounded-md bg-muted/50 p-3 text-sm">
                    <div className="text-xs font-medium uppercase text-muted-foreground">Discharge summary</div>
                    <p className="mt-1 whitespace-pre-wrap">{ds.summary}</p>
                    {ds.treatment_plan && <p className="mt-2"><span className="text-xs text-muted-foreground">Plan: </span>{ds.treatment_plan}</p>}
                    {ds.follow_up && <p className="mt-1"><span className="text-xs text-muted-foreground">Follow-up: </span>{ds.follow_up}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

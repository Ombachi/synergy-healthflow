import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, FileText, HeartPulse } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/me")({ component: PatientTimeline });

interface Patient { id: string; full_name: string }
interface Visit { id: string; opened_at: string; closed_at: string | null; status: string; reason: string | null; notes: string | null; triage_level: string | null }
interface Vital { id: string; visit_id: string; captured_at: string; systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null }
interface Rx { id: string; visit_id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null }
interface Discharge { visit_id: string; summary: string; treatment_plan: string | null; follow_up: string | null; finalized: boolean }

const RANGES_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365, all: 100000 };

function PatientTimeline() {
  const { user } = useAuth();
  const [range, setRange] = useState<keyof typeof RANGES_DAYS>("30d");

  const patient = useQuery({
    queryKey: ["my-patient", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name").eq("user_id", user!.id).maybeSingle();
      if (error) throw error; return data as unknown as Patient | null;
    },
  });
  const pid = patient.data?.id;
  const visits = useQuery({ queryKey: ["my-visits", pid], enabled: !!pid, queryFn: async () => {
    const { data, error } = await supabase.from("visits" as never).select("id, opened_at, closed_at, status, reason, notes, triage_level").eq("patient_id", pid!).order("opened_at", { ascending: false });
    if (error) throw error; return (data as unknown as Visit[]) ?? [];
  }});
  const vitals = useQuery({ queryKey: ["my-vitals", pid], enabled: !!pid, queryFn: async () => {
    const { data, error } = await supabase.from("vitals" as never).select("id, visit_id, captured_at, systolic_bp, diastolic_bp, heart_rate, temperature_c, oxygen_saturation").eq("patient_id", pid!).order("captured_at");
    if (error) throw error; return (data as unknown as Vital[]) ?? [];
  }});
  const visitIds = visits.data?.map((v) => v.id) ?? [];
  const rx = useQuery({ queryKey: ["my-rx", visitIds.join(",")], enabled: visitIds.length > 0, queryFn: async () => {
    const { data, error } = await supabase.from("prescriptions" as never).select("id, visit_id, medication, dose, frequency, duration").in("visit_id", visitIds as never);
    if (error) throw error; return (data as unknown as Rx[]) ?? [];
  }});
  const discharges = useQuery({ queryKey: ["my-discharge", visitIds.join(",")], enabled: visitIds.length > 0, queryFn: async () => {
    const { data, error } = await supabase.from("discharge_summaries" as never).select("visit_id, summary, treatment_plan, follow_up, finalized").in("visit_id", visitIds as never);
    if (error) throw error; return (data as unknown as Discharge[]) ?? [];
  }});

  const filteredVitals = useMemo(() => {
    const cutoff = Date.now() - RANGES_DAYS[range] * 24 * 60 * 60 * 1000;
    return (vitals.data ?? []).filter((v) => new Date(v.captured_at).getTime() >= cutoff);
  }, [vitals.data, range]);

  const chartData = filteredVitals.map((v) => ({
    t: new Date(v.captured_at).getTime(),
    label: new Date(v.captured_at).toLocaleDateString(),
    systolic: v.systolic_bp, diastolic: v.diastolic_bp, hr: v.heart_rate, spo2: v.oxygen_saturation, temp: v.temperature_c,
  }));

  if (patient.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!patient.data) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h1 className="text-xl font-semibold">No patient profile found</h1>
        <p className="mt-2 text-sm text-muted-foreground">Complete <Link to="/onboarding" className="text-primary underline">onboarding as a patient</Link>.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My health timeline</h1>
          <p className="text-sm text-muted-foreground">{patient.data.full_name}</p>
        </div>
        <div className="flex gap-1">
          {(Object.keys(RANGES_DAYS) as Array<keyof typeof RANGES_DAYS>).map((r) => (
            <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>{r}</Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-2 font-medium"><HeartPulse className="h-4 w-4 text-primary" /> Vital trends</h2>
        {chartData.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No vitals in this range.</p>
        ) : (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <ChartCard title="Blood pressure (mmHg)" data={chartData} lines={[{ key: "systolic", color: "#dc2626" }, { key: "diastolic", color: "#2563eb" }]} />
            <ChartCard title="Heart rate (bpm)" data={chartData} lines={[{ key: "hr", color: "#9333ea" }]} />
            <ChartCard title="SpO₂ (%)" data={chartData} lines={[{ key: "spo2", color: "#0891b2" }]} />
            <ChartCard title="Temperature (°C)" data={chartData} lines={[{ key: "temp", color: "#ea580c" }]} />
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="flex items-center gap-2 font-medium"><Activity className="h-4 w-4 text-primary" /> Active prescriptions</h2>
        {rx.data?.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {rx.data.map((r) => (
              <li key={r.id} className="rounded border p-2 text-sm">
                <div className="font-medium">{r.medication}</div>
                <div className="text-xs text-muted-foreground">{[r.dose, r.frequency, r.duration].filter(Boolean).join(" · ") || "—"}</div>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-muted-foreground">None.</p>}
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

function ChartCard({ title, data, lines }: { title: string; data: Array<Record<string, unknown>>; lines: { key: string; color: string }[] }) {
  return (
    <div className="rounded border p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="label" fontSize={10} />
            <YAxis fontSize={10} domain={["auto","auto"]} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            {lines.map((l) => <Line key={l.key} type="monotone" dataKey={l.key} stroke={l.color} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />)}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

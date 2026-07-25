import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Apple, CalendarPlus, Save, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/nutrition")({
  component: () => <RoleGate path="/nutrition"><NutritionStation /></RoleGate>,
});

interface Athlete { id: string; full_name: string; sport: string | null; team: string | null; height_cm: number | null; weight_kg: number | null; date_of_birth: string | null }
interface Patient { id: string; full_name: string; medical_record_number: string | null; date_of_birth: string | null; gender: string | null }
interface Plan { id: string; athlete_id: string | null; patient_id: string | null; notes: string | null; start_date: string | null; end_date: string | null; compliance_pct: number | null; plan: Record<string, unknown>; created_at: string }

type Subject =
  | { kind: "athlete"; id: string; full_name: string; sport: string | null; team: string | null; height_cm: number | null; weight_kg: number | null; date_of_birth: string | null }
  | { kind: "patient"; id: string; full_name: string; mrn: string | null; date_of_birth: string | null; gender: string | null };

type AssessmentForm = {
  weight: string; height: string; muac: string;
  diet_history: string; diagnosis: string;
  meal_plan: string; recommendations: string; follow_up: string;
};

const BLANK: AssessmentForm = { weight: "", height: "", muac: "", diet_history: "", diagnosis: "", meal_plan: "", recommendations: "", follow_up: "" };

function NutritionStation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState<string | null>(null); // "athlete:<id>" or "patient:<id>"
  const [tab, setTab] = useState("assessment");

  const athletes = useQuery({
    queryKey: ["nut-athletes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("athletes" as never)
        .select("id, full_name, sport, team, height_cm, weight_kg, date_of_birth").order("full_name");
      if (error) throw error;
      return (data as unknown as Athlete[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["nut-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never)
        .select("id, full_name, medical_record_number, date_of_birth, gender").order("full_name").limit(500);
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });
  const plans = useQuery({
    queryKey: ["nut-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nutrition_plans" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Plan[]) ?? [];
    },
  });

  const subjects: Subject[] = useMemo(() => {
    const a: Subject[] = (athletes.data ?? []).map((x) => ({
      kind: "athlete" as const, id: x.id, full_name: x.full_name, sport: x.sport, team: x.team,
      height_cm: x.height_cm, weight_kg: x.weight_kg, date_of_birth: x.date_of_birth,
    }));
    const p: Subject[] = (patients.data ?? []).map((x) => ({
      kind: "patient" as const, id: x.id, full_name: x.full_name, mrn: x.medical_record_number,
      date_of_birth: x.date_of_birth, gender: x.gender,
    }));
    return [...a, ...p];
  }, [athletes.data, patients.data]);

  useEffect(() => {
    if (!selectedKey && subjects.length > 0) setSelectedKey(`${subjects[0].kind}:${subjects[0].id}`);
  }, [subjects, selectedKey]);

  const selected: Subject | null = useMemo(() => {
    if (!selectedKey) return null;
    const [kind, id] = selectedKey.split(":");
    return subjects.find((s) => s.kind === kind && s.id === id) ?? null;
  }, [selectedKey, subjects]);

  const [assess, setAssess] = useState<AssessmentForm>(BLANK);

  // Load last saved assessment for the selected subject
  useEffect(() => {
    if (!selected) { setAssess(BLANK); return; }
    const latest = (plans.data ?? [])
      .filter((p) => selected.kind === "athlete" ? p.athlete_id === selected.id : p.patient_id === selected.id)
      .sort((a, b) => (b.created_at > a.created_at ? 1 : -1))[0];
    const planJson = (latest?.plan ?? {}) as Record<string, string | undefined>;
    const baseWeight = selected.kind === "athlete" ? selected.weight_kg?.toString() : undefined;
    const baseHeight = selected.kind === "athlete" ? selected.height_cm?.toString() : undefined;
    setAssess({
      weight: planJson.weight ?? baseWeight ?? "",
      height: planJson.height ?? baseHeight ?? "",
      muac: planJson.muac ?? "",
      diet_history: planJson.diet_history ?? "",
      diagnosis: planJson.diagnosis ?? "",
      meal_plan: planJson.meal_plan ?? "",
      recommendations: planJson.recommendations ?? latest?.notes ?? "",
      follow_up: latest?.end_date ?? "",
    });
  }, [selectedKey, plans.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const bmi = useMemo(() => {
    const w = Number(assess.weight), h = Number(assess.height) / 100;
    if (!w || !h) return null;
    return (w / (h * h)).toFixed(1);
  }, [assess.weight, assess.height]);

  const ageOf = (dob: string | null) => {
    if (!dob) return "—";
    const y = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
    return `${y}y`;
  };

  const buildPlanJson = () => ({
    kind: "assessment",
    weight: assess.weight, height: assess.height, bmi,
    muac: assess.muac, diet_history: assess.diet_history,
    diagnosis: assess.diagnosis, recommendations: assess.recommendations,
    meal_plan: assess.meal_plan,
  });

  const subjectLink = () =>
    selected?.kind === "athlete"
      ? { athlete_id: selected.id, patient_id: null }
      : selected?.kind === "patient"
      ? { athlete_id: null, patient_id: selected.id }
      : null;

  const saveAssessment = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a person");
      const w = assess.weight ? Number(assess.weight) : null;
      const h = assess.height ? Number(assess.height) : null;
      if (selected.kind === "athlete") {
        const { error: aErr } = await supabase.from("athletes" as never)
          .update({ weight_kg: w, height_cm: h } as never).eq("id", selected.id);
        if (aErr) throw aErr;
      }
      const link = subjectLink()!;
      const { error: pErr } = await supabase.from("nutrition_plans" as never).insert({
        ...link, nutritionist_id: user!.id,
        notes: assess.recommendations || null,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: assess.follow_up || null,
        plan: buildPlanJson(),
      } as never);
      if (pErr) throw pErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nut-athletes"] });
      qc.invalidateQueries({ queryKey: ["nut-plans"] });
      toast.success("Assessment saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const issuePlan = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick a person");
      const link = subjectLink()!;
      const { error } = await supabase.from("nutrition_plans" as never).insert({
        ...link, nutritionist_id: user!.id,
        notes: assess.recommendations || null,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: assess.follow_up || null,
        plan: { ...buildPlanJson(), kind: "plan" },
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nut-plans"] }); toast.success("Nutrition plan issued"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const myPlans = (plans.data ?? []).filter((p) =>
    selected?.kind === "athlete" ? p.athlete_id === selected.id : selected?.kind === "patient" ? p.patient_id === selected.id : false,
  );

  const athleteSubjects = subjects.filter((s) => s.kind === "athlete");
  const patientSubjects = subjects.filter((s) => s.kind === "patient");

  const [search, setSearch] = useState("");
  const matches = (s: Subject) => !search || s.full_name.toLowerCase().includes(search.toLowerCase());

  return (
    <div className="grid h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[320px_1fr]">
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-3">
          <div className="flex items-center gap-2 font-semibold"><Apple className="h-4 w-4 text-emerald-600" />Nutrition roster</div>
          <div className="text-xs text-muted-foreground">{athleteSubjects.length} athletes · {patientSubjects.length} patients</div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name…" className="mt-2 h-8 text-sm" />
        </div>
        <div className="flex-1 overflow-auto">
          {athleteSubjects.filter(matches).length > 0 && (
            <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Athletes</div>
          )}
          {athleteSubjects.filter(matches).map((a) => {
            const key = `athlete:${a.id}`;
            const active = key === selectedKey;
            return (
              <button key={key} onClick={() => setSelectedKey(key)}
                className={`flex w-full flex-col gap-0.5 border-l-4 border-b p-3 text-left text-sm transition ${
                  active ? "bg-accent border-l-primary" : "border-l-transparent hover:bg-accent/40"
                }`}>
                <div className="font-medium">{a.full_name}</div>
                <div className="text-xs text-muted-foreground">{a.kind === "athlete" ? `${a.sport ?? "—"} · ${a.team ?? "—"}` : ""}</div>
              </button>
            );
          })}
          {patientSubjects.filter(matches).length > 0 && (
            <div className="border-b bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Patients</div>
          )}
          {patientSubjects.filter(matches).map((p) => {
            if (p.kind !== "patient") return null;
            const key = `patient:${p.id}`;
            const active = key === selectedKey;
            return (
              <button key={key} onClick={() => setSelectedKey(key)}
                className={`flex w-full items-start gap-2 border-l-4 border-b p-3 text-left text-sm transition ${
                  active ? "bg-accent border-l-primary" : "border-l-transparent hover:bg-accent/40"
                }`}>
                <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.mrn ? `MRN ${p.mrn}` : "—"}{p.gender ? ` · ${p.gender}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
          {subjects.filter(matches).length === 0 && <div className="p-4 text-sm text-muted-foreground">No matches.</div>}
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a person.</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto">
            <div className="flex items-center gap-4 border-b bg-muted/30 p-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-lg font-semibold text-emerald-700">
                {selected.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold">{selected.full_name}</div>
                <div className="text-xs text-muted-foreground">
                  {ageOf(selected.date_of_birth)} ·{" "}
                  {selected.kind === "athlete"
                    ? `${selected.sport ?? "—"} · ${selected.team ?? "—"}`
                    : `${selected.gender ?? "—"} · MRN ${selected.mrn ?? "—"}`}
                </div>
              </div>
              <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${selected.kind === "athlete" ? "bg-primary/10 text-primary" : "bg-emerald-500/15 text-emerald-700"}`}>
                {selected.kind === "athlete" ? "Athlete" : "Patient"}
              </span>
            </div>

            <div className="p-4">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="assessment">Assessment</TabsTrigger>
                  <TabsTrigger value="diet">Diet history</TabsTrigger>
                  <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
                  <TabsTrigger value="plan">Meal plan</TabsTrigger>
                  <TabsTrigger value="history">Past plans</TabsTrigger>
                </TabsList>

                <TabsContent value="assessment" className="mt-4 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Box label="Weight (kg)"><Input type="number" step="0.1" value={assess.weight} onChange={(e) => setAssess({ ...assess, weight: e.target.value })} /></Box>
                    <Box label="Height (cm)"><Input type="number" step="0.1" value={assess.height} onChange={(e) => setAssess({ ...assess, height: e.target.value })} /></Box>
                    <Box label="BMI"><div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 font-mono text-sm">{bmi ?? "—"}</div></Box>
                    <Box label="MUAC (cm)"><Input type="number" step="0.1" value={assess.muac} onChange={(e) => setAssess({ ...assess, muac: e.target.value })} /></Box>
                  </div>
                  <Button onClick={() => saveAssessment.mutate()} disabled={saveAssessment.isPending}>
                    <Save className="h-4 w-4" /> Save assessment
                  </Button>
                </TabsContent>

                <TabsContent value="diet" className="mt-4 space-y-3">
                  <Box label="Diet history"><Textarea rows={6} value={assess.diet_history} onChange={(e) => setAssess({ ...assess, diet_history: e.target.value })} placeholder="Typical day's intake, eating patterns, supplements…" /></Box>
                  <Button variant="outline" onClick={() => saveAssessment.mutate()} disabled={saveAssessment.isPending}><Save className="h-4 w-4" /> Save</Button>
                </TabsContent>

                <TabsContent value="diagnosis" className="mt-4 space-y-3">
                  <Box label="Nutrition diagnosis"><Textarea rows={4} value={assess.diagnosis} onChange={(e) => setAssess({ ...assess, diagnosis: e.target.value })} /></Box>
                  <Box label="Recommendations"><Textarea rows={4} value={assess.recommendations} onChange={(e) => setAssess({ ...assess, recommendations: e.target.value })} /></Box>
                  <Button variant="outline" onClick={() => saveAssessment.mutate()} disabled={saveAssessment.isPending}><Save className="h-4 w-4" /> Save</Button>
                </TabsContent>

                <TabsContent value="plan" className="mt-4 space-y-3">
                  <Box label="Meal plan"><Textarea rows={8} value={assess.meal_plan} onChange={(e) => setAssess({ ...assess, meal_plan: e.target.value })} placeholder="Breakfast / Lunch / Dinner / Snacks…" /></Box>
                  <Box label="Follow-up date"><Input type="date" value={assess.follow_up} onChange={(e) => setAssess({ ...assess, follow_up: e.target.value })} /></Box>
                  <div className="flex gap-2">
                    <Button onClick={() => issuePlan.mutate()} disabled={issuePlan.isPending}><Apple className="h-4 w-4" />Issue nutrition plan</Button>
                    <Button variant="outline" disabled><CalendarPlus className="h-4 w-4" />Schedule follow-up</Button>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-4 space-y-2">
                  {myPlans.length === 0 && <p className="text-sm text-muted-foreground">No past plans.</p>}
                  {myPlans.map((p) => {
                    const kind = (p.plan as { kind?: string } | null)?.kind ?? "plan";
                    return (
                      <div key={p.id} className="rounded border p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{p.start_date ?? "—"} → {p.end_date ?? "—"}</div>
                          <span className="rounded bg-muted px-2 py-0.5 text-xs capitalize">{kind}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{p.notes ?? "—"}</div>
                      </div>
                    );
                  })}
                </TabsContent>
              </Tabs>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Box({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label><div className="mt-1">{children}</div></div>;
}

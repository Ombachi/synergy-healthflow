import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Apple, CalendarPlus, Save } from "lucide-react";
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
interface Plan { id: string; athlete_id: string; notes: string | null; start_date: string | null; end_date: string | null; compliance_pct: number | null; plan: Record<string, unknown> }

function NutritionStation() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const plans = useQuery({
    queryKey: ["nut-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("nutrition_plans" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Plan[]) ?? [];
    },
  });

  useEffect(() => {
    if (!selectedId && athletes.data && athletes.data.length > 0) setSelectedId(athletes.data[0].id);
  }, [athletes.data, selectedId]);

  const selected = athletes.data?.find((a) => a.id === selectedId) ?? null;

  const [assess, setAssess] = useState({ weight: "", height: "", muac: "", diet_history: "", diagnosis: "", meal_plan: "", recommendations: "", follow_up: "" });

  useEffect(() => {
    if (selected) {
      setAssess({
        weight: selected.weight_kg?.toString() ?? "",
        height: selected.height_cm?.toString() ?? "",
        muac: "", diet_history: "", diagnosis: "", meal_plan: "", recommendations: "", follow_up: "",
      });
    }
  }, [selected?.id]);

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

  const saveAssessment = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick an athlete");
      const w = assess.weight ? Number(assess.weight) : null;
      const h = assess.height ? Number(assess.height) : null;
      const { error } = await supabase.from("athletes" as never)
        .update({ weight_kg: w, height_cm: h } as never).eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nut-athletes"] }); toast.success("Assessment saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const issuePlan = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick an athlete");
      const planJson = {
        bmi, muac: assess.muac, diet_history: assess.diet_history,
        diagnosis: assess.diagnosis, recommendations: assess.recommendations,
        meal_plan: assess.meal_plan,
      };
      const { error } = await supabase.from("nutrition_plans" as never).insert({
        athlete_id: selected.id, nutritionist_id: user!.id,
        notes: assess.recommendations || null,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: assess.follow_up || null,
        plan: planJson,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["nut-plans"] }); toast.success("Nutrition plan issued"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const myPlans = (plans.data ?? []).filter((p) => p.athlete_id === selectedId);

  return (
    <div className="grid h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[320px_1fr]">
      {/* LEFT: athlete queue */}
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-3">
          <div className="flex items-center gap-2 font-semibold"><Apple className="h-4 w-4 text-emerald-600" />Athletes</div>
          <div className="text-xs text-muted-foreground">{athletes.data?.length ?? 0} on roster</div>
        </div>
        <div className="flex-1 overflow-auto">
          {athletes.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No athletes registered.</div>}
          {athletes.data?.map((a) => {
            const active = a.id === selectedId;
            return (
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                className={`flex w-full flex-col gap-0.5 border-l-4 border-b p-3 text-left text-sm transition ${
                  active ? "bg-accent border-l-primary" : "border-l-transparent hover:bg-accent/40"
                }`}>
                <div className="font-medium">{a.full_name}</div>
                <div className="text-xs text-muted-foreground">{a.sport ?? "—"} · {a.team ?? "—"}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex flex-col overflow-hidden rounded-lg border bg-card">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select an athlete.</div>
        ) : (
          <div className="flex flex-1 flex-col overflow-auto">
            <div className="flex items-center gap-4 border-b bg-muted/30 p-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-lg font-semibold text-emerald-700">
                {selected.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold">{selected.full_name}</div>
                <div className="text-xs text-muted-foreground">{ageOf(selected.date_of_birth)} · {selected.sport ?? "—"} · {selected.team ?? "—"}</div>
              </div>
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
                  <Button variant="outline" onClick={() => saveAssessment.mutate()} disabled={saveAssessment.isPending}>
                    <Save className="h-4 w-4" /> Save assessment
                  </Button>
                </TabsContent>

                <TabsContent value="diet" className="mt-4">
                  <Box label="Diet history"><Textarea rows={6} value={assess.diet_history} onChange={(e) => setAssess({ ...assess, diet_history: e.target.value })} placeholder="Typical day's intake, eating patterns, supplements…" /></Box>
                </TabsContent>

                <TabsContent value="diagnosis" className="mt-4">
                  <Box label="Nutrition diagnosis"><Textarea rows={4} value={assess.diagnosis} onChange={(e) => setAssess({ ...assess, diagnosis: e.target.value })} /></Box>
                  <div className="mt-3"><Box label="Recommendations"><Textarea rows={4} value={assess.recommendations} onChange={(e) => setAssess({ ...assess, recommendations: e.target.value })} /></Box></div>
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
                  {myPlans.map((p) => (
                    <div key={p.id} className="rounded border p-3 text-sm">
                      <div className="font-medium">{p.start_date ?? "—"} → {p.end_date ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.notes ?? "—"}</div>
                    </div>
                  ))}
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

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, TrendingUp, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/assessments")({
  component: AssessmentsPage,
});

interface Template {
  id: string; code: string; name: string; category: string; description: string | null;
  questions: { q: string }[];
  scoring: { type: string; options: string[]; bands: { max: number; label: string; alert?: boolean }[] };
}
interface Response {
  id: string; user_id: string; template_code: string; answers: Record<string, number>;
  score: number | null; severity: string | null; alert: boolean; created_at: string;
}

function classify(score: number, bands: Template["scoring"]["bands"]) {
  for (const b of bands) if (score <= b.max) return b;
  return bands[bands.length - 1];
}

function AssessmentsPage() {
  const { user, hasAnyRole } = useAuth();
  const qc = useQueryClient();
  const isClinician = hasAnyRole(["admin","doctor","nurse","physio","nutritionist"]);
  const [active, setActive] = useState<Template | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const templates = useQuery({
    queryKey: ["assessment-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_templates" as never).select("*").eq("active", true).order("category");
      if (error) throw error; return (data as unknown as Template[]) ?? [];
    },
  });

  const myResponses = useQuery({
    queryKey: ["my-assessments", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_responses" as never).select("*").eq("user_id", user!.id).order("created_at", { ascending: false });
      if (error) throw error; return (data as unknown as Response[]) ?? [];
    },
  });

  const clinicianResponses = useQuery({
    queryKey: ["all-flagged-assessments"],
    enabled: isClinician,
    queryFn: async () => {
      const { data, error } = await supabase.from("assessment_responses" as never).select("*").eq("alert", true).order("created_at", { ascending: false }).limit(100);
      if (error) throw error; return (data as unknown as Response[]) ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const total = Object.values(answers).reduce((s, v) => s + (Number(v) || 0), 0);
      const band = classify(total, active.scoring.bands);
      const { error } = await supabase.from("assessment_responses" as never).insert({
        user_id: user!.id,
        template_code: active.code,
        answers: answers as never,
        score: total,
        severity: band.label,
        alert: !!band.alert,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Assessment submitted");
      setActive(null); setAnswers({});
      qc.invalidateQueries({ queryKey: ["my-assessments", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const m: Record<string, Template[]> = {};
    (templates.data ?? []).forEach((t) => { (m[t.category] ??= []).push(t); });
    return m;
  }, [templates.data]);

  const trendsByCode = useMemo(() => {
    const m: Record<string, { t: string; score: number }[]> = {};
    (myResponses.data ?? []).slice().reverse().forEach((r) => {
      (m[r.template_code] ??= []).push({ t: new Date(r.created_at).toLocaleDateString(), score: Number(r.score ?? 0) });
    });
    return m;
  }, [myResponses.data]);

  // --- Filling out a template ---
  if (active) {
    const allAnswered = active.questions.every((_, i) => typeof answers[i] === "number");
    const liveScore = Object.values(answers).reduce((s, v) => s + (Number(v) || 0), 0);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground">{active.category}</div>
            <h1 className="text-2xl font-semibold">{active.name}</h1>
            {active.description && <p className="text-sm text-muted-foreground">{active.description}</p>}
          </div>
          <Button variant="outline" onClick={() => { setActive(null); setAnswers({}); }}>Cancel</Button>
        </div>

        <div className="rounded-lg border bg-card">
          {active.questions.map((q, i) => (
            <div key={i} className="border-b p-4">
              <div className="text-sm font-medium">{i + 1}. {q.q}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {active.scoring.options.map((opt, idx) => (
                  <button key={idx}
                    onClick={() => setAnswers({ ...answers, [i]: idx })}
                    className={`rounded-md border px-3 py-1.5 text-sm ${answers[i] === idx ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                    <span className="mr-1 text-xs opacity-70">{idx}</span> {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between rounded-lg border bg-card p-3 shadow">
          <div className="text-sm">Running total: <span className="font-semibold">{liveScore}</span></div>
          <Button disabled={!allAnswered || submit.isPending} onClick={() => submit.mutate()}>Submit assessment</Button>
        </div>
      </div>
    );
  }

  // --- Listing / dashboard ---
  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ClipboardList className="h-6 w-6 text-primary" /> Assessment & Screening Hub</h1>
        <p className="text-sm text-muted-foreground">Complete validated screening tools. Scores are auto-classified, flagged when high-risk, and shared with your clinician.</p>
      </div>

      <Tabs defaultValue="available" className="space-y-4">
        <TabsList>
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="history">My history</TabsTrigger>
          <TabsTrigger value="trends"><TrendingUp className="mr-1 h-4 w-4" /> Trends</TabsTrigger>
          {isClinician && <TabsTrigger value="alerts"><AlertTriangle className="mr-1 h-4 w-4" /> Clinician inbox</TabsTrigger>}
        </TabsList>

        <TabsContent value="available" className="space-y-4">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="rounded-lg border bg-card">
              <div className="border-b p-3 text-sm font-medium">{cat}</div>
              <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((t) => (
                  <button key={t.id} onClick={() => { setActive(t); setAnswers({}); }} className="rounded-md border p-3 text-left hover:border-primary hover:bg-accent/30">
                    <div className="text-sm font-medium">{t.name}</div>
                    {t.description && <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>}
                    <div className="mt-2 text-xs text-muted-foreground">{t.questions.length} items</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="history" className="space-y-2">
          {(myResponses.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No completed assessments yet.</p>}
          {myResponses.data?.map((r) => (
            <div key={r.id} className={`rounded border p-3 text-sm ${r.alert ? "border-rose-500 bg-rose-500/10" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{r.template_code}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              <div className="mt-1">Score: <strong>{r.score}</strong> · Severity: <strong>{r.severity}</strong>{r.alert ? " · ⚠ flagged" : ""}</div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          {Object.entries(trendsByCode).filter(([,d]) => d.length >= 2).map(([code, data]) => (
            <div key={code} className="rounded-lg border bg-card p-3">
              <div className="mb-2 text-sm font-medium">{code}</div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" /><YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
          {Object.values(trendsByCode).every((d) => d.length < 2) && <p className="text-sm text-muted-foreground">Complete an assessment twice to see your trend.</p>}
        </TabsContent>

        {isClinician && (
          <TabsContent value="alerts" className="space-y-2">
            {(clinicianResponses.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No flagged assessments.</p>}
            {clinicianResponses.data?.map((r) => (
              <div key={r.id} className="rounded border border-rose-500 bg-rose-500/10 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.template_code} · {r.severity}</span>
                  <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs">User: {r.user_id.slice(0,8)} · Score {r.score}</div>
              </div>
            ))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

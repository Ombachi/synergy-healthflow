import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity, Droplets, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RoleGate } from "@/components/role-gate";
import { AdmissionPicker } from "@/components/admission-picker";
import { calcNews2, calcMews, calcGcs, calcBraden, calcMorse, type Risk } from "@/lib/warning-scores";

export const Route = createFileRoute("/_authenticated/monitoring")({
  component: () => <RoleGate path="/monitoring"><MonitoringPage /></RoleGate>,
});

interface Score { id: string; scale: string; total_score: number; risk_level: string | null; scored_at: string; components: Record<string, unknown> }
interface Fluid { id: string; recorded_at: string; direction: string; route: string; volume_ml: number }

function riskBadge(r: string | null) {
  const cls = r === "high" ? "bg-rose-600" : r === "medium" ? "bg-amber-500" : "bg-emerald-600";
  return <Badge className={cls}>{r ?? "—"}</Badge>;
}

function MonitoringPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [adm, setAdm] = useState("");

  const scores = useQuery({
    queryKey: ["ws", adm], enabled: !!adm,
    queryFn: async () => {
      const { data } = await supabase.from("warning_scores" as never).select("*").eq("admission_id", adm).order("scored_at", { ascending: false });
      return (data as unknown as Score[]) ?? [];
    },
  });
  const fluids = useQuery({
    queryKey: ["fb", adm], enabled: !!adm,
    queryFn: async () => {
      const { data } = await supabase.from("fluid_balance_entries" as never).select("*").eq("admission_id", adm).order("recorded_at", { ascending: false });
      return (data as unknown as Fluid[]) ?? [];
    },
  });

  const saveScore = useMutation({
    mutationFn: async (p: { scale: string; total: number; risk: Risk; components: Record<string, unknown> }) => {
      const { error } = await supabase.from("warning_scores" as never).insert({
        admission_id: adm, scored_by: user?.id, scale: p.scale, total_score: p.total, risk_level: p.risk, components: p.components,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Score saved"); qc.invalidateQueries({ queryKey: ["ws", adm] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveFluid = useMutation({
    mutationFn: async (p: { direction: string; route: string; volume_ml: number }) => {
      const { error } = await supabase.from("fluid_balance_entries" as never).insert({
        admission_id: adm, recorded_by: user?.id, ...p,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recorded"); qc.invalidateQueries({ queryKey: ["fb", adm] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Totals for last 24h
  const cutoff = Date.now() - 86400000;
  const recent = (fluids.data ?? []).filter((f) => new Date(f.recorded_at).getTime() > cutoff);
  const intake = recent.filter((f) => f.direction === "intake").reduce((s, f) => s + f.volume_ml, 0);
  const output = recent.filter((f) => f.direction === "output").reduce((s, f) => s + f.volume_ml, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Gauge className="h-6 w-6" /> Clinical monitoring</h1>
        <p className="text-sm text-muted-foreground">NEWS2, MEWS, GCS, Braden, Morse Fall Scale, and fluid balance.</p>
      </div>
      <Card><CardContent className="p-4"><AdmissionPicker value={adm} onChange={setAdm} /></CardContent></Card>

      {adm && (
        <Tabs defaultValue="news2">
          <TabsList className="flex-wrap">
            <TabsTrigger value="news2">NEWS2</TabsTrigger>
            <TabsTrigger value="mews">MEWS</TabsTrigger>
            <TabsTrigger value="gcs">GCS</TabsTrigger>
            <TabsTrigger value="braden">Braden</TabsTrigger>
            <TabsTrigger value="morse">Morse</TabsTrigger>
            <TabsTrigger value="fluid">Fluid balance</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="news2"><News2Card onSave={(p) => saveScore.mutate(p)} /></TabsContent>
          <TabsContent value="mews"><MewsCard onSave={(p) => saveScore.mutate(p)} /></TabsContent>
          <TabsContent value="gcs"><GcsCard onSave={(p) => saveScore.mutate(p)} /></TabsContent>
          <TabsContent value="braden"><BradenCard onSave={(p) => saveScore.mutate(p)} /></TabsContent>
          <TabsContent value="morse"><MorseCard onSave={(p) => saveScore.mutate(p)} /></TabsContent>

          <TabsContent value="fluid">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Droplets className="h-4 w-4" /> Record fluid</CardTitle></CardHeader>
              <CardContent><FluidForm onSave={(p) => saveFluid.mutate(p)} /></CardContent>
            </Card>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Intake (24h)</div><div className="text-2xl font-semibold">{intake} ml</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Output (24h)</div><div className="text-2xl font-semibold">{output} ml</div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Net (24h)</div><div className="text-2xl font-semibold">{intake - output} ml</div></CardContent></Card>
            </div>
            <Card className="mt-4">
              <CardHeader className="pb-2"><CardTitle className="text-base">Recent entries</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {(fluids.data ?? []).slice(0, 30).map((f) => (
                  <div key={f.id} className="flex justify-between border-b py-1">
                    <span><Badge variant="outline" className="capitalize">{f.direction}</Badge> {f.route} · {f.volume_ml} ml</span>
                    <span className="text-muted-foreground">{new Date(f.recorded_at).toLocaleString()}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Score history</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                {(scores.data ?? []).length === 0 && <p className="text-muted-foreground">No scores recorded yet.</p>}
                {(scores.data ?? []).map((s) => (
                  <div key={s.id} className="flex justify-between border-b py-1">
                    <span className="uppercase font-medium">{s.scale}</span>
                    <span>{s.total_score} {riskBadge(s.risk_level)}</span>
                    <span className="text-muted-foreground">{new Date(s.scored_at).toLocaleString()}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <div><Label>{label}</Label><Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></div>
  );
}

function News2Card({ onSave }: { onSave: (p: { scale: string; total: number; risk: Risk; components: Record<string, unknown> }) => void }) {
  const [v, setV] = useState({ respRate: 16, spo2: 97, onOxygen: false, systolicBp: 120, pulse: 80, consciousness: "A" as const, tempC: 36.8 });
  const r = calcNews2(v);
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">NEWS2</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <NumField label="Resp rate" value={v.respRate} onChange={(n) => setV((s) => ({ ...s, respRate: n }))} />
          <NumField label="SpO2 %" value={v.spo2} onChange={(n) => setV((s) => ({ ...s, spo2: n }))} />
          <NumField label="Systolic BP" value={v.systolicBp} onChange={(n) => setV((s) => ({ ...s, systolicBp: n }))} />
          <NumField label="Pulse" value={v.pulse} onChange={(n) => setV((s) => ({ ...s, pulse: n }))} />
          <NumField label="Temp °C" value={v.tempC} step={0.1} onChange={(n) => setV((s) => ({ ...s, tempC: n }))} />
          <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={v.onOxygen} onChange={(e) => setV((s) => ({ ...s, onOxygen: e.target.checked }))} /> On supplemental O₂</label>
        </div>
        <div className="flex items-center gap-3">
          <span>Total: <b>{r.total}</b></span>{riskBadge(r.risk)}
          <Button className="ml-auto" onClick={() => onSave({ scale: "news2", total: r.total, risk: r.risk, components: v })}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MewsCard({ onSave }: { onSave: (p: { scale: string; total: number; risk: Risk; components: Record<string, unknown> }) => void }) {
  const [v, setV] = useState({ systolicBp: 120, pulse: 80, respRate: 16, tempC: 36.8, avpu: "A" as const });
  const r = calcMews(v);
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">MEWS</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <NumField label="Systolic BP" value={v.systolicBp} onChange={(n) => setV((s) => ({ ...s, systolicBp: n }))} />
          <NumField label="Pulse" value={v.pulse} onChange={(n) => setV((s) => ({ ...s, pulse: n }))} />
          <NumField label="Resp rate" value={v.respRate} onChange={(n) => setV((s) => ({ ...s, respRate: n }))} />
          <NumField label="Temp °C" value={v.tempC} step={0.1} onChange={(n) => setV((s) => ({ ...s, tempC: n }))} />
        </div>
        <div className="flex items-center gap-3">
          <span>Total: <b>{r.total}</b></span>{riskBadge(r.risk)}
          <Button className="ml-auto" onClick={() => onSave({ scale: "mews", total: r.total, risk: r.risk, components: v })}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function GcsCard({ onSave }: { onSave: (p: { scale: string; total: number; risk: Risk; components: Record<string, unknown> }) => void }) {
  const [v, setV] = useState({ eye: 4, verbal: 5, motor: 6 });
  const r = calcGcs(v);
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">Glasgow Coma Scale</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <NumField label="Eye (1–4)" value={v.eye} onChange={(n) => setV((s) => ({ ...s, eye: n }))} />
          <NumField label="Verbal (1–5)" value={v.verbal} onChange={(n) => setV((s) => ({ ...s, verbal: n }))} />
          <NumField label="Motor (1–6)" value={v.motor} onChange={(n) => setV((s) => ({ ...s, motor: n }))} />
        </div>
        <div className="flex items-center gap-3">
          <span>Total: <b>{r.total}</b>/15</span>{riskBadge(r.risk)}
          <Button className="ml-auto" onClick={() => onSave({ scale: "gcs", total: r.total, risk: r.risk, components: v })}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BradenCard({ onSave }: { onSave: (p: { scale: string; total: number; risk: Risk; components: Record<string, unknown> }) => void }) {
  const [v, setV] = useState({ sensory: 4, moisture: 4, activity: 4, mobility: 4, nutrition: 4, friction: 3 });
  const r = calcBraden(v);
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">Braden (pressure injury risk)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          {(["sensory", "moisture", "activity", "mobility", "nutrition", "friction"] as const).map((k) => (
            <NumField key={k} label={k[0].toUpperCase() + k.slice(1)} value={v[k]} onChange={(n) => setV((s) => ({ ...s, [k]: n }))} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span>Total: <b>{r.total}</b></span>{riskBadge(r.risk)}
          <Button className="ml-auto" onClick={() => onSave({ scale: "braden", total: r.total, risk: r.risk, components: v })}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MorseCard({ onSave }: { onSave: (p: { scale: string; total: number; risk: Risk; components: Record<string, unknown> }) => void }) {
  const [v, setV] = useState({ historyFalls: 0 as 0 | 25, secondaryDx: 0 as 0 | 15, ambulatoryAid: 0 as 0 | 15 | 30, ivTherapy: 0 as 0 | 20, gait: 0 as 0 | 10 | 20, mentalStatus: 0 as 0 | 15 });
  const r = calcMorse(v);
  const pair = <K extends keyof typeof v>(k: K, label: string, options: (typeof v)[K][]) => (
    <div><Label>{label}</Label>
      <Select value={String(v[k])} onValueChange={(val) => setV((s) => ({ ...s, [k]: Number(val) as (typeof v)[K] }))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o} value={String(o)}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  return (
    <Card><CardHeader className="pb-2"><CardTitle className="text-base">Morse Fall Scale</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          {pair("historyFalls", "History of falls", [0, 25])}
          {pair("secondaryDx", "Secondary diagnosis", [0, 15])}
          {pair("ambulatoryAid", "Ambulatory aid", [0, 15, 30])}
          {pair("ivTherapy", "IV therapy", [0, 20])}
          {pair("gait", "Gait", [0, 10, 20])}
          {pair("mentalStatus", "Mental status", [0, 15])}
        </div>
        <div className="flex items-center gap-3">
          <span>Total: <b>{r.total}</b></span>{riskBadge(r.risk)}
          <Button className="ml-auto" onClick={() => onSave({ scale: "morse", total: r.total, risk: r.risk, components: v })}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FluidForm({ onSave }: { onSave: (p: { direction: string; route: string; volume_ml: number }) => void }) {
  const [f, setF] = useState({ direction: "intake", route: "oral", volume_ml: 200 });
  return (
    <div className="grid gap-2 md:grid-cols-4">
      <div>
        <Label>Direction</Label>
        <Select value={f.direction} onValueChange={(v) => setF((x) => ({ ...x, direction: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="intake">Intake</SelectItem><SelectItem value="output">Output</SelectItem></SelectContent>
        </Select>
      </div>
      <div>
        <Label>Route</Label>
        <Select value={f.route} onValueChange={(v) => setF((x) => ({ ...x, route: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {["oral", "iv", "ng", "urine", "drain", "stool", "vomit", "other"].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <NumField label="Volume (ml)" value={f.volume_ml} onChange={(n) => setF((x) => ({ ...x, volume_ml: n }))} />
      <div className="flex items-end"><Button className="w-full" onClick={() => onSave(f)}>Record</Button></div>
    </div>
  );
}

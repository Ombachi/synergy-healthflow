import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface PanelAnalyte { analyte: string; units?: string | null; target?: number | null; sd?: number | null }
interface QcPanel { id: string; code: string; name: string; section: string; analytes: PanelAnalyte[]; levels: string[] }

/** Level multiplier applied to the panel's normal-level target to seed low/high controls. */
const LEVEL_FACTOR: Record<string, number> = { low: 0.7, normal: 1, high: 1.35 };

function grade(z: number | null): "pass" | "warn" | "fail" {
  if (z == null || Number.isNaN(z)) return "pass";
  const a = Math.abs(z);
  if (a >= 3) return "fail";
  if (a >= 2) return "warn";
  return "pass";
}

/**
 * Multi-level QC entry: one control lot, every analyte of a panel (FBC/UEC/LFT…)
 * captured across the low / normal / high control materials in a single save.
 */
export function QcPanelEntry({ instrumentId, section, canWrite }: { instrumentId: string; section: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [panelId, setPanelId] = useState("");
  const [lot, setLot] = useState("");
  const [runAt, setRunAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  // values[analyte][level] = observed
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});

  const panels = useQuery({
    queryKey: ["qc_panels"],
    queryFn: async () => {
      const { data, error } = await supabase.from("qc_panels" as never).select("*").order("name");
      if (error) throw error;
      return (data as unknown as QcPanel[]) ?? [];
    },
  });

  const available = useMemo(() => {
    const all = panels.data ?? [];
    const mine = all.filter((p) => p.section.toLowerCase() === section.toLowerCase());
    return mine.length ? mine : all;
  }, [panels.data, section]);

  const panel = available.find((p) => p.id === panelId) ?? null;
  const levels = panel?.levels ?? ["low", "normal", "high"];

  useEffect(() => { setValues({}); }, [panelId]);

  function targetFor(a: PanelAnalyte, level: string) {
    const base = a.target == null ? null : Number(a.target);
    if (base == null) return null;
    return Math.round(base * (LEVEL_FACTOR[level] ?? 1) * 1000) / 1000;
  }

  const rows = useMemo(() => {
    if (!panel) return [];
    return panel.analytes.map((a) => ({
      analyte: a,
      cells: levels.map((lv) => {
        const raw = values[a.analyte]?.[lv] ?? "";
        const observed = raw === "" ? null : Number(raw);
        const target = targetFor(a, lv);
        const sd = a.sd == null ? null : Number(a.sd);
        const z = observed != null && target != null && sd ? Math.round(((observed - target) / sd) * 100) / 100 : null;
        return { level: lv, raw, observed, target, sd, z, result: grade(z) };
      }),
    }));
  }, [panel, values, levels]);

  const filled = rows.reduce((n, r) => n + r.cells.filter((c) => c.observed != null).length, 0);
  const failures = rows.reduce((n, r) => n + r.cells.filter((c) => c.observed != null && c.result === "fail").length, 0);

  const save = useMutation({
    mutationFn: async () => {
      if (!panel) throw new Error("Select a QC panel");
      const payload = rows.flatMap((r) =>
        r.cells
          .filter((c) => c.observed != null)
          .map((c) => ({
            instrument_id: instrumentId,
            run_at: new Date(runAt).toISOString(),
            analyte: r.analyte.analyte,
            qc_level: c.level,
            panel: panel.code,
            lot_number: lot || null,
            target_value: c.target,
            sd: c.sd,
            observed_value: c.observed,
            z_score: c.z,
            result: c.result,
          })),
      );
      if (payload.length === 0) throw new Error("Enter at least one control value");
      const { error } = await supabase.from("instrument_qc_runs" as never).insert(payload as never);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} QC result${n === 1 ? "" : "s"} saved`);
      setOpen(false); setValues({});
      qc.invalidateQueries({ queryKey: ["instrument_qc_runs", instrumentId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canWrite) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><ClipboardCheck className="h-4 w-4" /> Panel QC run</Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>Multi-level panel QC</DialogTitle></DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Panel</Label>
            <Select value={panelId} onValueChange={setPanelId}>
              <SelectTrigger><SelectValue placeholder="Select panel" /></SelectTrigger>
              <SelectContent>
                {available.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.section})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Control lot</Label><Input value={lot} onChange={(e) => setLot(e.target.value)} placeholder="e.g. LOT-2451" /></div>
          <div><Label>Run at</Label><Input type="datetime-local" value={runAt} onChange={(e) => setRunAt(e.target.value)} /></div>
        </div>

        {!panel ? (
          <p className="py-6 text-sm text-muted-foreground">Choose a panel to load its analytes and control levels.</p>
        ) : (
          <div className="max-h-[52vh] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs">
                <tr>
                  <th className="p-2 text-left">Analyte</th>
                  {levels.map((lv) => <th key={lv} className="p-2 text-left capitalize">{lv} control</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.analyte.analyte}>
                    <td className="p-2">
                      <div className="font-medium">{r.analyte.analyte}</div>
                      <div className="text-xs text-muted-foreground">{r.analyte.units ?? ""}{r.analyte.sd != null ? ` · SD ${r.analyte.sd}` : ""}</div>
                    </td>
                    {r.cells.map((c) => (
                      <td key={c.level} className="p-2 align-top">
                        <Input
                          className="h-8"
                          inputMode="decimal"
                          placeholder={c.target == null ? "value" : String(c.target)}
                          value={c.raw}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [r.analyte.analyte]: { ...(prev[r.analyte.analyte] ?? {}), [c.level]: e.target.value },
                            }))
                          }
                        />
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          target {c.target ?? "—"}
                          {c.z != null && (
                            <span className={c.result === "fail" ? " font-semibold text-destructive" : c.result === "warn" ? " text-amber-600" : " text-emerald-600"}>
                              {" "}· z {c.z} ({c.result})
                            </span>
                          )}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {filled} value{filled === 1 ? "" : "s"} entered{failures > 0 ? ` · ${failures} out of range (≥3SD)` : ""}
          </span>
          <Button disabled={save.isPending || filled === 0} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save QC run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

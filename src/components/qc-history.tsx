import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePager, Pager } from "@/components/pager";
import { exportQcHistoryPDF } from "@/lib/qc-report-pdf";

interface Run {
  id: string; run_at: string; analyte: string; qc_level: string; lot_number: string | null;
  target_value: number | null; sd: number | null; observed_value: number | null;
  z_score: number | null; result: string; comments: string | null;
}

interface InstrumentMeta {
  name: string; manufacturer: string | null; model: string | null;
  serial_number: string | null; lab_section: string; location: string | null;
}

const ALL = "__all__";
const dt = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

/** Filterable QC run history for one analyzer, with PDF export of the current view. */
export function QcHistory({ instrumentId, instrument }: { instrumentId: string; instrument: InstrumentMeta }) {
  const [analyte, setAnalyte] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [result, setResult] = useState(ALL);
  const [lot, setLot] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const runs = useQuery({
    queryKey: ["instrument_qc_runs", instrumentId],
    queryFn: async () => {
      const { data } = await supabase
        .from("instrument_qc_runs" as never)
        .select("*")
        .eq("instrument_id", instrumentId)
        .order("run_at", { ascending: false });
      return (data as unknown as Run[]) ?? [];
    },
  });

  const all = useMemo(() => runs.data ?? [], [runs.data]);
  const analytes = useMemo(() => [...new Set(all.map((r) => r.analyte))].sort(), [all]);
  const levels = useMemo(() => [...new Set(all.map((r) => r.qc_level))].sort(), [all]);
  const lots = useMemo(() => [...new Set(all.map((r) => r.lot_number).filter(Boolean) as string[])].sort(), [all]);

  const filtered = useMemo(() => {
    const fromMs = from ? new Date(from).getTime() : null;
    const toMs = to ? new Date(to).getTime() + 86_400_000 : null;
    return all.filter((r) => {
      if (analyte !== ALL && r.analyte !== analyte) return false;
      if (level !== ALL && r.qc_level !== level) return false;
      if (result !== ALL && r.result !== result) return false;
      if (lot !== ALL && (r.lot_number ?? "") !== lot) return false;
      const t = new Date(r.run_at).getTime();
      if (fromMs && t < fromMs) return false;
      if (toMs && t > toMs) return false;
      return true;
    });
  }, [all, analyte, level, result, lot, from, to]);

  const pager = usePager(filtered, 25);

  const stats = useMemo(() => {
    const pass = filtered.filter((r) => r.result === "pass").length;
    return {
      total: filtered.length,
      pass,
      warn: filtered.filter((r) => r.result === "warn").length,
      fail: filtered.filter((r) => r.result === "fail").length,
      rate: filtered.length ? Math.round((pass / filtered.length) * 100) : null,
    };
  }, [filtered]);

  const filterLabel = [
    analyte === ALL ? "All analytes" : analyte,
    level === ALL ? "all levels" : level,
    result === ALL ? "all outcomes" : result,
    lot === ALL ? "all lots" : `lot ${lot}`,
    from || to ? `${from || "start"} → ${to || "today"}` : "all dates",
  ].join(" · ");

  const reset = () => { setAnalyte(ALL); setLevel(ALL); setResult(ALL); setLot(ALL); setFrom(""); setTo(""); };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-end gap-2 border-b p-3">
        <div className="mr-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <FilterSelect label="Analyte" value={analyte} onChange={setAnalyte} options={analytes} allLabel="All analytes" />
        <FilterSelect label="Level" value={level} onChange={setLevel} options={levels} allLabel="All levels" />
        <FilterSelect label="Result" value={result} onChange={setResult} options={["pass", "warn", "fail"]} allLabel="All outcomes" />
        <FilterSelect label="Control lot" value={lot} onChange={setLot} options={lots} allLabel="All lots" />
        <div>
          <Label className="text-xs">From</Label>
          <Input type="date" className="h-8 w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="date" className="h-8 w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button size="sm" variant="ghost" className="h-8" onClick={reset}>Reset</Button>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={filtered.length === 0}
            onClick={() => exportQcHistoryPDF({ instrument, filters: filterLabel, runs: filtered })}
          >
            <Download className="h-3.5 w-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 border-b px-3 py-2 text-xs">
        <span><span className="text-muted-foreground">Runs</span> <b>{stats.total}</b></span>
        <span className="text-emerald-600">Pass <b>{stats.pass}</b></span>
        <span className="text-amber-600">Warn <b>{stats.warn}</b></span>
        <span className="text-destructive">Fail <b>{stats.fail}</b></span>
        <span><span className="text-muted-foreground">Pass rate</span> <b>{stats.rate == null ? "—" : `${stats.rate}%`}</b></span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              {["Run at", "Analyte", "Level", "Lot", "Target ± SD", "Observed", "Z", "Result", "Comments"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {pager.slice.length === 0 && (
              <tr><td colSpan={9} className="p-4 text-sm text-muted-foreground">No QC runs match these filters.</td></tr>
            )}
            {pager.slice.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2 text-xs">{dt(r.run_at)}</td>
                <td className="px-3 py-2">{r.analyte}</td>
                <td className="px-3 py-2 text-xs">{r.qc_level}</td>
                <td className="px-3 py-2 text-xs">{r.lot_number ?? "—"}</td>
                <td className="px-3 py-2 text-xs">{r.target_value ?? "—"} ± {r.sd ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.observed_value ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.z_score == null ? "—" : Number(r.z_score).toFixed(2)}</td>
                <td className={`px-3 py-2 text-xs font-semibold ${r.result === "fail" ? "text-destructive" : r.result === "warn" ? "text-amber-600" : "text-emerald-600"}`}>{r.result}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-xs text-muted-foreground">{r.comments ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager {...pager} label="QC runs" />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, allLabel }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; allLabel: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

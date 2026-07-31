import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceArea } from "recharts";
import { AlertTriangle, Download, FlaskConical, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { exportLabReportPDF } from "@/lib/lab-report-pdf";

interface LabOrder {
  id: string; test_id: string; created_at: string; status: string; patient_id: string; visit_id: string | null;
}
interface LabTest { id: string; name: string; code: string; specimen: string | null }
interface LabResult { id: string; order_id: string; result_value: string | null; units: string | null; reference_range: string | null; abnormal_flag: string | null; performed_at: string | null; comments: string | null }
interface LabValue { id: string; order_id: string; parameter_name: string; value_text: string | null; value_numeric: number | null; units: string | null; reference_range: string | null; abnormal_flag: string | null; template_id: string | null }

export interface LabResultsViewerProps {
  patientId: string;
  patientName: string;
  mrn: string | null;
  age?: string | null;
  gender?: string | null;
}

/** Master-detail lab results viewer used in patient portal and doctor visit view. */
export function LabResultsViewer({ patientId, patientName, mrn, age, gender }: LabResultsViewerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ["lrv-orders", patientId],
    queryFn: async () => {
      const { data } = await supabase.from("lab_orders" as never)
        .select("id, test_id, created_at, status, patient_id, visit_id")
        .eq("patient_id", patientId).order("created_at", { ascending: false });
      return (data as unknown as LabOrder[]) ?? [];
    },
  });
  const orderIds = (orders.data ?? []).map((o) => o.id);
  const testIds = Array.from(new Set((orders.data ?? []).map((o) => o.test_id)));
  const tests = useQuery({
    queryKey: ["lrv-tests", testIds.join(",")], enabled: testIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("lab_tests_catalog" as never)
        .select("id, name, code, specimen").in("id", testIds as never);
      return (data as unknown as LabTest[]) ?? [];
    },
  });
  const results = useQuery({
    queryKey: ["lrv-results", orderIds.join(",")], enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("lab_results" as never).select("*").in("order_id", orderIds as never);
      return (data as unknown as LabResult[]) ?? [];
    },
  });
  const values = useQuery({
    queryKey: ["lrv-values", orderIds.join(",")], enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("lab_result_values" as never).select("*").in("order_id", orderIds as never);
      return (data as unknown as LabValue[]) ?? [];
    },
  });

  const testOf = (id: string) => tests.data?.find((t) => t.id === id);
  const testName = (id: string) => testOf(id)?.name ?? "Test";

  const selected = (orders.data ?? []).find((o) => o.id === selectedId)
    ?? (orders.data ?? [])[0] ?? null;

  const selValues = useMemo(
    () => (values.data ?? []).filter((v) => v.order_id === selected?.id),
    [values.data, selected?.id],
  );
  const selSummary = useMemo(
    () => (results.data ?? []).find((r) => r.order_id === selected?.id),
    [results.data, selected?.id],
  );
  const isCritical = useMemo(
    () => selValues.some((v) => v.abnormal_flag === "critical low" || v.abnormal_flag === "critical high"),
    [selValues],
  );

  // Trend: same test historical numeric values grouped by parameter
  const historyByParam = useMemo(() => {
    if (!selected) return new Map<string, { t: number; v: number }[]>();
    const sameTest = (orders.data ?? []).filter((o) => o.test_id === selected.test_id);
    const map = new Map<string, { t: number; v: number }[]>();
    for (const o of sameTest) {
      const performed = (results.data ?? []).find((r) => r.order_id === o.id)?.performed_at ?? o.created_at;
      const t = new Date(performed).getTime();
      for (const val of (values.data ?? []).filter((v) => v.order_id === o.id)) {
        const n = val.value_numeric;
        if (n == null || !Number.isFinite(n)) continue;
        const arr = map.get(val.parameter_name) ?? [];
        arr.push({ t, v: n });
        map.set(val.parameter_name, arr);
      }
    }
    // sort ascending
    for (const [, arr] of map) arr.sort((a, b) => a.t - b.t);
    return map;
  }, [selected, orders.data, results.data, values.data]);

  async function downloadPdf() {
    if (!selected) return;
    const rows = selValues.length
      ? selValues.map((p) => ({
          parameter_name: p.parameter_name, value_text: p.value_text,
          units: p.units, reference_range: p.reference_range, abnormal_flag: p.abnormal_flag,
        }))
      : [{
          parameter_name: testName(selected.test_id),
          value_text: selSummary?.result_value ?? null,
          units: selSummary?.units ?? null,
          reference_range: selSummary?.reference_range ?? null,
          abnormal_flag: selSummary?.abnormal_flag ?? null,
        }];
    await exportLabReportPDF({
      test_name: testName(selected.test_id),
      order_id: selected.id, ordered_at: selected.created_at,
      performed_at: selSummary?.performed_at ?? null,
      patient_name: patientName, mrn, age, gender,
      parameters: rows, comments: selSummary?.comments ?? null,
    });
  }

  if ((orders.data ?? []).length === 0) {
    return <p className="text-sm text-muted-foreground">No lab investigations ordered yet.</p>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-[280px_1fr]">
      {/* Master */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b p-2 text-xs font-medium text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" /> Investigations ({orders.data?.length ?? 0})
        </div>
        <div className="max-h-[65vh] overflow-auto">
          {orders.data?.map((o) => {
            const active = o.id === selected?.id;
            const hasResults = (values.data ?? []).some((v) => v.order_id === o.id) || (results.data ?? []).some((r) => r.order_id === o.id);
            const crit = (values.data ?? []).some((v) => v.order_id === o.id && (v.abnormal_flag === "critical low" || v.abnormal_flag === "critical high"));
            return (
              <button
                key={o.id}
                onClick={() => setSelectedId(o.id)}
                className={`flex w-full flex-col gap-0.5 border-l-4 border-b px-3 py-2 text-left text-xs transition ${
                  active ? "border-l-primary bg-accent" : "border-l-transparent hover:bg-accent/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{testName(o.test_id)}</span>
                  {crit && <AlertTriangle className="h-3 w-3 text-destructive" />}
                </div>
                <span className="text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString("en-GB")} · {hasResults ? "resulted" : o.status}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      <div className="rounded-lg border bg-card">
        {!selected ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Select an investigation.
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-base font-semibold">{testName(selected.test_id)}</div>
                <div className="text-xs text-muted-foreground">
                  Ordered {new Date(selected.created_at).toLocaleString("en-GB")}
                  {selSummary?.performed_at && ` · Reported ${new Date(selSummary.performed_at).toLocaleString("en-GB")}`}
                </div>
              </div>
              {(selValues.length > 0 || selSummary) && (
                <Button size="sm" variant="outline" onClick={downloadPdf}>
                  <Download className="h-4 w-4" /> PDF
                </Button>
              )}
            </div>

            {isCritical && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Critical value(s) detected — clinical action may be required.
              </div>
            )}

            {selValues.length > 0 ? (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      <th className="p-2 text-left">Parameter</th>
                      <th className="p-2 text-left">Result</th>
                      <th className="p-2 text-left">Units</th>
                      <th className="p-2 text-left">Reference</th>
                      <th className="p-2 text-left">Flag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selValues.map((v) => {
                      const crit = v.abnormal_flag === "critical low" || v.abnormal_flag === "critical high";
                      const abn = crit || v.abnormal_flag === "low" || v.abnormal_flag === "high";
                      return (
                        <tr key={v.id} className={`border-t ${crit ? "bg-destructive/5" : ""}`}>
                          <td className="p-2 font-medium">{v.parameter_name}</td>
                          <td className={`p-2 font-mono ${abn ? "font-semibold text-destructive" : ""}`}>{v.value_text ?? "—"}</td>
                          <td className="p-2 text-muted-foreground">{v.units ?? "—"}</td>
                          <td className="p-2 text-muted-foreground">{v.reference_range ?? "—"}</td>
                          <td className="p-2">
                            {v.abnormal_flag && (
                              <span className={crit ? "font-bold text-destructive" : abn ? "text-amber-600" : "text-emerald-600"}>
                                {v.abnormal_flag}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : selSummary ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="font-mono">{selSummary.result_value ?? "—"} {selSummary.units ?? ""}</div>
                {selSummary.reference_range && <div className="text-xs text-muted-foreground">Reference: {selSummary.reference_range}</div>}
                {selSummary.abnormal_flag && <div className="mt-1 text-xs text-destructive">{selSummary.abnormal_flag}</div>}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                Results pending.
              </div>
            )}

            {selSummary?.comments && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Interpretation</div>
                <div className="whitespace-pre-wrap">{selSummary.comments}</div>
              </div>
            )}

            {/* Trend charts */}
            {(() => {
              const params = Array.from(historyByParam.entries()).filter(([, arr]) => arr.length >= 2);
              if (params.length === 0) return null;
              return (
                <div className="rounded-md border p-3">
                  <div className="mb-2 flex items-center gap-1 text-xs font-medium">
                    <TrendingUp className="h-3.5 w-3.5 text-primary" /> Historical trends
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {params.slice(0, 6).map(([name, arr]) => {
                      const tpl = selValues.find((v) => v.parameter_name === name);
                      const ref = (tpl?.reference_range ?? "").match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
                      const refLow = ref ? Number(ref[1]) : null;
                      const refHigh = ref ? Number(ref[2]) : null;
                      const data = arr.map((p) => ({ t: p.t, v: p.v, label: new Date(p.t).toLocaleDateString("en-GB") }));
                      return (
                        <div key={name} className="rounded border bg-background p-2">
                          <div className="text-xs font-medium">{name}</div>
                          <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={data} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                <XAxis dataKey="label" fontSize={9} />
                                <YAxis fontSize={9} />
                                <Tooltip />
                                {refLow != null && refHigh != null && (
                                  <ReferenceArea y1={refLow} y2={refHigh} fill="#22c55e" fillOpacity={0.08} />
                                )}
                                <Line type="monotone" dataKey="v" stroke="#0f4c75" strokeWidth={2} dot={{ r: 2 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarClock, FileText, FlaskConical, HeartPulse, Receipt, Plus, Download, Pill, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportSickOffPDF } from "@/lib/sick-off-pdf";
import { exportPrescriptionPDF } from "@/lib/prescription-pdf";
import { LabResultsViewer } from "@/components/lab-results-viewer";
import { ImagingViewer } from "@/components/imaging-viewer";

export const Route = createFileRoute("/_authenticated/me")({ component: PatientTimeline });


const money = (cents: number) => `KES ${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Patient { id: string; full_name: string; medical_record_number: string | null; date_of_birth?: string | null; gender?: string | null }
interface Visit { id: string; opened_at: string; closed_at: string | null; status: string; reason: string | null; notes: string | null; triage_level: string | null }
interface Vital { id: string; visit_id: string; captured_at: string; systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null }
interface Rx { id: string; visit_id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null }
interface Discharge { visit_id: string; summary: string; treatment_plan: string | null; follow_up: string | null; finalized: boolean }
interface Appointment { id: string; scheduled_at: string; status: string; reason: string | null; doctor_id: string | null; department: string | null }
interface Invoice { id: string; visit_id: string | null; total_cents: number; paid_cents: number; status: string; created_at: string }
interface InvoiceItem { id: string; invoice_id: string; description: string; qty: number; unit_price_cents: number; amount_cents: number; kind: string }
interface Doctor { id: string; full_name: string | null; role: string }
interface LabOrderRow { id: string; test_id: string; created_at: string; status: string; visit_id: string | null }
interface LabResultRow { id: string; order_id: string; result_value: string | null; units: string | null; reference_range: string | null; abnormal_flag: string | null; performed_at: string | null; comments: string | null }
interface LabValueRow { id: string; order_id: string; parameter_name: string; value_text: string | null; units: string | null; reference_range: string | null; abnormal_flag: string | null }
interface LabTestRow { id: string; name: string; code: string }
interface SickRow { id: string; created_at: string; days: number; start_date: string; end_date: string; diagnosis: string | null; recommendation: string | null; doctor_id: string | null; patient_id: string }
interface ImagingRow { id: string; modality: string; status: string; findings: string | null; report: string | null; image_path: string | null; created_at: string; visit_id: string | null }

const RANGES_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365, all: 100000 };

function PatientTimeline() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [range, setRange] = useState<keyof typeof RANGES_DAYS>("30d");

  const patient = useQuery({
    queryKey: ["my-patient", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name, medical_record_number").eq("user_id", user!.id).maybeSingle();
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
  const appts = useQuery({ queryKey: ["my-appts", pid], enabled: !!pid, queryFn: async () => {
    const { data, error } = await supabase.from("appointments" as never).select("id, scheduled_at, status, reason, doctor_id, department").eq("patient_id", pid!).order("scheduled_at", { ascending: false });
    if (error) throw error; return (data as unknown as Appointment[]) ?? [];
  }});
  const invoices = useQuery({ queryKey: ["my-invoices", pid], enabled: !!pid, queryFn: async () => {
    const { data, error } = await supabase.from("invoices" as never).select("id, visit_id, total_cents, paid_cents, status, created_at").eq("patient_id", pid!).order("created_at", { ascending: false });
    if (error) throw error; return (data as unknown as Invoice[]) ?? [];
  }});
  const invoiceItems = useQuery({
    queryKey: ["my-invoice-items", (invoices.data ?? []).map((i) => i.id).join(",")],
    enabled: (invoices.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (invoices.data ?? []).map((i) => i.id);
      const { data, error } = await supabase.from("invoice_items" as never).select("*").in("invoice_id", ids as never);
      if (error) throw error;
      return (data as unknown as InvoiceItem[]) ?? [];
    },
  });
  const doctors = useQuery({
    queryKey: ["me-doctors"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_messageable_users" as never);
      if (error) throw error;
      return ((data as unknown as Doctor[]) ?? []).filter((u) => u.role === "doctor");
    },
  });

  // Lab results owned by this patient
  const labOrders = useQuery({
    queryKey: ["my-lab-orders", pid], enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_orders" as never)
        .select("id, test_id, created_at, status, visit_id").eq("patient_id", pid!).order("created_at", { ascending: false });
      if (error) throw error; return (data as unknown as LabOrderRow[]) ?? [];
    },
  });
  const labOrderIds = (labOrders.data ?? []).map((o) => o.id);
  const labResults = useQuery({
    queryKey: ["my-lab-results", labOrderIds.join(",")], enabled: labOrderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_results" as never).select("*").in("order_id", labOrderIds as never);
      if (error) throw error; return (data as unknown as LabResultRow[]) ?? [];
    },
  });
  const labValues = useQuery({
    queryKey: ["my-lab-values", labOrderIds.join(",")], enabled: labOrderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("lab_result_values" as never).select("*").in("order_id", labOrderIds as never);
      if (error) throw error; return (data as unknown as LabValueRow[]) ?? [];
    },
  });
  const labTestIds = Array.from(new Set((labOrders.data ?? []).map((o) => o.test_id)));
  const labTests = useQuery({
    queryKey: ["my-lab-tests", labTestIds.join(",")], enabled: labTestIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("lab_tests_catalog" as never).select("id, name, code").in("id", labTestIds as never);
      return (data as unknown as LabTestRow[]) ?? [];
    },
  });
  const testName = (id: string) => labTests.data?.find((t) => t.id === id)?.name ?? "Test";

  // Sick-off notes
  const sickoffs = useQuery({
    queryKey: ["my-sickoffs", pid], enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase.from("sick_off_notes" as never)
        .select("*").eq("patient_id", pid!).order("created_at", { ascending: false });
      if (error) throw error; return (data as unknown as SickRow[]) ?? [];
    },
  });

  // Imaging studies & reports
  const imaging = useQuery({
    queryKey: ["my-imaging", pid], enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase.from("imaging_orders" as never)
        .select("id, modality, status, findings, report, image_path, created_at, visit_id")
        .eq("patient_id", pid!).order("created_at", { ascending: false });
      if (error) throw error; return (data as unknown as ImagingRow[]) ?? [];
    },
  });
  const [viewImg, setViewImg] = useState<{ row: ImagingRow; url: string | null } | null>(null);
  async function openImaging(row: ImagingRow) {
    let url: string | null = null;
    if (row.image_path) {
      const { data } = await supabase.storage.from("imaging-files").createSignedUrl(row.image_path, 600);
      url = data?.signedUrl ?? null;
    }
    setViewImg({ row, url });
  }
  async function downloadImagingPdf(row: ImagingRow) {
    let dataUrl: string | null = null;
    if (row.image_path) {
      const { data } = await supabase.storage.from("imaging-files").download(row.image_path);
      if (data) {
        dataUrl = await new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result as string);
          fr.readAsDataURL(data);
        });
      }
    }
    await exportImagingReportPDF({
      order_id: row.id, modality: row.modality, ordered_at: row.created_at,
      findings: row.findings, report: row.report,
      patient_name: patient.data!.full_name, mrn: patient.data!.medical_record_number,
      image_data_url: dataUrl,
    });
  }

  // Lab-result in-app viewer
  const [viewLab, setViewLab] = useState<null | {
    order: LabOrderRow;
    summary: LabResultRow | undefined;
    params: LabValueRow[];
  }>(null);



  const [bookOpen, setBookOpen] = useState(false);
  const [bookForm, setBookForm] = useState({ doctor_id: "", scheduled_at: "", reason: "" });
  const book = useMutation({
    mutationFn: async () => {
      if (!pid || !bookForm.scheduled_at) throw new Error("Time required");
      const { error } = await supabase.from("appointments" as never).insert({
        patient_id: pid,
        doctor_id: bookForm.doctor_id || null,
        scheduled_at: new Date(bookForm.scheduled_at).toISOString(),
        reason: bookForm.reason || null,
        created_by: user!.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setBookOpen(false); setBookForm({ doctor_id: "", scheduled_at: "", reason: "" });
      qc.invalidateQueries({ queryKey: ["my-appts"] });
      toast.success("Appointment requested");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments" as never).update({ status: "cancelled" } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-appts"] }); toast.success("Cancelled"); },
  });

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
        <p className="mt-2 text-sm text-muted-foreground">Ask reception to register you as a patient.</p>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">My health</h1>
        <p className="text-sm text-muted-foreground">{patient.data.full_name}</p>
      </div>

      <Tabs defaultValue="timeline">
        <TabsList>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="appointments">Appointments</TabsTrigger>
          <TabsTrigger value="lab">Lab results</TabsTrigger>
          <TabsTrigger value="imaging">Imaging</TabsTrigger>
          <TabsTrigger value="sickoff">Sick-off</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4 space-y-6">
          <div className="flex justify-end gap-1">
            {(Object.keys(RANGES_DAYS) as Array<keyof typeof RANGES_DAYS>).map((r) => (
              <Button key={r} size="sm" variant={range === r ? "default" : "outline"} onClick={() => setRange(r)}>{r}</Button>
            ))}
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
        </TabsContent>

        <TabsContent value="appointments" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-medium"><CalendarClock className="h-4 w-4 text-primary" /> My appointments</h2>
            <Dialog open={bookOpen} onOpenChange={setBookOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> Book appointment</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Request an appointment</DialogTitle></DialogHeader>
                <div className="space-y-2">
                  <div>
                    <Label>Preferred doctor (optional)</Label>
                    <Select value={bookForm.doctor_id} onValueChange={(v) => setBookForm({ ...bookForm, doctor_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Any available" /></SelectTrigger>
                      <SelectContent>{doctors.data?.map((d) => <SelectItem key={d.id} value={d.id}>{d.full_name ?? "Doctor"}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Date & time</Label><Input type="datetime-local" value={bookForm.scheduled_at} onChange={(e) => setBookForm({ ...bookForm, scheduled_at: e.target.value })} /></div>
                  <div><Label>Reason</Label><Textarea rows={2} value={bookForm.reason} onChange={(e) => setBookForm({ ...bookForm, reason: e.target.value })} /></div>
                </div>
                <DialogFooter><Button onClick={() => book.mutate()} disabled={book.isPending}>Request</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-lg border bg-card divide-y">
            {(appts.data ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">No appointments yet.</div>}
            {appts.data?.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <div className="font-medium">{new Date(a.scheduled_at).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{a.reason ?? "—"}{a.department ? ` · ${a.department}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${a.status === "checked_in" ? "bg-blue-500/10 text-blue-700" : a.status === "cancelled" ? "bg-rose-500/10 text-rose-700" : "bg-muted text-muted-foreground"}`}>{a.status}</span>
                  {a.status === "booked" && <Button size="sm" variant="ghost" onClick={() => cancel.mutate(a.id)}>Cancel</Button>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="lab" className="mt-4 space-y-3">
          <h2 className="flex items-center gap-2 font-medium"><FlaskConical className="h-4 w-4 text-primary" /> My lab results</h2>
          {(labOrders.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No lab orders yet.</p>}
          {labOrders.data?.map((o) => {
            const summary = labResults.data?.find((r) => r.order_id === o.id);
            const params = (labValues.data ?? []).filter((v) => v.order_id === o.id);
            const downloadable = !!summary || params.length > 0;
            function downloadPdf() {
              const rows = params.length
                ? params.map((p) => ({
                    parameter_name: p.parameter_name,
                    value_text: p.value_text,
                    units: p.units,
                    reference_range: p.reference_range,
                    abnormal_flag: p.abnormal_flag,
                  }))
                : [{
                    parameter_name: testName(o.test_id),
                    value_text: summary?.result_value ?? null,
                    units: summary?.units ?? null,
                    reference_range: summary?.reference_range ?? null,
                    abnormal_flag: summary?.abnormal_flag ?? null,
                  }];
              exportLabReportPDF({
                test_name: testName(o.test_id),
                order_id: o.id,
                ordered_at: o.created_at,
                performed_at: summary?.performed_at ?? null,
                patient_name: patient.data!.full_name,
                mrn: patient.data!.medical_record_number,
                parameters: rows,
                comments: summary?.comments ?? null,
              });
            }
            return (
              <div key={o.id} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b p-3 text-sm">
                  <div>
                    <div className="font-medium">{testName(o.test_id)}</div>
                    <div className="text-xs text-muted-foreground">Ordered {new Date(o.created_at).toLocaleString()} · Status: {o.status}</div>
                  </div>
                  <div className="flex gap-2">
                    {downloadable && (
                      <Button size="sm" variant="outline" onClick={() => setViewLab({ order: o, summary, params })}>
                        <FileText className="h-4 w-4" /> View
                      </Button>
                    )}
                    {downloadable && (
                      <Button size="sm" variant="outline" onClick={downloadPdf}><Download className="h-4 w-4" /> Download PDF</Button>
                    )}
                  </div>
                </div>
                {params.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30"><tr><th className="p-2 text-left">Parameter</th><th className="p-2 text-left">Result</th><th className="p-2 text-left">Units</th><th className="p-2 text-left">Reference</th><th className="p-2 text-left">Flag</th></tr></thead>
                    <tbody>
                      {params.map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="p-2 font-medium">{p.parameter_name}</td>
                          <td className="p-2">{p.value_text ?? "—"}</td>
                          <td className="p-2">{p.units ?? "—"}</td>
                          <td className="p-2 text-muted-foreground">{p.reference_range ?? "—"}</td>
                          <td className="p-2">{p.abnormal_flag && <span className={p.abnormal_flag === "normal" ? "text-emerald-600" : "text-destructive"}>{p.abnormal_flag}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : summary ? (
                  <div className="p-3 text-sm">
                    <div>{summary.result_value} {summary.units} {summary.abnormal_flag && <span className="ml-1 text-destructive">{summary.abnormal_flag}</span>}</div>
                    {summary.comments && <div className="text-xs text-muted-foreground">{summary.comments}</div>}
                  </div>
                ) : (
                  <div className="p-3 text-xs text-muted-foreground">Results pending.</div>
                )}
              </div>
            );
          })}

          <Dialog open={!!viewLab} onOpenChange={(o) => !o && setViewLab(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{viewLab && testName(viewLab.order.test_id)} — lab report</DialogTitle>
              </DialogHeader>
              {viewLab && (
                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/30 p-3 text-xs">
                    <div><span className="text-muted-foreground">Patient:</span> <span className="font-medium">{patient.data?.full_name}</span></div>
                    <div><span className="text-muted-foreground">MRN:</span> {patient.data?.medical_record_number ?? "—"}</div>
                    <div><span className="text-muted-foreground">Ordered:</span> {new Date(viewLab.order.created_at).toLocaleString()}</div>
                    <div><span className="text-muted-foreground">Reported:</span> {viewLab.summary?.performed_at ? new Date(viewLab.summary.performed_at).toLocaleString() : "—"}</div>
                    <div><span className="text-muted-foreground">Ref:</span> {viewLab.order.id.slice(0, 8).toUpperCase()}</div>
                  </div>
                  <div className="max-h-[55vh] overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/50 text-xs">
                        <tr>
                          <th className="p-2 text-left">Parameter</th>
                          <th className="p-2 text-left">Result</th>
                          <th className="p-2 text-left">Units</th>
                          <th className="p-2 text-left">Reference</th>
                          <th className="p-2 text-left">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewLab.params.length > 0 ? viewLab.params.map((p) => (
                          <tr key={p.id} className="border-t">
                            <td className="p-2 font-medium">{p.parameter_name}</td>
                            <td className="p-2">{p.value_text ?? "—"}</td>
                            <td className="p-2">{p.units ?? "—"}</td>
                            <td className="p-2 text-muted-foreground">{p.reference_range ?? "—"}</td>
                            <td className="p-2">{p.abnormal_flag && <span className={p.abnormal_flag === "normal" ? "text-emerald-600" : "text-destructive"}>{p.abnormal_flag}</span>}</td>
                          </tr>
                        )) : viewLab.summary ? (
                          <tr className="border-t">
                            <td className="p-2 font-medium">{testName(viewLab.order.test_id)}</td>
                            <td className="p-2">{viewLab.summary.result_value ?? "—"}</td>
                            <td className="p-2">{viewLab.summary.units ?? "—"}</td>
                            <td className="p-2 text-muted-foreground">{viewLab.summary.reference_range ?? "—"}</td>
                            <td className="p-2">{viewLab.summary.abnormal_flag && <span className="text-destructive">{viewLab.summary.abnormal_flag}</span>}</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  {viewLab.summary?.comments && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">Interpretation</div>
                      <div className="whitespace-pre-wrap">{viewLab.summary.comments}</div>
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                {viewLab && (
                  <Button variant="outline" onClick={() => {
                    const rows = viewLab.params.length
                      ? viewLab.params.map((p) => ({
                          parameter_name: p.parameter_name, value_text: p.value_text,
                          units: p.units, reference_range: p.reference_range, abnormal_flag: p.abnormal_flag,
                        }))
                      : [{
                          parameter_name: testName(viewLab.order.test_id),
                          value_text: viewLab.summary?.result_value ?? null,
                          units: viewLab.summary?.units ?? null,
                          reference_range: viewLab.summary?.reference_range ?? null,
                          abnormal_flag: viewLab.summary?.abnormal_flag ?? null,
                        }];
                    void exportLabReportPDF({
                      test_name: testName(viewLab.order.test_id),
                      order_id: viewLab.order.id,
                      ordered_at: viewLab.order.created_at,
                      performed_at: viewLab.summary?.performed_at ?? null,
                      patient_name: patient.data!.full_name,
                      mrn: patient.data!.medical_record_number,
                      parameters: rows,
                      comments: viewLab.summary?.comments ?? null,
                    });
                  }}>
                    <Download className="h-4 w-4" /> Download PDF
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>


        <TabsContent value="imaging" className="mt-4 space-y-3">
          <h2 className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-primary" /> Imaging studies</h2>
          {(imaging.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No imaging studies yet.</p>}
          {imaging.data?.map((r) => {
            const reported = !!(r.report || r.findings);
            return (
              <div key={r.id} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b p-3 text-sm">
                  <div>
                    <div className="font-medium">{r.modality}</div>
                    <div className="text-xs text-muted-foreground">Ordered {new Date(r.created_at).toLocaleString()} · Status: {r.status}</div>
                  </div>
                  <div className="flex gap-2">
                    {reported && <Button size="sm" variant="outline" onClick={() => openImaging(r)}>View</Button>}
                    {reported && <Button size="sm" variant="outline" onClick={() => downloadImagingPdf(r)}><Download className="h-4 w-4" /> PDF</Button>}
                  </div>
                </div>
                {reported ? (
                  <div className="p-3 text-sm whitespace-pre-wrap">{r.report ?? r.findings}</div>
                ) : (
                  <div className="p-3 text-xs text-muted-foreground">Report pending.</div>
                )}
              </div>
            );
          })}
          <Dialog open={!!viewImg} onOpenChange={(o) => !o && setViewImg(null)}>
            <DialogContent className="max-w-3xl">
              <DialogHeader><DialogTitle>{viewImg?.row.modality} report</DialogTitle></DialogHeader>
              <div className="space-y-3">
                {viewImg?.url && (viewImg.row.image_path?.toLowerCase().endsWith(".pdf") ? (
                  <iframe src={viewImg.url} title="study" className="h-[70vh] w-full rounded border" />
                ) : (
                  <img src={viewImg.url} alt="study" className="max-h-[60vh] w-full rounded border object-contain" />
                ))}
                <div className="whitespace-pre-wrap rounded border bg-muted/30 p-3 text-sm">{viewImg?.row.report ?? viewImg?.row.findings ?? "—"}</div>
              </div>
              <DialogFooter>
                {viewImg && <Button variant="outline" onClick={() => downloadImagingPdf(viewImg.row)}><Download className="h-4 w-4" /> Download PDF</Button>}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="sickoff" className="mt-4 space-y-3">
          <h2 className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-primary" /> Sick-off certificates</h2>
          {(sickoffs.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No sick-off certificates yet.</p>}
          {sickoffs.data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
              <div>
                <div className="font-medium">{s.days} day(s) — {s.start_date} to {s.end_date}</div>
                <div className="text-xs text-muted-foreground">Issued {new Date(s.created_at).toLocaleDateString()}{s.diagnosis ? ` · ${s.diagnosis}` : ""}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => exportSickOffPDF({
                id: s.id, patient_name: patient.data!.full_name, mrn: patient.data!.medical_record_number,
                diagnosis: s.diagnosis, recommendation: s.recommendation, days: s.days,
                start_date: s.start_date, end_date: s.end_date, created_at: s.created_at,
              })}><Download className="h-4 w-4" /> Download PDF</Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="bills" className="mt-4 space-y-3">
          <h2 className="flex items-center gap-2 font-medium"><Receipt className="h-4 w-4 text-primary" /> My bills</h2>
          {(invoices.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No bills yet.</p>}
          {invoices.data?.map((inv) => {
            const items = (invoiceItems.data ?? []).filter((it) => it.invoice_id === inv.id);
            const due = inv.total_cents - inv.paid_cents;
            return (
              <div key={inv.id} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b p-3 text-sm">
                  <div>
                    <div className="font-medium">Invoice {inv.id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{new Date(inv.created_at).toLocaleDateString()}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{money(inv.total_cents)}</div>
                    <span className={`rounded px-2 py-0.5 text-xs ${inv.status === "paid" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"}`}>{inv.status}</span>
                    {due > 0 && <div className="mt-0.5 text-xs text-destructive">Due {money(due)}</div>}
                  </div>
                </div>
                <ul className="divide-y text-xs">
                  {items.map((it) => (
                    <li key={it.id} className="flex justify-between p-2">
                      <span>{it.description} <span className="text-muted-foreground">× {it.qty}</span></span>
                      <span className="font-mono">{money(it.amount_cents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
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

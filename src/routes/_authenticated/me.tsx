import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarClock, CreditCard, FileText, FlaskConical, HeartPulse, Receipt, Plus, Download, Pill, ScanLine, ChevronRight } from "lucide-react";
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


const money = (cents: number) => `KES ${(cents / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Patient { id: string; full_name: string; medical_record_number: string | null; date_of_birth?: string | null; gender?: string | null }
interface Visit { id: string; opened_at: string; closed_at: string | null; status: string; reason: string | null; notes: string | null; triage_level: string | null }
interface Vital { id: string; visit_id: string; captured_at: string; systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null }
interface Rx { id: string; visit_id: string; medication: string; dose: string | null; frequency: string | null; duration: string | null }
interface Discharge { visit_id: string; summary: string; treatment_plan: string | null; follow_up: string | null; finalized: boolean }
interface Appointment { id: string; scheduled_at: string; status: string; reason: string | null; doctor_id: string | null; department: string | null }
interface Invoice { id: string; visit_id: string | null; total_cents: number; paid_cents: number; status: string; created_at: string }
interface InvoiceItem { id: string; invoice_id: string; description: string; qty: number; unit_price_cents: number; amount_cents: number; kind: string }
interface Payment { id: string; invoice_id: string; amount_cents: number; method: string; reference: string | null; received_at: string }

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
      const { data, error } = await supabase.from("patients" as never).select("id, full_name, medical_record_number, date_of_birth, gender").eq("user_id", user!.id).maybeSingle();
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
  const payments = useQuery({
    queryKey: ["my-payments", (invoices.data ?? []).map((i) => i.id).join(",")],
    enabled: (invoices.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (invoices.data ?? []).map((i) => i.id);
      const { data, error } = await supabase
        .from("payments" as never)
        .select("id, invoice_id, amount_cents, method, reference, received_at")
        .in("invoice_id", ids as never)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Payment[]) ?? [];
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

  // Sick-off notes
  const sickoffs = useQuery({
    queryKey: ["my-sickoffs", pid], enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase.from("sick_off_notes" as never)
        .select("*").eq("patient_id", pid!).order("created_at", { ascending: false });
      if (error) throw error; return (data as unknown as SickRow[]) ?? [];
    },
  });

  const patientAge = useMemo(() => {
    const dob = patient.data?.date_of_birth;
    if (!dob) return null;
    const y = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 86400000));
    return `${y}y`;
  }, [patient.data?.date_of_birth]);

  async function downloadRxPdf(r: Rx) {
    if (!patient.data) return;
    await exportPrescriptionPDF({
      rx_id: r.id, created_at: new Date().toISOString(),
      patient_name: patient.data.full_name, mrn: patient.data.medical_record_number,
      age: patientAge, gender: patient.data.gender ?? null,
      items: [{ medication: r.medication, dose: r.dose, frequency: r.frequency, duration: r.duration, instructions: null }],
    });
  }





  const [openInvoice, setOpenInvoice] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "mpesa", reference: "" });
  const pay = useMutation({
    mutationFn: async () => {
      if (!payFor) throw new Error("No invoice selected");
      const cents = Math.round(Number(payForm.amount) * 100);
      if (!cents || cents <= 0) throw new Error("Enter a valid amount");
      const { error } = await supabase.rpc("patient_pay_invoice" as never, {
        _invoice: payFor.id,
        _amount_cents: cents,
        _method: payForm.method,
        _reference: payForm.reference || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setPayFor(null); setPayForm({ amount: "", method: "mpesa", reference: "" });
      qc.invalidateQueries({ queryKey: ["my-invoices"] });
      qc.invalidateQueries({ queryKey: ["my-payments"] });
      toast.success("Payment recorded");

    },
    onError: (e: Error) => toast.error(e.message),
  });
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
    label: new Date(v.captured_at).toLocaleDateString("en-GB"),
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
          <TabsTrigger value="prescriptions">Prescriptions</TabsTrigger>
          <TabsTrigger value="sickoff">Sick-off</TabsTrigger>

          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="payments">Payment history</TabsTrigger>

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
                      <div className="text-xs text-muted-foreground">{new Date(v.opened_at).toLocaleString("en-GB")}</div>
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
                  <div className="font-medium">{new Date(a.scheduled_at).toLocaleString("en-GB")}</div>
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

        <TabsContent value="lab" className="mt-4">
          <h2 className="mb-3 flex items-center gap-2 font-medium"><FlaskConical className="h-4 w-4 text-primary" /> My lab results</h2>
          <LabResultsViewer
            patientId={patient.data.id}
            patientName={patient.data.full_name}
            mrn={patient.data.medical_record_number}
            age={patientAge}
            gender={patient.data.gender ?? null}
          />
        </TabsContent>

        <TabsContent value="imaging" className="mt-4">
          <h2 className="mb-3 flex items-center gap-2 font-medium"><ScanLine className="h-4 w-4 text-primary" /> Imaging studies</h2>
          <ImagingViewer
            patientId={patient.data.id}
            patientName={patient.data.full_name}
            mrn={patient.data.medical_record_number}
          />
        </TabsContent>

        <TabsContent value="prescriptions" className="mt-4 space-y-3">
          <h2 className="flex items-center gap-2 font-medium"><Pill className="h-4 w-4 text-primary" /> My prescriptions</h2>
          {(rx.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No prescriptions issued yet.</p>}
          {rx.data?.map((r) => (
            <div key={r.id} className="flex items-start justify-between rounded-lg border bg-card p-3 text-sm">
              <div>
                <div className="font-medium">{r.medication}</div>
                <div className="text-xs text-muted-foreground">
                  {[r.dose, r.frequency, r.duration].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => downloadRxPdf(r)}>
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </div>
          ))}
        </TabsContent>


        <TabsContent value="sickoff" className="mt-4 space-y-3">
          <h2 className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-primary" /> Sick-off certificates</h2>
          {(sickoffs.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No sick-off certificates yet.</p>}
          {sickoffs.data?.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm">
              <div>
                <div className="font-medium">{s.days} day(s) — {s.start_date} to {s.end_date}</div>
                <div className="text-xs text-muted-foreground">Issued {new Date(s.created_at).toLocaleDateString("en-GB")}{s.diagnosis ? ` · ${s.diagnosis}` : ""}</div>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-medium"><Receipt className="h-4 w-4 text-primary" /> My bills</h2>
            <div className="text-sm">
              Outstanding balance:{" "}
              <span className="font-semibold">
                {money((invoices.data ?? []).reduce((s, i) => s + Math.max(0, i.total_cents - i.paid_cents), 0))}
              </span>
            </div>
          </div>
          {(invoices.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No bills yet.</p>}
          {invoices.data?.map((inv) => {
            const items = (invoiceItems.data ?? []).filter((it) => it.invoice_id === inv.id);
            const due = inv.total_cents - inv.paid_cents;
            const open = openInvoice === inv.id;
            return (
              <div key={inv.id} className="rounded-lg border bg-card">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenInvoice(open ? null : inv.id)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                    <div>
                      <div className="font-medium">Invoice {inv.id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(inv.created_at).toLocaleDateString("en-GB")} · {items.length} item{items.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{money(inv.total_cents)}</div>
                    <span className={`rounded px-2 py-0.5 text-xs ${inv.status === "paid" ? "bg-green-500/10 text-green-700" : "bg-amber-500/10 text-amber-700"}`}>{inv.status}</span>
                    {due > 0 && <div className="mt-0.5 text-xs text-destructive">Due {money(due)}</div>}
                  </div>
                </button>
                {open && (
                  <ul className="divide-y border-t text-xs">
                    {items.length === 0 && <li className="p-2 text-muted-foreground">No billed items on this invoice.</li>}
                    {items.map((it) => (
                      <li key={it.id} className="flex justify-between p-2">
                        <span>{it.description} <span className="text-muted-foreground">× {it.qty}</span></span>
                        <span className="font-mono">{money(it.amount_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {due > 0 && (
                  <div className="flex items-center justify-between gap-2 border-t p-2 text-xs">
                    <span className="text-muted-foreground">Paid {money(inv.paid_cents)} of {money(inv.total_cents)}</span>
                    <Button size="sm" onClick={() => { setPayFor(inv); setPayForm({ amount: (due / 100).toFixed(2), method: "mpesa", reference: "" }); }}>
                      <CreditCard className="h-4 w-4" /> Pay {money(due)}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          <Dialog open={!!payFor} onOpenChange={(v) => { if (!v) setPayFor(null); }}>
            <DialogContent>
              <DialogHeader><DialogTitle>Pay invoice {payFor?.id.slice(0, 8)}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Amount (KES)</Label>
                  <Input inputMode="decimal" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
                  {payFor && <p className="mt-1 text-xs text-muted-foreground">Balance due {money(payFor.total_cents - payFor.paid_cents)}</p>}
                </div>
                <div>
                  <Label>Payment method</Label>
                  <Select value={payForm.method} onValueChange={(v) => setPayForm({ ...payForm, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mpesa">M-Pesa</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reference (transaction code)</Label>
                  <Input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} placeholder="e.g. SFE4XY12Z" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => pay.mutate()} disabled={pay.isPending}>{pay.isPending ? "Submitting…" : "Submit payment"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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

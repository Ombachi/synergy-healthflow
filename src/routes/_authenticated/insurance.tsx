import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Plus, Download, FileDown, Send, Upload, FileJson, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { exportClaimPDF, exportClaimsBatchCSV } from "@/lib/claim-pdf";
import { toFhirClaim, downloadFhir } from "@/lib/fhir";

export const Route = createFileRoute("/_authenticated/insurance")({ component: InsurancePage });

interface Payer { id: string; code: string; name: string; category: string | null; active: boolean; claims_portal_url?: string | null }
interface Policy { id: string; patient_id: string; insurer: string; member_number: string; scheme: string | null; payer_id: string | null; valid_from: string | null; valid_to: string | null; active: boolean }
interface Claim { id: string; invoice_id: string; policy_id: string | null; preauth_code: string | null; status: string; approved_amount_cents: number | null; notes: string | null; created_at: string }
interface Invoice { id: string; patient_id: string; total_cents: number; status: string }
interface InvoiceItem { id: string; invoice_id: string; description: string; amount_cents: number }
interface Patient { id: string; full_name: string; medical_record_number: string | null }
interface Submission { id: string; claim_id: string; payer_code: string | null; external_ref: string | null; status: string; submitted_at: string; last_event_at: string }
interface Batch { id: string; payer_code: string | null; filename: string | null; rows_total: number; rows_matched: number; rows_unmatched: number; total_paid_cents: number; created_at: string }

const money = (c: number | null) => c == null ? "—" : `KES ${(c / 100).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

function parseRemittanceCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((ln) => {
    const cells = ln.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    return row;
  });
}

function InsurancePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [polOpen, setPolOpen] = useState(false);
  const [polForm, setPolForm] = useState({ patient_id: "", payer_id: "", member_number: "", scheme: "", valid_from: "", valid_to: "" });
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimForm, setClaimForm] = useState({ invoice_id: "", policy_id: "", preauth_code: "", notes: "" });
  const [remitOpen, setRemitOpen] = useState(false);
  const [remitFile, setRemitFile] = useState<File | null>(null);
  const [remitPayer, setRemitPayer] = useState("");

  // Real-time updates from payer status changes
  useEffect(() => {
    const ch = supabase
      .channel("insurance-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "insurance_claims" }, () => {
        qc.invalidateQueries({ queryKey: ["claims"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "claim_submissions" }, () => {
        qc.invalidateQueries({ queryKey: ["claim-submissions"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const payers = useQuery({
    queryKey: ["payers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_payers" as never).select("*").eq("active", true).order("name");
      if (error) throw error;
      return (data as unknown as Payer[]) ?? [];
    },
  });
  const policies = useQuery({
    queryKey: ["policies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_policies" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Policy[]) ?? [];
    },
  });
  const claims = useQuery({
    queryKey: ["claims"],
    queryFn: async () => {
      const { data, error } = await supabase.from("insurance_claims" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Claim[]) ?? [];
    },
  });
  const invoices = useQuery({
    queryKey: ["ins-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices" as never).select("id, patient_id, total_cents, status")
        .neq("status", "paid").neq("status", "void");
      if (error) throw error;
      return (data as unknown as Invoice[]) ?? [];
    },
  });
  const allInvoices = useQuery({
    queryKey: ["ins-all-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoices" as never).select("id, patient_id, total_cents, status");
      if (error) throw error;
      return (data as unknown as Invoice[]) ?? [];
    },
  });
  const items = useQuery({
    queryKey: ["ins-items"],
    queryFn: async () => {
      const { data, error } = await supabase.from("invoice_items" as never).select("id, invoice_id, description, amount_cents");
      if (error) throw error;
      return (data as unknown as InvoiceItem[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["ins-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name, medical_record_number").order("full_name");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });
  const submissions = useQuery({
    queryKey: ["claim-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("claim_submissions" as never)
        .select("id, claim_id, payer_code, external_ref, status, submitted_at, last_event_at")
        .order("last_event_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Submission[]) ?? [];
    },
  });
  const batches = useQuery({
    queryKey: ["remit-batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("remittance_batches" as never)
        .select("id, payer_code, filename, rows_total, rows_matched, rows_unmatched, total_paid_cents, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Batch[]) ?? [];
    },
  });

  const createPolicy = useMutation({
    mutationFn: async () => {
      if (!polForm.patient_id || !polForm.payer_id || !polForm.member_number) throw new Error("Patient, insurer and member # required");
      const payer = payers.data?.find((p) => p.id === polForm.payer_id);
      const { error } = await supabase.from("insurance_policies" as never).insert({
        patient_id: polForm.patient_id,
        payer_id: polForm.payer_id,
        insurer: payer?.name ?? "Unknown",
        member_number: polForm.member_number,
        scheme: polForm.scheme || null,
        valid_from: polForm.valid_from || null,
        valid_to: polForm.valid_to || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setPolOpen(false); setPolForm({ patient_id: "", payer_id: "", member_number: "", scheme: "", valid_from: "", valid_to: "" });
      qc.invalidateQueries({ queryKey: ["policies"] });
      toast.success("Policy added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createClaim = useMutation({
    mutationFn: async () => {
      if (!claimForm.invoice_id) throw new Error("Pick an invoice");
      const { data: claim, error } = await supabase.from("insurance_claims" as never).insert({
        invoice_id: claimForm.invoice_id,
        policy_id: claimForm.policy_id || null,
        preauth_code: claimForm.preauth_code || null,
        notes: claimForm.notes || null,
        processed_by: user!.id,
        status: "submitted",
      } as never).select("id").single();
      if (error) throw error;
      // Auto-create claim lines from invoice items
      const invItems = (items.data ?? []).filter((it) => it.invoice_id === claimForm.invoice_id);
      if (invItems.length > 0 && claim) {
        await supabase.from("claim_lines" as never).insert(
          invItems.map((it) => ({
            claim_id: (claim as { id: string }).id,
            invoice_item_id: it.id,
            description: it.description,
            billed_cents: it.amount_cents,
          })) as never
        );
      }
    },
    onSuccess: () => {
      setClaimOpen(false); setClaimForm({ invoice_id: "", policy_id: "", preauth_code: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["claims"] });
      toast.success("Claim submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateClaim = useMutation({
    mutationFn: async ({ id, status, amount, note }: { id: string; status: string; amount?: number; note?: string }) => {
      const patch: Record<string, unknown> = { status, processed_by: user!.id };
      if (amount != null) patch.approved_amount_cents = amount;
      if (note) patch.notes = note;
      const { error } = await supabase.from("insurance_claims" as never).update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["claims"] }); toast.success("Claim updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Automated submission to selected Kenyan payer ----
  const submitToPayer = useMutation({
    mutationFn: async (c: Claim) => {
      const pol = c.policy_id ? policies.data?.find((p) => p.id === c.policy_id) : undefined;
      const payer = pol?.payer_id ? payers.data?.find((p) => p.id === pol.payer_id) : undefined;
      const payerCode = payer?.code ?? "UNKNOWN";
      const externalRef = `${payerCode}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      // Simulated payer gateway call (replace with real EDI/REST per payer)
      const { error: subErr } = await supabase.from("claim_submissions" as never).insert({
        claim_id: c.id,
        payer_code: payerCode,
        external_ref: externalRef,
        status: "submitted",
        submitted_by: user!.id,
        raw: { simulated: true, channel: payer?.claims_portal_url ?? "manual" },
      } as never);
      if (subErr) throw subErr;
      const { error: updErr } = await supabase.from("insurance_claims" as never)
        .update({ status: "submitted", processed_by: user!.id, notes: `${c.notes ?? ""}\n[Submitted ${externalRef}]`.trim() } as never)
        .eq("id", c.id);
      if (updErr) throw updErr;
      // Simulate payer acknowledgement and async processing events
      setTimeout(async () => {
        await supabase.from("claim_submissions" as never).insert({
          claim_id: c.id, payer_code: payerCode, external_ref: externalRef,
          status: "acknowledged", submitted_by: user!.id, raw: { ack: true },
        } as never);
      }, 1500);
      return externalRef;
    },
    onSuccess: (ref) => {
      qc.invalidateQueries({ queryKey: ["claims"] });
      qc.invalidateQueries({ queryKey: ["claim-submissions"] });
      toast.success(`Sent to payer — ref ${ref}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ---- Remittance import + reconciliation ----
  const importRemittance = useMutation({
    mutationFn: async () => {
      if (!remitFile) throw new Error("Choose a CSV file");
      if (!remitPayer) throw new Error("Pick the payer");
      const text = await remitFile.text();
      const rows = parseRemittanceCsv(text);
      if (rows.length === 0) throw new Error("Empty CSV");
      const payer = payers.data?.find((p) => p.id === remitPayer);
      const { data: batch, error: bErr } = await supabase.from("remittance_batches" as never).insert({
        payer_id: remitPayer, payer_code: payer?.code ?? null, filename: remitFile.name,
        rows_total: rows.length, imported_by: user!.id,
      } as never).select("id").single();
      if (bErr) throw bErr;
      const batchId = (batch as { id: string }).id;

      // Pre-fetch submissions for this payer to match external refs
      const subsForPayer = (submissions.data ?? []).filter((s) => !payer?.code || s.payer_code === payer.code);
      const claimsById = new Map((claims.data ?? []).map((c) => [c.id, c]));

      let matched = 0, totalPaid = 0;
      const linePayloads: Array<Record<string, unknown>> = [];
      const claimUpdates: Array<{ id: string; paid: number; approved: number; status: string }> = [];

      for (const r of rows) {
        const ref = r.claim_ref ?? r.external_ref ?? r.reference ?? "";
        const paid = Math.round(parseFloat(r.paid_amount ?? r.amount_paid ?? r.paid ?? "0") * 100) || 0;
        const approved = Math.round(parseFloat(r.approved_amount ?? r.approved ?? r.paid_amount ?? "0") * 100) || paid;
        const status = (r.status ?? (paid > 0 ? "paid" : "rejected")).toLowerCase();
        const sub = subsForPayer.find((s) => s.external_ref === ref);
        const claimId = sub?.claim_id ?? null;
        const matchedRow = !!claimId && claimsById.has(claimId);
        if (matchedRow) { matched++; totalPaid += paid; }
        linePayloads.push({
          batch_id: batchId, claim_id: claimId, external_claim_ref: ref,
          invoice_no: r.invoice_no ?? null, member_number: r.member_number ?? null,
          paid_cents: paid, approved_cents: approved, status, paid_at: r.paid_date || null,
          reason: r.reason ?? null, matched: matchedRow,
        });
        if (matchedRow && claimId) {
          claimUpdates.push({ id: claimId, paid, approved, status: status === "rejected" ? "rejected" : "paid" });
        }
      }

      if (linePayloads.length) await supabase.from("remittance_lines" as never).insert(linePayloads as never);
      await supabase.from("remittance_batches" as never).update({
        rows_matched: matched, rows_unmatched: rows.length - matched, total_paid_cents: totalPaid,
      } as never).eq("id", batchId);

      // Apply matched payments to claims + invoices
      for (const u of claimUpdates) {
        await supabase.from("insurance_claims" as never).update({
          status: u.status, approved_amount_cents: u.approved, processed_by: user!.id,
        } as never).eq("id", u.id);
        const c = claimsById.get(u.id);
        if (c?.invoice_id && u.status === "paid") {
          const inv = invoiceById(c.invoice_id);
          if (inv) {
            const newPaid = Math.min(inv.total_cents, u.paid);
            await supabase.from("invoices" as never).update({
              paid_cents: newPaid,
              status: newPaid >= inv.total_cents ? "paid" : "partial",
            } as never).eq("id", c.invoice_id);
            await supabase.from("payments" as never).insert({
              invoice_id: c.invoice_id, amount_cents: u.paid, method: "insurance",
              reference: `REMIT-${batchId.slice(0, 8)}`,
            } as never);
          }
        }
        await supabase.from("claim_submissions" as never).insert({
          claim_id: u.id, payer_code: payer?.code ?? null, external_ref: null,
          status: u.status, submitted_by: user!.id, raw: { source: "remittance", batch_id: batchId },
        } as never);
      }
      return { total: rows.length, matched };
    },
    onSuccess: (r) => {
      setRemitOpen(false); setRemitFile(null); setRemitPayer("");
      qc.invalidateQueries({ queryKey: ["remit-batches"] });
      qc.invalidateQueries({ queryKey: ["claims"] });
      qc.invalidateQueries({ queryKey: ["ins-all-invoices"] });
      toast.success(`Imported ${r.total} rows · matched ${r.matched}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const patientById = (id: string) => patients.data?.find((p) => p.id === id);
  const policyById = (id: string | null) => id ? policies.data?.find((p) => p.id === id) : undefined;
  const invoiceById = (id: string) => allInvoices.data?.find((i) => i.id === id);

  async function downloadClaim(c: Claim) {
    const inv = invoiceById(c.invoice_id);
    const pat = inv ? patientById(inv.patient_id) : undefined;
    const pol = policyById(c.policy_id);
    // Fetch lines
    const { data: lns } = await supabase.from("claim_lines" as never).select("*").eq("claim_id", c.id);
    const lines = ((lns as unknown as Array<{ description: string; billed_cents: number; approved_cents: number | null }>) ?? []);
    exportClaimPDF({
      claim_id: c.id,
      created_at: c.created_at,
      patient_name: pat?.full_name ?? "—",
      mrn: pat?.medical_record_number ?? null,
      insurer: pol?.insurer ?? "—",
      member_number: pol?.member_number ?? null,
      scheme: pol?.scheme ?? null,
      preauth_code: c.preauth_code,
      invoice_no: c.invoice_id.slice(0, 8).toUpperCase(),
      total_cents: inv?.total_cents ?? 0,
      approved_cents: c.approved_amount_cents,
      notes: c.notes ?? null,
      lines: lines.length > 0 ? lines.map((l) => ({ description: l.description, billed_cents: l.billed_cents, approved_cents: l.approved_cents })) : [
        { description: `Invoice ${c.invoice_id.slice(0,8)}`, billed_cents: inv?.total_cents ?? 0, approved_cents: c.approved_amount_cents ?? null },
      ],
    });
  }

  function downloadBatch() {
    const rows = (claims.data ?? []).map((c) => {
      const inv = invoiceById(c.invoice_id);
      const pat = inv ? patientById(inv.patient_id) : undefined;
      const pol = policyById(c.policy_id);
      return {
        claim_id: c.id,
        created_at: c.created_at,
        insurer: pol?.insurer ?? "—",
        member_number: pol?.member_number ?? null,
        patient_name: pat?.full_name ?? "—",
        mrn: pat?.medical_record_number ?? null,
        invoice_no: c.invoice_id.slice(0, 8).toUpperCase(),
        total_cents: inv?.total_cents ?? 0,
        approved_cents: c.approved_amount_cents,
        status: c.status,
        preauth_code: c.preauth_code,
      };
    });
    if (rows.length === 0) return toast.info("No claims to export");
    exportClaimsBatchCSV(rows);
  }

  // Stats
  const submitted = claims.data?.filter((c) => c.status === "submitted" || c.status === "pending").length ?? 0;
  const approved = claims.data?.filter((c) => c.status === "approved").length ?? 0;
  const paid = claims.data?.filter((c) => c.status === "paid").length ?? 0;
  const rejected = claims.data?.filter((c) => c.status === "rejected").length ?? 0;
  const totalBilled = (claims.data ?? []).reduce((s, c) => s + (invoiceById(c.invoice_id)?.total_cents ?? 0), 0);
  const totalApproved = (claims.data ?? []).reduce((s, c) => s + (c.approved_amount_cents ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Shield className="h-6 w-6 text-primary" /> Insurance & Claims</h1>
          <p className="text-sm text-muted-foreground">Kenyan payers, pre-authorisations, claim filing and batch export.</p>
        </div>
        <Button variant="outline" onClick={downloadBatch}><FileDown className="h-4 w-4" /> Batch CSV (for payer portal)</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Submitted</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{submitted}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Approved</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-emerald-600">{approved}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Paid</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-blue-600">{paid}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Rejected</CardTitle></CardHeader><CardContent className="text-2xl font-semibold text-rose-600">{rejected}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Billed</CardTitle></CardHeader><CardContent className="text-lg font-semibold">{money(totalBilled)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">Approved KES</CardTitle></CardHeader><CardContent className="text-lg font-semibold text-emerald-600">{money(totalApproved)}</CardContent></Card>
      </div>

      <Tabs defaultValue="claims">
        <TabsList>
          <TabsTrigger value="claims">Claims</TabsTrigger>
          <TabsTrigger value="submissions"><Radio className="mr-1 h-3 w-3" /> Live submissions</TabsTrigger>
          <TabsTrigger value="remittances">Remittances</TabsTrigger>
          <TabsTrigger value="policies">Member policies</TabsTrigger>
          <TabsTrigger value="payers">Payers</TabsTrigger>
        </TabsList>

        <TabsContent value="claims" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" />Raise claim</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Raise insurance claim</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Invoice</Label>
                    <Select value={claimForm.invoice_id} onValueChange={(v) => setClaimForm({ ...claimForm, invoice_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select unpaid invoice" /></SelectTrigger>
                      <SelectContent>{invoices.data?.map((i) => <SelectItem key={i.id} value={i.id}>{patientById(i.patient_id)?.full_name ?? "—"} — {money(i.total_cents)}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Member policy</Label>
                    <Select value={claimForm.policy_id} onValueChange={(v) => setClaimForm({ ...claimForm, policy_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select policy" /></SelectTrigger>
                      <SelectContent>{policies.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.insurer} · {p.member_number}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Pre-authorisation code</Label><Input value={claimForm.preauth_code} onChange={(e) => setClaimForm({ ...claimForm, preauth_code: e.target.value })} placeholder="e.g. PA-2026-12345" /></div>
                  <div><Label>Clinical justification</Label><Textarea rows={3} value={claimForm.notes} onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })} placeholder="Indication, ICD codes, treatment summary…" /></div>
                </div>
                <DialogFooter><Button onClick={() => createClaim.mutate()} disabled={createClaim.isPending}>Submit claim</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="divide-y">
              {claims.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No claims yet.</div>}
              {claims.data?.map((c) => {
                const inv = invoiceById(c.invoice_id);
                const pol = policyById(c.policy_id);
                const pat = inv ? patientById(inv.patient_id) : undefined;
                return (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <div className="font-medium">{pat?.full_name ?? "—"} <span className="text-xs text-muted-foreground">({pat?.medical_record_number ?? "—"})</span></div>
                      <div className="text-xs text-muted-foreground">{pol?.insurer ?? "—"} · {pol?.member_number ?? "—"} · Pre-auth {c.preauth_code ?? "—"} · {new Date(c.created_at).toLocaleString("en-GB")}</div>
                      {c.notes && <div className="mt-1 text-xs italic text-muted-foreground line-clamp-2">{c.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right text-xs">
                        <div>Billed: <span className="font-semibold">{money(inv?.total_cents ?? 0)}</span></div>
                        {c.approved_amount_cents != null && <div className="text-emerald-700">Approved: {money(c.approved_amount_cents)}</div>}
                      </div>
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        c.status === "approved" ? "bg-emerald-500/10 text-emerald-700" :
                        c.status === "rejected" ? "bg-rose-500/10 text-rose-700" :
                        c.status === "paid" ? "bg-blue-500/10 text-blue-700" :
                        "bg-amber-500/10 text-amber-700"
                      }`}>{c.status}</span>
                      <Button size="sm" variant="outline" onClick={() => downloadClaim(c)}><Download className="h-4 w-4" /> PDF</Button>
                      <Button size="sm" variant="ghost" title="Download FHIR R4" onClick={async () => {
                        const { data: lns } = await supabase.from("claim_lines" as never).select("*").eq("claim_id", c.id);
                        const lines = ((lns as unknown as Array<{ description: string; billed_cents: number; approved_cents: number | null }>) ?? []);
                        downloadFhir(`claim-${c.id.slice(0, 8)}.fhir.json`, toFhirClaim({
                          id: c.id, patient_id: inv?.patient_id ?? "", insurer: pol?.insurer ?? null,
                          member_number: pol?.member_number ?? null, preauth_code: c.preauth_code,
                          status: c.status, created_at: c.created_at, total_cents: inv?.total_cents ?? 0,
                          approved_cents: c.approved_amount_cents,
                          lines: lines.length ? lines : [{ description: `Invoice ${c.invoice_id.slice(0,8)}`, billed_cents: inv?.total_cents ?? 0, approved_cents: c.approved_amount_cents }],
                        }));
                      }}><FileJson className="h-4 w-4" /></Button>
                      {(c.status === "pending" || c.status === "submitted" || c.status === "draft") && (
                        <>
                          <Button size="sm" onClick={() => submitToPayer.mutate(c)} disabled={submitToPayer.isPending}>
                            <Send className="h-4 w-4" /> Send to payer
                          </Button>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => {
                              const a = prompt("Approved amount (KES)?", String(((inv?.total_cents ?? 0) / 100).toFixed(2)));
                              if (a) updateClaim.mutate({ id: c.id, status: "approved", amount: Math.round(parseFloat(a) * 100) });
                            }}>Approve</Button>
                            <Button size="sm" variant="ghost" onClick={() => {
                              const reason = prompt("Rejection reason?");
                              if (reason) updateClaim.mutate({ id: c.id, status: "rejected", note: reason });
                            }}>Reject</Button>
                          </div>
                        </>
                      )}
                      {c.status === "approved" && (
                        <Button size="sm" variant="outline" onClick={() => updateClaim.mutate({ id: c.id, status: "paid" })}>Mark paid</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="submissions" className="space-y-2">
          <p className="text-xs text-muted-foreground">Real-time status updates as payers acknowledge, process and adjudicate submitted claims.</p>
          <div className="rounded-lg border bg-card divide-y">
            {(submissions.data ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">No submissions yet.</div>}
            {submissions.data?.map((s) => {
              const c = claims.data?.find((cl) => cl.id === s.claim_id);
              const inv = c ? invoiceById(c.invoice_id) : undefined;
              const pat = inv ? patientById(inv.patient_id) : undefined;
              return (
                <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <div className="font-medium">{pat?.full_name ?? "—"} <span className="text-xs text-muted-foreground">· {s.payer_code ?? "—"} · ref {s.external_ref ?? "—"}</span></div>
                    <div className="text-xs text-muted-foreground">{new Date(s.last_event_at).toLocaleString("en-GB")}</div>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs ${
                    s.status === "paid" ? "bg-blue-500/10 text-blue-700" :
                    s.status === "approved" ? "bg-emerald-500/10 text-emerald-700" :
                    s.status === "rejected" ? "bg-rose-500/10 text-rose-700" :
                    "bg-amber-500/10 text-amber-700"
                  }`}>{s.status}</span>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="remittances" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Upload a payer remittance CSV (columns: <code>claim_ref, paid_amount, approved_amount, status, paid_date, reason</code>). The system auto-matches by external reference and updates billed/approved/paid KPIs.</p>
            <Dialog open={remitOpen} onOpenChange={setRemitOpen}>
              <DialogTrigger asChild><Button><Upload className="h-4 w-4" /> Import remittance</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Import payer remittance</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Payer</Label>
                    <Select value={remitPayer} onValueChange={setRemitPayer}>
                      <SelectTrigger><SelectValue placeholder="Select payer" /></SelectTrigger>
                      <SelectContent>{payers.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>CSV file</Label>
                    <Input type="file" accept=".csv,text/csv" onChange={(e) => setRemitFile(e.target.files?.[0] ?? null)} />
                  </div>
                </div>
                <DialogFooter><Button onClick={() => importRemittance.mutate()} disabled={importRemittance.isPending}>Reconcile</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-lg border bg-card divide-y">
            {(batches.data ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">No remittance batches imported.</div>}
            {batches.data?.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <div className="font-medium">{b.filename ?? "remittance"} <span className="text-xs text-muted-foreground">· {b.payer_code ?? "—"}</span></div>
                  <div className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleString("en-GB")} · {b.rows_total} rows · {b.rows_matched} matched · {b.rows_unmatched} unmatched</div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold text-blue-700">{money(b.total_paid_cents)} paid</div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>



        <TabsContent value="policies" className="space-y-3">
          <div className="flex justify-end">
            <Dialog open={polOpen} onOpenChange={setPolOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4" />Add member policy</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add insurance policy</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Patient</Label>
                    <Select value={polForm.patient_id} onValueChange={(v) => setPolForm({ ...polForm, patient_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                      <SelectContent>{patients.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name} ({p.medical_record_number ?? "—"})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Insurer</Label>
                    <Select value={polForm.payer_id} onValueChange={(v) => setPolForm({ ...polForm, payer_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select Kenyan payer" /></SelectTrigger>
                      <SelectContent>
                        {payers.data?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.category ? ` · ${p.category}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Member number</Label><Input value={polForm.member_number} onChange={(e) => setPolForm({ ...polForm, member_number: e.target.value })} /></div>
                  <div><Label>Scheme / Plan</Label><Input value={polForm.scheme} onChange={(e) => setPolForm({ ...polForm, scheme: e.target.value })} placeholder="e.g. Bronze, Outpatient" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Valid from</Label><Input type="date" value={polForm.valid_from} onChange={(e) => setPolForm({ ...polForm, valid_from: e.target.value })} /></div>
                    <div><Label>Valid to</Label><Input type="date" value={polForm.valid_to} onChange={(e) => setPolForm({ ...polForm, valid_to: e.target.value })} /></div>
                  </div>
                </div>
                <DialogFooter><Button onClick={() => createPolicy.mutate()} disabled={createPolicy.isPending}>Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-lg border bg-card">
            <div className="divide-y">
              {policies.data?.length === 0 && <div className="p-4 text-sm text-muted-foreground">No policies.</div>}
              {policies.data?.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <div className="font-medium">{patientById(p.patient_id)?.full_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.insurer} · {p.member_number} · {p.scheme ?? "—"}{p.valid_to ? ` · expires ${p.valid_to}` : ""}</div>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs ${p.active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{p.active ? "active" : "inactive"}</span>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payers" className="space-y-3">
          <p className="text-xs text-muted-foreground">Pre-loaded with Kenya's major insurers, schemes and administrators. Admin can deactivate or extend this list.</p>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {payers.data?.map((p) => (
              <div key={p.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">Code {p.code} · {p.category ?? "—"}</div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Mail, Pencil, Printer, X, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { buildLabReportPDF, exportLabReportPDF, previewLabReportPDF } from "@/lib/lab-report-pdf";

interface LabDoc {
  order_id: string;
  patient_id: string;
  patient_name: string;
  patient_mrn: string | null;
  patient_dob: string | null;
  patient_gender: string | null;
  test_id: string | null;
  test_name: string;
  status: string;
  ordered_by: string | null;
  ordering_clinician: string | null;
  scientist_id: string | null;
  scientist_name: string | null;
  specimen: string | null;
  container: string | null;
  ordered_at: string;
  collected_at: string | null;
  reported_at: string | null;
  verified_at: string | null;
  comments: string | null;
  visit_id: string | null;
}

function ageFromDob(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(+d)) return null;
  const y = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return `${y}y`;
}

/** Redesigned Completed Lab Reports section — document management with metadata list + built-in PDF viewer. */
export function LabDocumentBrowser() {
  const { hasAnyRole } = useAuth();
  const canAmend = hasAnyRole(["lab_tech", "admin", "doctor"]);
  const [q, setQ] = useState("");
  const [openDoc, setOpenDoc] = useState<LabDoc | null>(null);

  const docs = useQuery({
    queryKey: ["lab-doc-browser"],
    queryFn: async (): Promise<LabDoc[]> => {
      const { data: results } = await supabase.from("lab_results" as never)
        .select("id, order_id, performed_at, comments, verified_by, performed_by")
        .not("performed_at", "is", null)
        .order("performed_at", { ascending: false })
        .limit(500);
      const rArr = (results as unknown as Array<{ id: string; order_id: string; performed_at: string; comments: string | null; verified_by: string | null; performed_by: string | null }>) ?? [];
      const orderIds = rArr.map((r) => r.order_id).filter(Boolean);
      if (!orderIds.length) return [];

      const { data: orders } = await supabase.from("lab_orders" as never)
        .select("id, patient_id, test_id, status, ordered_by, created_at, visit_id, clinical_notes")
        .in("id", orderIds as never);
      const oArr = (orders as unknown as Array<{ id: string; patient_id: string; test_id: string | null; status: string; ordered_by: string | null; created_at: string; visit_id: string | null; clinical_notes: string | null }>) ?? [];
      const om = new Map(oArr.map((o) => [o.id, o]));

      // Sample collection time
      const { data: samples } = await supabase.from("lab_samples" as never)
        .select("order_id, collected_at, sample_code, condition")
        .in("order_id", orderIds as never);
      const sm = new Map<string, { collected_at: string | null; sample_code: string | null; condition: string | null }>();
      ((samples as unknown as Array<{ order_id: string; collected_at: string | null; sample_code: string | null; condition: string | null }>) ?? []).forEach((s) => sm.set(s.order_id, s));

      const patientIds = Array.from(new Set(oArr.map((o) => o.patient_id)));
      const { data: patients } = patientIds.length
        ? await supabase.from("patients" as never).select("id, full_name, medical_record_number, date_of_birth, gender").in("id", patientIds as never)
        : { data: [] as unknown };
      const pm = new Map<string, { full_name: string; medical_record_number: string | null; date_of_birth: string | null; gender: string | null }>();
      ((patients as unknown as Array<{ id: string; full_name: string; medical_record_number: string | null; date_of_birth: string | null; gender: string | null }>) ?? []).forEach((p) => pm.set(p.id, p));

      const testIds = Array.from(new Set(oArr.map((o) => o.test_id).filter(Boolean))) as string[];
      const { data: tests } = testIds.length
        ? await supabase.from("lab_tests_catalog" as never).select("id, name, specimen").in("id", testIds as never)
        : { data: [] as unknown };
      const tm = new Map<string, { name: string; specimen: string | null }>();
      ((tests as unknown as Array<{ id: string; name: string; specimen: string | null }>) ?? []).forEach((t) => tm.set(t.id, t));

      const userIds = Array.from(new Set([
        ...oArr.map((o) => o.ordered_by).filter(Boolean),
        ...rArr.map((r) => r.verified_by).filter(Boolean),
      ])) as string[];
      const { data: profs } = userIds.length
        ? await supabase.from("profiles" as never).select("id, full_name").in("id", userIds as never)
        : { data: [] as unknown };
      const um = new Map<string, string>();
      ((profs as unknown as Array<{ id: string; full_name: string | null }>) ?? []).forEach((p) => um.set(p.id, p.full_name ?? ""));

      return rArr.map((r) => {
        const o = om.get(r.order_id);
        const p = o ? pm.get(o.patient_id) : null;
        const t = o?.test_id ? tm.get(o.test_id) : null;
        const s = sm.get(r.order_id);
        return {
          order_id: r.order_id,
          patient_id: o?.patient_id ?? "",
          patient_name: p?.full_name ?? "Unknown patient",
          patient_mrn: p?.medical_record_number ?? null,
          patient_dob: p?.date_of_birth ?? null,
          patient_gender: p?.gender ?? null,
          test_id: o?.test_id ?? null,
          test_name: t?.name ?? "Laboratory investigation",
          status: r.verified_by ? "verified" : "reported",
          ordered_by: o?.ordered_by ?? null,
          ordering_clinician: o?.ordered_by ? um.get(o.ordered_by) ?? null : null,
          scientist_id: r.verified_by ?? r.performed_by,
          scientist_name: (r.verified_by && um.get(r.verified_by)) || (r.performed_by && um.get(r.performed_by)) || null,
          specimen: t?.specimen ?? null,
          container: s?.sample_code ?? null,
          ordered_at: o?.created_at ?? r.performed_at,
          collected_at: s?.collected_at ?? null,
          reported_at: r.performed_at,
          verified_at: r.verified_by ? r.performed_at : null,
          comments: r.comments,
          visit_id: o?.visit_id ?? null,
        };
      });
    },
  });

  const filtered = useMemo(() => {
    const list = docs.data ?? [];
    if (!q.trim()) return list;
    const s = q.toLowerCase();
    return list.filter((d) => `${d.patient_name} ${d.patient_mrn ?? ""} ${d.test_name} ${d.ordering_clinician ?? ""} ${d.scientist_name ?? ""}`.toLowerCase().includes(s));
  }, [docs.data, q]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-primary" /> Laboratory reports · document archive</div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search patient, MRN, investigation, clinician…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {docs.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading laboratory documents…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No completed laboratory reports{q ? " match your search" : ""}.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2 text-left">Patient</th>
                <th className="p-2 text-left">MRN</th>
                <th className="p-2 text-left">Investigation</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Requesting doctor</th>
                <th className="p-2 text-left">Lab scientist</th>
                <th className="p-2 text-left">Collected</th>
                <th className="p-2 text-left">Reported</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr
                  key={d.order_id}
                  onClick={() => setOpenDoc(d)}
                  className="cursor-pointer border-t hover:bg-accent/40"
                >
                  <td className="p-2 font-medium">{d.patient_name}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{d.patient_mrn ?? "—"}</td>
                  <td className="p-2">{d.test_name}</td>
                  <td className="p-2">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      d.status === "verified" ? "bg-emerald-500/10 text-emerald-700" : "bg-sky-500/10 text-sky-700"
                    }`}>{d.status}</span>
                  </td>
                  <td className="p-2 text-muted-foreground">{d.ordering_clinician ?? "—"}</td>
                  <td className="p-2 text-muted-foreground">{d.scientist_name ?? "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{d.collected_at ? new Date(d.collected_at).toLocaleDateString("en-GB") : "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{d.reported_at ? new Date(d.reported_at).toLocaleDateString("en-GB") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openDoc && (
        <LabReportViewerDialog doc={openDoc} canAmend={canAmend} onClose={() => setOpenDoc(null)} />
      )}
    </div>
  );
}

function LabReportViewerDialog({ doc: d, canAmend, onClose }: { doc: LabDoc; canAmend: boolean; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amend, setAmend] = useState(d.comments ?? "");
  const { user } = useAuth();

  // Load result values for this order
  const values = useQuery({
    queryKey: ["lab-doc-values", d.order_id],
    queryFn: async () => {
      const { data } = await supabase.from("lab_result_values" as never)
        .select("parameter_name, value_text, units, reference_range, abnormal_flag")
        .eq("order_id", d.order_id);
      return (data as unknown as Array<{ parameter_name: string; value_text: string | null; units: string | null; reference_range: string | null; abnormal_flag: string | null }>) ?? [];
    },
  });
  const summary = useQuery({
    queryKey: ["lab-doc-summary", d.order_id],
    queryFn: async () => {
      const { data } = await supabase.from("lab_results" as never)
        .select("result_value, units, reference_range, abnormal_flag, comments")
        .eq("order_id", d.order_id).maybeSingle();
      return data as unknown as { result_value: string | null; units: string | null; reference_range: string | null; abnormal_flag: string | null; comments: string | null } | null;
    },
  });

  const input = useMemo(() => ({
    test_name: d.test_name,
    order_id: d.order_id,
    ordered_at: d.ordered_at,
    performed_at: d.reported_at,
    patient_name: d.patient_name,
    mrn: d.patient_mrn,
    age: ageFromDob(d.patient_dob),
    gender: d.patient_gender,
    pathologist: d.scientist_name,
    parameters: (values.data ?? []).length
      ? (values.data ?? []).map((v) => ({
          parameter_name: v.parameter_name,
          value_text: v.value_text,
          units: v.units,
          reference_range: v.reference_range,
          abnormal_flag: v.abnormal_flag,
        }))
      : [{
          parameter_name: d.test_name,
          value_text: summary.data?.result_value ?? null,
          units: summary.data?.units ?? null,
          reference_range: summary.data?.reference_range ?? null,
          abnormal_flag: summary.data?.abnormal_flag ?? null,
        }],
    comments: summary.data?.comments ?? d.comments ?? null,
  }), [d, values.data, summary.data]);

  useEffect(() => {
    if (values.isLoading || summary.isLoading) return;
    let cancelled = false;
    previewLabReportPDF(input).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.isLoading, summary.isLoading, input]);

  async function handlePrint() {
    const built = await buildLabReportPDF(input);
    const b = built.output("bloburl") as unknown as string;
    const win = window.open(b, "_blank");
    if (win) setTimeout(() => win.print(), 500);
    else toast.error("Pop-up blocked — allow pop-ups to print.");
  }

  async function handleEmail() {
    const subject = encodeURIComponent(`Laboratory report — ${d.test_name} · ${d.patient_name}`);
    const body = encodeURIComponent(
      `Please find the laboratory report for ${d.patient_name} (MRN ${d.patient_mrn ?? "—"}) attached.\n\nInvestigation: ${d.test_name}\nReported: ${d.reported_at ? new Date(d.reported_at).toLocaleString("en-GB") : "—"}\n\nDownload the PDF from Litu Vault to attach.`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  async function handleAmend() {
    if (!amend.trim()) return toast.error("Amendment note is required");
    const prev = summary.data?.comments ?? "";
    const stamp = new Date().toISOString();
    const merged = `${prev ? prev + "\n\n" : ""}[Amended ${stamp}${user?.id ? " · " + user.id.slice(0,8) : ""}] ${amend.trim()}`;
    const { error } = await supabase.from("lab_results" as never)
      .update({ comments: merged } as never)
      .eq("order_id", d.order_id);
    if (error) return toast.error(error.message);
    toast.success("Amendment recorded");
    setAmendOpen(false);
    // Refresh preview
    const fresh = await previewLabReportPDF({ ...input, comments: merged });
    setUrl(fresh);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>{d.test_name} · {d.patient_name}</span>
            <div className="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="outline" onClick={handlePrint}><Printer className="h-4 w-4" /> Print</Button>
              <Button size="sm" variant="outline" onClick={() => exportLabReportPDF(input)}><Download className="h-4 w-4" /> Download</Button>
              <Button size="sm" variant="outline" onClick={handleEmail}><Mail className="h-4 w-4" /> Email</Button>
              {canAmend && <Button size="sm" variant="outline" onClick={() => setAmendOpen(true)}><Pencil className="h-4 w-4" /> Amend</Button>}
              <Button size="icon" variant="ghost" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-0 md:grid-cols-[240px_1fr]">
          <aside className="space-y-3 border-r bg-muted/30 p-4 text-xs">
            <MetaRow label="Patient" value={d.patient_name} />
            <MetaRow label="MRN" value={d.patient_mrn ?? "—"} />
            <MetaRow label="Age / Sex" value={`${ageFromDob(d.patient_dob) ?? "—"} · ${d.patient_gender ?? "—"}`} />
            <MetaRow label="Encounter" value={d.visit_id ? d.visit_id.slice(0,8) : "—"} />
            <MetaRow label="Investigation" value={d.test_name} />
            <MetaRow label="Specimen" value={d.specimen ?? "—"} />
            <MetaRow label="Container" value={d.container ?? "—"} />
            <MetaRow label="Ordering clinician" value={d.ordering_clinician ?? "—"} />
            <MetaRow label="Lab scientist" value={d.scientist_name ?? "—"} />
            <MetaRow label="Collected" value={d.collected_at ? new Date(d.collected_at).toLocaleString("en-GB") : "—"} />
            <MetaRow label="Reported" value={d.reported_at ? new Date(d.reported_at).toLocaleString("en-GB") : "—"} />
            <MetaRow label="Verified" value={d.verified_at ? new Date(d.verified_at).toLocaleString("en-GB") : "—"} />
            <MetaRow label="Status" value={d.status} />
          </aside>
          <div className="h-[75vh] bg-neutral-100">
            {url ? (
              <iframe title="Laboratory report PDF" src={url} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Rendering report…</div>
            )}
          </div>
        </div>
        {amendOpen && (
          <Dialog open onOpenChange={(o) => !o && setAmendOpen(false)}>
            <DialogContent>
              <DialogHeader><DialogTitle>Amend report</DialogTitle></DialogHeader>
              <p className="text-xs text-muted-foreground">Amendments are appended to the report's comments and stamped with the user and timestamp. The original data is preserved.</p>
              <textarea
                className="min-h-[140px] w-full rounded border bg-background p-2 text-sm"
                placeholder="Amendment note…"
                value={amend}
                onChange={(e) => setAmend(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAmendOpen(false)}>Cancel</Button>
                <Button onClick={handleAmend}>Save amendment</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words">{value}</div>
    </div>
  );
}

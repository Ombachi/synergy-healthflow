import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PatientContext } from "@/components/patient-context";
import { RoleGate } from "@/components/role-gate";
import { useEncounterMap, encounterCounts, type EncounterFilter } from "@/hooks/use-encounter";
import { EncounterTabs } from "@/components/encounter-tabs";
import { Pager, usePager } from "@/components/pager";

export const Route = createFileRoute("/_authenticated/radiology")({ component: () => <RoleGate path="/radiology"><RadPortal /></RoleGate> });

interface ImgOrder { id: string; visit_id: string | null; patient_id: string; modality: string; body_part: string | null; clinical_question: string | null; status: string; priority: string; scheduled_at: string | null; performed_at: string | null; findings: string | null; report: string | null; image_path: string | null; created_at: string }
interface Patient { id: string; full_name: string }
interface RadTemplate { id: string; modality: string; name: string; technique: string | null; findings_template: string; impression_template: string | null }

function RadPortal() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canWork = hasAnyRole(["radiologist", "admin"]);
  const encMap = useEncounterMap();
  const [encFilter, setEncFilter] = useState<EncounterFilter>("outpatient");

  const orders = useQuery({
    queryKey: ["img-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("imaging_orders" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as ImgOrder[]) ?? [];
    },
  });
  const patients = useQuery({
    queryKey: ["rad-patients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never).select("id, full_name").order("full_name");
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ findings: "", report: "", image_path: "" });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const opening = orders.data?.find((o) => o.id === openId);

  // Persist any in-progress radiology report drafts so navigating away doesn't lose them.
  const draftKey = (id: string) => `litu:rad-draft:${id}`;
  function openReport(o: ImgOrder) {
    setOpenId(o.id);
    setImageFile(null);
    try {
      const raw = localStorage.getItem(draftKey(o.id));
      if (raw) {
        const d = JSON.parse(raw) as { findings?: string; report?: string; image_path?: string };
        setForm({ findings: d.findings ?? o.findings ?? "", report: d.report ?? o.report ?? "", image_path: d.image_path ?? o.image_path ?? "" });
        return;
      }
    } catch { /* ignore */ }
    setForm({ findings: o.findings ?? "", report: o.report ?? "", image_path: o.image_path ?? "" });
  }
  // Persist on change
  useEffect(() => {
    if (!openId) return;
    try { localStorage.setItem(draftKey(openId), JSON.stringify(form)); } catch { /* ignore */ }
  }, [openId, form]);
  // NOTE: drafts are restored only when the radiologist explicitly reopens an
  // order. We deliberately do NOT auto-open the last draft on mount — that made
  // a report dialog pop up every time the dashboard was visited.

  const templates = useQuery({
    queryKey: ["rad-templates"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("radiology_report_templates" as never)
        .select("id, modality, name, technique, findings_template, impression_template")
        .eq("active" as never, true as never)
        .order("modality");
      if (error) throw error;
      return (data as unknown as RadTemplate[]) ?? [];
    },
  });

  const schedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("imaging_orders" as never).update({
        status: "scheduled", scheduled_at: new Date().toISOString(),
      } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["img-orders"] }),
  });

  const submitReport = useMutation({
    mutationFn: async () => {
      if (!openId) return;
      let imagePath = form.image_path || null;
      if (imageFile) {
        const safeName = imageFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const path = `${openId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("imaging-files").upload(path, imageFile, { upsert: true });
        if (uploadError) throw uploadError;
        imagePath = path;
      }
      const { error } = await supabase.from("imaging_orders" as never).update({
        status: "reported", findings: form.findings || null, report: form.report || null,
        image_path: imagePath,
        performed_at: new Date().toISOString(), performed_by: user!.id,
      } as never).eq("id", openId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (openId) { try { localStorage.removeItem(draftKey(openId)); localStorage.removeItem("litu:rad-draft:last"); } catch { /* ignore */ } }
      setOpenId(null); setImageFile(null); setForm({ findings: "", report: "", image_path: "" });
      qc.invalidateQueries({ queryKey: ["img-orders"] }); toast.success("Report saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patientName = (id: string) => patients.data?.find((p) => p.id === id)?.full_name ?? "—";

  const encCounts = useMemo(
    () => encounterCounts(orders.data ?? [], encMap.data?.inpatientVisitIds),
    [orders.data, encMap.data?.inpatientVisitIds],
  );
  const filteredOrders = useMemo(() => {
    const inp = encMap.data?.inpatientVisitIds;
    return (orders.data ?? []).filter((o) => {
      if (encFilter === "all") return true;
      const isInp = !!(o.visit_id && inp?.has(o.visit_id));
      return encFilter === "inpatient" ? isInp : !isInp;
    });
  }, [orders.data, encFilter, encMap.data?.inpatientVisitIds]);
  const pager = usePager(filteredOrders, 20);

  // Templates matching the modality of the order being reported (fall back to all).
  const modalityTemplates = useMemo(() => {
    const all = templates.data ?? [];
    if (!opening) return all;
    const m = opening.modality.toLowerCase();
    const match = all.filter((t) => m.includes(t.modality.toLowerCase()) || t.modality.toLowerCase().includes(m));
    return match.length ? match : all;
  }, [templates.data, opening]);

  function applyTemplate(id: string) {
    const t = (templates.data ?? []).find((x) => x.id === id);
    if (!t) return;
    setForm((f) => ({
      ...f,
      findings: [t.technique ? `Technique: ${t.technique}` : null, t.findings_template].filter(Boolean).join("\n\n"),
      report: t.impression_template ?? f.report,
    }));
    toast.success(`Applied "${t.name}" template`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ScanLine className="h-6 w-6 text-primary" /> Radiology portal</h1>
        <p className="text-sm text-muted-foreground">Schedule imaging and publish reports.</p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-3">
          <div className="font-medium">Imaging orders</div>
          <div className="w-72"><EncounterTabs value={encFilter} onChange={setEncFilter} counts={encCounts} /></div>
        </div>
        <div className="divide-y">
          {filteredOrders.length === 0 && <div className="p-4 text-sm text-muted-foreground">No orders.</div>}
          {pager.slice.map((o) => (
            <div key={o.id} className="p-3 text-sm">
              <div className="grid grid-cols-12 items-center gap-2">
                <div className="col-span-3">
                  <div className="font-medium">{o.modality} {o.body_part && <span className="text-muted-foreground">· {o.body_part}</span>}</div>
                  <div className="text-xs text-muted-foreground">{patientName(o.patient_id)}</div>
                </div>
                <div className="col-span-4 text-xs text-muted-foreground">{o.clinical_question ?? "—"}</div>
                <div className="col-span-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${o.status === "reported" ? "bg-green-500/10 text-green-700" : o.status === "scheduled" ? "bg-blue-500/10 text-blue-700" : "bg-amber-500/10 text-amber-700"}`}>{o.status}</span>
                </div>
                <div className="col-span-3 flex justify-end gap-1">
                  {canWork && o.status === "ordered" && <Button size="sm" variant="outline" onClick={() => schedule.mutate(o.id)}>Schedule</Button>}
                  {canWork && o.status !== "reported" && (
                    <Button size="sm" onClick={() => openReport(o)}>Report</Button>
                  )}
                  {o.report && <span className="text-xs text-muted-foreground">✓ reported</span>}
                </div>
              </div>
              <PatientContext patientId={o.patient_id} visitId={o.visit_id} />
            </div>
          ))}
        </div>
        <Pager page={pager.page} pageCount={pager.pageCount} total={pager.total} pageSize={pager.pageSize} setPage={pager.setPage} label="orders" />
      </div>

      <Dialog open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{opening?.modality} — Report</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div>
              <Label>Structured report template</Label>
              <select
                className="mt-1 h-9 w-full rounded border bg-background px-2 text-sm"
                defaultValue=""
                onChange={(e) => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = ""; } }}
              >
                <option value="">Insert a template…</option>
                {modalityTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.modality} · {t.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">Inserting replaces the findings and impression with the template's normal text — edit as needed.</p>
            </div>
            <div><Label>Findings</Label><Textarea rows={8} value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} /></div>
            <div><Label>Impression / Report</Label><Textarea rows={5} value={form.report} onChange={(e) => setForm({ ...form, report: e.target.value })} /></div>
            <div>
              <Label>Report image</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              {form.image_path && <div className="mt-1 text-xs text-muted-foreground">Current attachment: {form.image_path}</div>}
            </div>
          </div>
          <DialogFooter><Button onClick={() => submitReport.mutate()} disabled={submitReport.isPending}>Publish report</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pill, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CatalogSearch, type CatalogItem } from "@/components/catalog-search";
import { runMedicationPrescribe, ageFromDob, type CdsCard } from "@/lib/cds/cds-hooks-runner";
import { CdsCards, CdsHardStopDialog, type OverrideResult } from "@/components/cds/cds-cards";

interface Drug { id: string; drug_name: string; medication_class: string | null; default_dose: string | null; default_frequency: string | null; default_duration: string | null; instructions: string | null }
interface Visit { id: string; patient_id: string; reason: string | null; created_at: string; status: string }
interface Patient { id: string; full_name: string; medical_record_number: string | null; allergies: string | null; date_of_birth: string | null }


// Detect dosage form from drug name for the form filter.
function detectForm(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("tablet")) return "tablet";
  if (n.includes("capsule")) return "capsule";
  if (n.includes("syrup") || n.includes("suspension")) return "syrup";
  if (n.includes("injection") || n.includes("vial") || n.includes("ampoule")) return "injection";
  if (n.includes("cream") || n.includes("ointment") || n.includes("gel")) return "topical";
  if (n.includes("drops") || n.includes("eye ") || n.includes("ear ")) return "drops";
  if (n.includes("pessary") || n.includes("suppository")) return "suppository";
  if (n.includes("inhaler") || n.includes("nebul")) return "inhaler";
  if (n.includes("powder")) return "powder";
  return "other";
}

export function PrescribePanel({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [visitId, setVisitId] = useState("");
  const [selected, setSelected] = useState<Drug | null>(null);
  const [form, setForm] = useState({ dose: "", frequency: "", duration: "", instructions: "" });
  const [formFilter, setFormFilter] = useState<string>("all");

  const visits = useQuery({
    queryKey: ["prescribe-visits"],
    queryFn: async () => {
      const { data, error } = await supabase.from("visits" as never)
        .select("id, patient_id, reason, created_at, status")
        .eq("status", "open").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data as unknown as Visit[]) ?? [];
    },
  });

  const patients = useQuery({
    queryKey: ["prescribe-patients", (visits.data ?? []).map((v) => v.patient_id).join(",")],
    enabled: (visits.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = Array.from(new Set((visits.data ?? []).map((v) => v.patient_id)));
      const { data } = await supabase.from("patients" as never)
        .select("id, full_name, medical_record_number, allergies, date_of_birth").in("id", ids as never);
      return (data as unknown as Patient[]) ?? [];
    },
  });

  const drugs = useQuery({
    queryKey: ["drug-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("drug_catalog" as never)
        .select("id, drug_name, medication_class, default_dose, default_frequency, default_duration, instructions")
        .eq("active", true).order("drug_name").limit(2000);
      if (error) throw error;
      return (data as unknown as Drug[]) ?? [];
    },
  });

  const selectedVisit = visits.data?.find((v) => v.id === visitId);
  const selectedPatient = patients.data?.find((p) => p.id === selectedVisit?.patient_id);

  // ---- CDS Hooks "medication-prescribe" screening ---------------------
  const { user: authUser } = useAuth();
  const activeMeds = useQuery({
    queryKey: ["prescribe-active-meds", selectedVisit?.patient_id],
    enabled: !!selectedVisit?.patient_id,
    queryFn: async () => {
      const pid = selectedVisit!.patient_id;
      const { data: vids } = await supabase.from("visits" as never)
        .select("id").eq("patient_id", pid).limit(50);
      const ids = ((vids as unknown as { id: string }[]) ?? []).map((v) => v.id);
      const meds: string[] = [];
      if (ids.length) {
        const { data } = await supabase.from("prescriptions" as never)
          .select("medication, created_at").in("visit_id", ids as never)
          .order("created_at", { ascending: false }).limit(60);
        meds.push(...((data as unknown as { medication: string }[]) ?? []).map((r) => r.medication));
      }
      // Chronic-care regimens count as active medication too.
      const { data: chronic } = await supabase.from("chronic_medications" as never)
        .select("medication, status").eq("patient_id", pid);
      meds.push(...((chronic as unknown as { medication: string; status: string }[]) ?? [])
        .filter((c) => c.status !== "stopped" && c.status !== "discontinued").map((c) => c.medication));
      return Array.from(new Set(meds));
    },
  });

  const allergyTerms = useMemo(
    () => (selectedPatient?.allergies ?? "").split(/[,;\n]/).map((s) => s.trim()).filter((s) => s && !/^(none|nil|nkda|no known)/i.test(s)),
    [selectedPatient?.allergies],
  );

  const cards = useMemo<CdsCard[]>(() => {
    if (!selected || !selectedVisit) return [];
    return runMedicationPrescribe({
      hook: "medication-prescribe",
      context: { patientId: selectedVisit.patient_id, encounterId: selectedVisit.id, draftMedications: [selected.drug_name] },
      prefetch: { activeMedications: activeMeds.data ?? [], allergies: allergyTerms, ageYears: ageFromDob(selectedPatient?.date_of_birth) },
    }).cards;
  }, [selected, selectedVisit, selectedPatient?.date_of_birth, allergyTerms, activeMeds.data]);

  const critical = cards.filter((c) => c.indicator === "critical");
  const blocking = critical.length > 0;
  const [stopOpen, setStopOpen] = useState(false);

  const items = useMemo<(CatalogItem & Drug & { form: string })[]>(() => {
    const rows = (drugs.data ?? []).map((d) => {
      const f = detectForm(d.drug_name);
      return {
        ...d, form: f,
        primary: d.drug_name,
        secondary: [d.medication_class, d.default_dose].filter(Boolean).join(" · "),
        tag: d.medication_class ?? undefined,
      };
    });
    return formFilter === "all" ? rows : rows.filter((r) => r.form === formFilter);
  }, [drugs.data, formFilter]);

  const addRx = useMutation({
    mutationFn: async (ov?: OverrideResult) => {
      if (!selectedVisit) throw new Error("Choose a visit first");
      if (!selected) throw new Error("Pick a medication");
      if (blocking && !ov) throw new Error("Critical alert — a signed override is required");
      const safetyNote = cards.length
        ? `\n[CDS alerts acknowledged: ${cards.map((c) => c.summary).join("; ")}]` +
          (ov ? `\n[Signed override by ${authUser?.email ?? "prescriber"} at ${new Date().toISOString()} · ${ov.rationaleCode}: ${ov.rationaleText}]` : "")
        : "";
      const { error } = await supabase.from("prescriptions" as never).insert({
        visit_id: selectedVisit.id,
        medication: selected.drug_name,
        dose: form.dose || selected.default_dose,
        frequency: form.frequency || selected.default_frequency,
        duration: form.duration || selected.default_duration,
        instructions: (form.instructions || selected.instructions || "") + safetyNote,
        created_by: user?.id ?? null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Added ${selected?.drug_name} to med order`);
      setSelected(null);
      setForm({ dose: "", frequency: "", duration: "", instructions: "" });
      qc.invalidateQueries({ queryKey: ["pharm-rx"] });
      qc.invalidateQueries({ queryKey: ["prescribe-active-meds"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const forms = ["all", "tablet", "capsule", "syrup", "injection", "topical", "drops", "suppository", "inhaler", "powder", "other"];

  return (
    <div className="space-y-4">
      <CdsHardStopDialog open={stopOpen} onOpenChange={setStopOpen} cards={critical}
        email={authUser?.email} onConfirm={async (r) => { await addRx.mutateAsync(r); }} />
      {!compact && <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Pill className="h-6 w-6 text-primary" /> Prescribe medication
        </h1>
        <p className="text-sm text-muted-foreground">Search the medication list, filter by class and form, then add to a med order.</p>
      </div>}

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div>
            <Label>Visit</Label>
            <select value={visitId} onChange={(e) => setVisitId(e.target.value)}
              className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm">
              <option value="">— select an open visit —</option>
              {visits.data?.map((v) => {
                const p = patients.data?.find((pt) => pt.id === v.patient_id);
                return (
                  <option key={v.id} value={v.id}>
                    {p?.full_name ?? "Patient"} {p?.medical_record_number ? `(${p.medical_record_number})` : ""} · {new Date(v.created_at).toLocaleDateString("en-GB")}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <Label>Dosage form</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {forms.map((f) => (
                <button key={f} onClick={() => setFormFilter(f)}
                  className={`rounded-full px-2.5 py-0.5 text-xs capitalize transition ${
                    formFilter === f ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"
                  }`}>{f}</button>
              ))}
            </div>
          </div>

          {selectedPatient && (
            <div className="rounded border bg-muted/30 p-2 text-xs">
              <div className="font-medium">{selectedPatient.full_name}</div>
              <div className="text-muted-foreground">{selectedPatient.medical_record_number ?? "—"}</div>
              {selectedVisit?.reason && <div className="mt-1 italic text-muted-foreground">Reason: {selectedVisit.reason}</div>}
              <div className="mt-1">
                <span className="font-medium">Allergies: </span>
                {allergyTerms.length ? (
                  <span className="text-destructive">{allergyTerms.join(", ")}</span>
                ) : (
                  <span className="text-muted-foreground">none recorded</span>
                )}
              </div>
              {(activeMeds.data?.length ?? 0) > 0 && (
                <div className="mt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Current meds: </span>
                  {Array.from(new Set(activeMeds.data)).slice(0, 8).join(", ")}
                </div>
              )}
            </div>
          )}

          {selected && (
            <div className="space-y-2 rounded-md border bg-background p-3">
              <div className="text-sm font-semibold">{selected.drug_name}</div>

              <CdsCards cards={cards} onSuggest={(m) => {
                const alt = (drugs.data ?? []).find((d) => d.drug_name.toLowerCase().includes(m.toLowerCase()));
                if (alt) setSelected(alt); else toast.info(`${m} is not in the medication list`);
              }} />

              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[11px]">Dose</Label><Input value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} placeholder={selected.default_dose ?? "e.g. 500mg"} /></div>
                <div><Label className="text-[11px]">Frequency</Label><Input value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} placeholder={selected.default_frequency ?? "e.g. TDS"} /></div>
                <div className="col-span-2"><Label className="text-[11px]">Duration</Label><Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder={selected.default_duration ?? "e.g. 5 days"} /></div>
                <div className="col-span-2"><Label className="text-[11px]">Instructions</Label><Textarea rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="e.g. After meals" /></div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" variant={blocking ? "destructive" : "default"}
                  onClick={() => (blocking ? setStopOpen(true) : addRx.mutate(undefined))} disabled={addRx.isPending || !visitId}>
                  <Plus className="h-4 w-4" /> {blocking ? "Hard stop — review" : "Add to med order"}
                </Button>
                <Button variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
              </div>
            </div>
          )}

        </div>

        <div className="rounded-lg border bg-card p-4">
          <CatalogSearch
            items={items}
            loading={drugs.isLoading}
            storageKey="vitalis:recent-medications"
            placeholder="Search by drug name or class (e.g. amoxicillin, paracetamol)…"
            emptyLabel="No matching medications"
            onPick={(d) => setSelected(d as Drug)}
            renderAction={(d) => (
              <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setSelected(d as Drug); }}>
                <Plus className="h-3 w-3" /> Select
              </Button>
            )}
          />
        </div>
      </div>
    </div>
  );
}

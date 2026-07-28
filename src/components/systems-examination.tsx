import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Save, Stethoscope, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Structured systems-examination editor.
 *  Stores JSON in visit.examination:
 *  { [systemKey]: { normal: boolean, comment: string, fields: Record<string,string> } }
 */

type FieldType = "select" | "text" | "textarea";
interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  normal?: string;
  /** show only if another field equals a specific value */
  revealsWhen?: { field: string; equals: string };
}
interface SystemDef {
  key: string;
  label: string;
  fields: FieldDef[];
  /** normal default narrative when 'Mark as normal' pressed */
  normalComment: string;
  showIf?: (ctx: ExamCtx) => boolean;
}

export interface ExamCtx {
  isFemale?: boolean;
  isPediatric?: boolean;
}

const YN = ["Present", "Absent"];

const SYSTEMS: SystemDef[] = [
  {
    key: "general", label: "General Appearance",
    normalComment: "Alert, oriented, well-nourished, no acute distress.",
    fields: [
      { key: "appearance", label: "Appearance", type: "select", options: ["Well", "Ill-looking", "Cachectic", "Dehydrated"], normal: "Well" },
      { key: "distress", label: "Distress", type: "select", options: ["None", "Mild", "Moderate", "Severe"], normal: "None" },
      { key: "hydration", label: "Hydration", type: "select", options: ["Well hydrated", "Mildly dehydrated", "Severely dehydrated"], normal: "Well hydrated" },
    ],
  },
  {
    key: "head_neck", label: "Head & Neck",
    normalComment: "Normocephalic, atraumatic. No lymphadenopathy, thyroid non-enlarged, no JVD.",
    fields: [
      { key: "skull", label: "Skull", type: "select", options: ["Normocephalic", "Trauma", "Deformity"], normal: "Normocephalic" },
      { key: "lymph_nodes", label: "Cervical nodes", type: "select", options: ["Not palpable", "Palpable"], normal: "Not palpable" },
      { key: "thyroid", label: "Thyroid", type: "select", options: ["Normal", "Enlarged", "Nodular"], normal: "Normal" },
      { key: "jvp", label: "JVP", type: "select", options: ["Not raised", "Raised"], normal: "Not raised" },
    ],
  },
  {
    key: "eyes", label: "Eyes",
    normalComment: "PERRLA, sclerae anicteric, conjunctivae pink, EOMI, no discharge.",
    fields: [
      { key: "pupils", label: "Pupils", type: "select", options: ["PERRLA", "Anisocoria", "Non-reactive"], normal: "PERRLA" },
      { key: "conjunctivae", label: "Conjunctivae", type: "select", options: ["Pink", "Pale", "Injected"], normal: "Pink" },
      { key: "sclerae", label: "Sclerae", type: "select", options: ["Anicteric", "Icteric"], normal: "Anicteric" },
      { key: "visual_acuity", label: "Visual acuity", type: "text" },
    ],
  },
  {
    key: "ent", label: "ENT",
    normalComment: "TMs intact, external canals clear. Nasal mucosa pink, no discharge. Throat clear.",
    fields: [
      { key: "ears", label: "Ears", type: "select", options: ["Normal", "Discharge", "TM perforation", "Wax impaction"], normal: "Normal" },
      { key: "nose", label: "Nose", type: "select", options: ["Normal", "Congested", "Discharge", "Epistaxis"], normal: "Normal" },
      { key: "throat", label: "Throat", type: "select", options: ["Clear", "Erythematous", "Exudates", "Tonsillar enlargement"], normal: "Clear" },
    ],
  },
  {
    key: "oral", label: "Oral Cavity",
    normalComment: "Moist mucosa, dentition intact, no ulcers, tongue midline.",
    fields: [
      { key: "mucosa", label: "Mucosa", type: "select", options: ["Moist", "Dry"], normal: "Moist" },
      { key: "dentition", label: "Dentition", type: "select", options: ["Intact", "Poor", "Missing teeth"], normal: "Intact" },
      { key: "ulcers", label: "Ulcers", type: "select", options: YN, normal: "Absent" },
      { key: "tongue", label: "Tongue", type: "select", options: ["Midline, moist", "Coated", "Deviated"], normal: "Midline, moist" },
    ],
  },
  {
    key: "cvs", label: "Cardiovascular",
    normalComment: "S1 S2 heard, no murmurs, rubs, or gallops. Regular rate and rhythm. Peripheral pulses full and equal.",
    fields: [
      { key: "rhythm", label: "Rhythm", type: "select", options: ["Regular", "Irregular"], normal: "Regular" },
      { key: "heart_sounds", label: "Heart sounds", type: "select", options: ["S1 S2 normal", "Muffled", "Added sounds"], normal: "S1 S2 normal" },
      { key: "murmur", label: "Murmur", type: "select", options: YN, normal: "Absent" },
      { key: "murmur_grade", label: "Murmur grade", type: "select", options: ["I/VI", "II/VI", "III/VI", "IV/VI", "V/VI", "VI/VI"], revealsWhen: { field: "murmur", equals: "Present" } },
      { key: "murmur_timing", label: "Murmur timing", type: "select", options: ["Systolic", "Diastolic", "Continuous"], revealsWhen: { field: "murmur", equals: "Present" } },
      { key: "murmur_location", label: "Murmur location", type: "select", options: ["Aortic", "Pulmonic", "Tricuspid", "Mitral"], revealsWhen: { field: "murmur", equals: "Present" } },
      { key: "murmur_radiation", label: "Radiation", type: "text", revealsWhen: { field: "murmur", equals: "Present" } },
      { key: "peripheral_pulses", label: "Peripheral pulses", type: "select", options: ["Full and equal", "Diminished", "Absent"], normal: "Full and equal" },
      { key: "edema", label: "Peripheral oedema", type: "select", options: YN, normal: "Absent" },
    ],
  },
  {
    key: "respiratory", label: "Respiratory",
    normalComment: "Chest symmetric, resonant, vesicular breath sounds bilaterally, no added sounds.",
    fields: [
      { key: "chest_shape", label: "Chest shape", type: "select", options: ["Symmetric", "Barrel", "Kyphotic"], normal: "Symmetric" },
      { key: "air_entry", label: "Air entry", type: "select", options: ["Equal bilaterally", "Reduced left", "Reduced right"], normal: "Equal bilaterally" },
      { key: "percussion", label: "Percussion", type: "select", options: ["Resonant", "Dull", "Hyper-resonant"], normal: "Resonant" },
      { key: "breath_sounds", label: "Breath sounds", type: "select", options: ["Vesicular", "Bronchial", "Diminished"], normal: "Vesicular" },
      { key: "added_sounds", label: "Added breath sounds", type: "select", options: YN, normal: "Absent" },
      { key: "crackles", label: "Crackles", type: "select", options: ["None", "Fine", "Coarse"], revealsWhen: { field: "added_sounds", equals: "Present" } },
      { key: "wheeze", label: "Wheeze", type: "select", options: ["None", "Expiratory", "Inspiratory", "Both"], revealsWhen: { field: "added_sounds", equals: "Present" } },
      { key: "rhonchi", label: "Rhonchi", type: "select", options: ["None", "Present"], revealsWhen: { field: "added_sounds", equals: "Present" } },
      { key: "stridor", label: "Stridor", type: "select", options: ["None", "Inspiratory", "Biphasic"], revealsWhen: { field: "added_sounds", equals: "Present" } },
    ],
  },
  {
    key: "gi", label: "Gastrointestinal",
    normalComment: "Abdomen soft, non-tender, no organomegaly, bowel sounds present.",
    fields: [
      { key: "inspection", label: "Inspection", type: "select", options: ["Flat", "Distended", "Scaphoid", "Scars"], normal: "Flat" },
      { key: "tenderness", label: "Tenderness", type: "select", options: YN, normal: "Absent" },
      { key: "tenderness_site", label: "Tenderness site", type: "select", options: ["RUQ", "LUQ", "RLQ", "LLQ", "Epigastric", "Suprapubic", "Diffuse"], revealsWhen: { field: "tenderness", equals: "Present" } },
      { key: "organomegaly", label: "Organomegaly", type: "select", options: ["None", "Hepatomegaly", "Splenomegaly", "Both"], normal: "None" },
      { key: "bowel_sounds", label: "Bowel sounds", type: "select", options: ["Present", "Hyperactive", "Hypoactive", "Absent"], normal: "Present" },
      { key: "guarding", label: "Guarding / rigidity", type: "select", options: YN, normal: "Absent" },
    ],
  },
  {
    key: "gu", label: "Genitourinary",
    normalComment: "No suprapubic or costovertebral angle tenderness. External genitalia normal.",
    fields: [
      { key: "cva_tenderness", label: "CVA tenderness", type: "select", options: YN, normal: "Absent" },
      { key: "suprapubic", label: "Suprapubic tenderness", type: "select", options: YN, normal: "Absent" },
      { key: "genitalia", label: "External genitalia", type: "select", options: ["Normal", "Abnormal"], normal: "Normal" },
      { key: "discharge", label: "Discharge", type: "select", options: YN, normal: "Absent" },
    ],
  },
  {
    key: "msk", label: "Musculoskeletal",
    normalComment: "Full range of motion, no joint swelling, tenderness, or deformity. Normal gait.",
    fields: [
      { key: "rom", label: "Range of motion", type: "select", options: ["Full", "Limited"], normal: "Full" },
      { key: "swelling", label: "Joint swelling", type: "select", options: YN, normal: "Absent" },
      { key: "deformity", label: "Deformity", type: "select", options: YN, normal: "Absent" },
      { key: "gait", label: "Gait", type: "select", options: ["Normal", "Antalgic", "Ataxic", "Waddling"], normal: "Normal" },
    ],
  },
  {
    key: "cns", label: "Neurological (CNS)",
    normalComment: "GCS 15/15. Cranial nerves intact. Power 5/5 all limbs. Reflexes 2+ symmetric. Sensation intact. No cerebellar signs.",
    fields: [
      { key: "gcs", label: "GCS", type: "select", options: ["15/15","14/15","13/15","≤12/15"], normal: "15/15" },
      { key: "cn", label: "Cranial nerves", type: "select", options: ["Intact", "Deficit"], normal: "Intact" },
      { key: "power", label: "Motor power", type: "select", options: ["5/5 all limbs", "Weakness present"], normal: "5/5 all limbs" },
      { key: "reflexes", label: "Reflexes", type: "select", options: ["2+ symmetric", "Hyper-reflexia", "Hypo-reflexia"], normal: "2+ symmetric" },
      { key: "sensation", label: "Sensation", type: "select", options: ["Intact", "Reduced", "Absent"], normal: "Intact" },
      { key: "cerebellar", label: "Cerebellar signs", type: "select", options: YN, normal: "Absent" },
      { key: "meningismus", label: "Meningismus", type: "select", options: YN, normal: "Absent" },
    ],
  },
  {
    key: "skin", label: "Skin",
    normalComment: "Warm, dry, intact. No rashes, lesions, or pallor.",
    fields: [
      { key: "colour", label: "Colour", type: "select", options: ["Normal", "Pale", "Jaundiced", "Cyanosed"], normal: "Normal" },
      { key: "turgor", label: "Turgor", type: "select", options: ["Normal", "Reduced"], normal: "Normal" },
      { key: "rash", label: "Rash", type: "select", options: YN, normal: "Absent" },
      { key: "lesions", label: "Lesions / wounds", type: "text" },
    ],
  },
  {
    key: "endocrine", label: "Endocrine",
    normalComment: "No goitre, no signs of thyroid dysfunction. No features of Cushing's or acromegaly.",
    fields: [
      { key: "goitre", label: "Goitre", type: "select", options: YN, normal: "Absent" },
      { key: "thyroid_status", label: "Thyroid status", type: "select", options: ["Euthyroid clinically", "Hyperthyroid features", "Hypothyroid features"], normal: "Euthyroid clinically" },
    ],
  },
  {
    key: "lymphatic", label: "Lymphatic",
    normalComment: "No lymphadenopathy in cervical, axillary, or inguinal chains.",
    fields: [
      { key: "cervical", label: "Cervical", type: "select", options: YN, normal: "Absent" },
      { key: "axillary", label: "Axillary", type: "select", options: YN, normal: "Absent" },
      { key: "inguinal", label: "Inguinal", type: "select", options: YN, normal: "Absent" },
    ],
  },
  {
    key: "psych", label: "Psychiatric / Mental Status",
    normalComment: "Cooperative, appropriate affect, thought coherent, no suicidal ideation.",
    fields: [
      { key: "mood", label: "Mood", type: "select", options: ["Euthymic", "Depressed", "Anxious", "Elevated"], normal: "Euthymic" },
      { key: "affect", label: "Affect", type: "select", options: ["Appropriate", "Flat", "Labile"], normal: "Appropriate" },
      { key: "thought", label: "Thought process", type: "select", options: ["Coherent", "Tangential", "Disorganised"], normal: "Coherent" },
      { key: "si", label: "Suicidal ideation", type: "select", options: YN, normal: "Absent" },
    ],
  },
  {
    key: "obgyn", label: "Obstetrics & Gynaecology",
    showIf: (c) => !!c.isFemale,
    normalComment: "Abdomen non-tender. No vaginal bleeding. LMP within normal.",
    fields: [
      { key: "lmp", label: "LMP", type: "text" },
      { key: "gravidity", label: "Gravidity / Parity", type: "text" },
      { key: "pregnant", label: "Currently pregnant", type: "select", options: ["No", "Yes", "Unknown"], normal: "No" },
      { key: "gestation", label: "Gestation (weeks)", type: "text", revealsWhen: { field: "pregnant", equals: "Yes" } },
      { key: "fetal_hr", label: "Fetal heart rate (bpm)", type: "text", revealsWhen: { field: "pregnant", equals: "Yes" } },
      { key: "bleeding", label: "Vaginal bleeding", type: "select", options: YN, normal: "Absent" },
    ],
  },
  {
    key: "paeds", label: "Paediatrics",
    showIf: (c) => !!c.isPediatric,
    normalComment: "Active, feeding well, no fever, immunisations up to date.",
    fields: [
      { key: "activity", label: "Activity level", type: "select", options: ["Active", "Lethargic"], normal: "Active" },
      { key: "feeding", label: "Feeding", type: "select", options: ["Good", "Poor"], normal: "Good" },
      { key: "fontanelle", label: "Anterior fontanelle", type: "select", options: ["Flat", "Sunken", "Bulging", "Closed"], normal: "Flat" },
      { key: "immunisations", label: "Immunisations", type: "select", options: ["Up to date", "Delayed", "Unknown"], normal: "Up to date" },
      { key: "milestones", label: "Developmental milestones", type: "select", options: ["Age-appropriate", "Delayed"], normal: "Age-appropriate" },
    ],
  },
];

type ExamState = Record<string, { normal?: boolean; comment?: string; fields?: Record<string, string> }>;

export function SystemsExamination({
  value, onSave, disabled, ctx,
}: {
  value: unknown | null;
  onSave: (v: ExamState) => void;
  disabled?: boolean;
  ctx?: ExamCtx;
}) {
  const initial = useMemo<ExamState>(() => (value && typeof value === "object" ? (value as ExamState) : {}), [value]);
  const [state, setState] = useState<ExamState>(initial);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  useEffect(() => setState(initial), [initial]);

  const visibleSystems = SYSTEMS.filter((s) => !s.showIf || s.showIf(ctx ?? {}));

  const dirty = JSON.stringify(state) !== JSON.stringify(initial);

  function update(sysKey: string, patch: Partial<ExamState[string]>) {
    setState((s) => ({ ...s, [sysKey]: { ...s[sysKey], ...patch } }));
  }
  function updateField(sysKey: string, fieldKey: string, val: string) {
    setState((s) => ({
      ...s,
      [sysKey]: {
        ...s[sysKey],
        fields: { ...(s[sysKey]?.fields ?? {}), [fieldKey]: val },
      },
    }));
  }
  function markNormal(sys: SystemDef) {
    const fields: Record<string, string> = {};
    sys.fields.forEach((f) => { if (f.normal && !f.revealsWhen) fields[f.key] = f.normal; });
    setState((s) => ({ ...s, [sys.key]: { normal: true, comment: sys.normalComment, fields } }));
    setOpen((o) => ({ ...o, [sys.key]: true }));
  }
  function markAllNormal() {
    const next: ExamState = {};
    visibleSystems.forEach((sys) => {
      const fields: Record<string, string> = {};
      sys.fields.forEach((f) => { if (f.normal && !f.revealsWhen) fields[f.key] = f.normal; });
      next[sys.key] = { normal: true, comment: sys.normalComment, fields };
    });
    setState(next);
  }
  function toggle(k: string) { setOpen((o) => ({ ...o, [k]: !o[k] })); }

  const filled = visibleSystems.filter((s) => state[s.key]?.normal || state[s.key]?.comment || Object.keys(state[s.key]?.fields ?? {}).length).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Stethoscope className="h-4 w-4 text-primary" /> Systems examination
          <Badge variant="outline">{filled}/{visibleSystems.length} documented</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={markAllNormal} disabled={disabled}>
            <Sparkles className="h-3.5 w-3.5" /> Mark all normal
          </Button>
          <Button size="sm" onClick={() => onSave(state)} disabled={disabled || !dirty}>
            <Save className="h-3.5 w-3.5" /> Save examination
          </Button>
        </div>
      </div>

      <div className="divide-y rounded-md border">
        {visibleSystems.map((sys) => {
          const s = state[sys.key] ?? {};
          const isOpen = !!open[sys.key];
          const documented = s.normal || s.comment || Object.keys(s.fields ?? {}).length > 0;
          return (
            <div key={sys.key}>
              <button
                type="button"
                onClick={() => toggle(sys.key)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent/40"
              >
                <span className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span className="font-medium">{sys.label}</span>
                  {s.normal && <Badge className="bg-emerald-500/15 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />Normal</Badge>}
                  {!s.normal && documented && <Badge variant="secondary">Findings</Badge>}
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3 border-t bg-muted/20 px-3 py-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => markNormal(sys)} disabled={disabled}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark entire system as normal
                    </Button>
                    {s.normal && (
                      <Button size="sm" variant="ghost" onClick={() => update(sys.key, { normal: false })} disabled={disabled}>
                        Undo normal
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {sys.fields.map((f) => {
                      if (f.revealsWhen) {
                        const trigger = s.fields?.[f.revealsWhen.field];
                        if (trigger !== f.revealsWhen.equals) return null;
                      }
                      const val = s.fields?.[f.key] ?? "";
                      return (
                        <div key={f.key} className="space-y-1">
                          <Label className="text-xs">{f.label}</Label>
                          {f.type === "select" ? (
                            <Select value={val || undefined} onValueChange={(v) => updateField(sys.key, f.key, v)} disabled={disabled}>
                              <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                {f.options?.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : f.type === "textarea" ? (
                            <Textarea rows={2} value={val} onChange={(e) => updateField(sys.key, f.key, e.target.value)} disabled={disabled} />
                          ) : (
                            <Input value={val} onChange={(e) => updateField(sys.key, f.key, e.target.value)} disabled={disabled} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div>
                    <Label className="text-xs">Narrative comment</Label>
                    <Textarea
                      rows={2}
                      value={s.comment ?? ""}
                      onChange={(e) => update(sys.key, { comment: e.target.value })}
                      placeholder="Add any additional findings or context…"
                      disabled={disabled}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

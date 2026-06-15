import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Patient {
  id: string; full_name: string; date_of_birth: string | null; gender: string | null;
  allergies: string | null; chronic_conditions: string | null;
}
interface Visit { id: string; reason: string | null; opened_at: string; current_stage: string | null }
interface Vital {
  id: string; captured_at: string; systolic_bp: number | null; diastolic_bp: number | null;
  heart_rate: number | null; temperature_c: number | null; oxygen_saturation: number | null;
}
interface Dx { id: string; icd_code: string | null; description: string | null; is_primary: boolean | null }
interface Intake { reason_for_visit: string | null; allergies: string | null; conditions: string | null }
interface LabResult { id: string; result_value: string | null; units: string | null; abnormal_flag: string | null; performed_at: string | null }

function ageFrom(dob: string | null) {
  if (!dob) return "—";
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return `${Math.floor(diff / (365.25 * 24 * 3600 * 1000))}y`;
}

export function PatientContext({ patientId, visitId }: { patientId: string; visitId?: string | null }) {
  const [open, setOpen] = useState(false);

  const enabled = open && !!patientId;

  const patient = useQuery({
    queryKey: ["pctx-patient", patientId], enabled,
    queryFn: async () => {
      const { data } = await supabase.from("patients" as never)
        .select("id, full_name, date_of_birth, gender, allergies, chronic_conditions")
        .eq("id", patientId).maybeSingle();
      return (data as unknown as Patient | null) ?? null;
    },
  });
  const visit = useQuery({
    queryKey: ["pctx-visit", visitId], enabled: enabled && !!visitId,
    queryFn: async () => {
      const { data } = await supabase.from("visits" as never)
        .select("id, reason, opened_at, current_stage").eq("id", visitId!).maybeSingle();
      return (data as unknown as Visit | null) ?? null;
    },
  });
  const vitals = useQuery({
    queryKey: ["pctx-vitals", visitId, patientId], enabled,
    queryFn: async () => {
      let q = supabase.from("vitals" as never)
        .select("id, captured_at, systolic_bp, diastolic_bp, heart_rate, temperature_c, oxygen_saturation")
        .order("captured_at", { ascending: false }).limit(1);
      q = visitId ? q.eq("visit_id", visitId) : q.eq("patient_id", patientId);
      const { data } = await q;
      return ((data as unknown as Vital[]) ?? [])[0] ?? null;
    },
  });
  const dx = useQuery({
    queryKey: ["pctx-dx", visitId], enabled: enabled && !!visitId,
    queryFn: async () => {
      const { data } = await supabase.from("visit_diagnoses" as never)
        .select("id, icd_code, description, is_primary").eq("visit_id", visitId!);
      return (data as unknown as Dx[]) ?? [];
    },
  });
  const intake = useQuery({
    queryKey: ["pctx-intake", visitId, patientId], enabled,
    queryFn: async () => {
      let q = supabase.from("intake_forms" as never)
        .select("reason_for_visit, allergies, conditions")
        .order("created_at", { ascending: false }).limit(1);
      q = visitId ? q.eq("visit_id", visitId) : q.eq("patient_id", patientId);
      const { data } = await q;
      return ((data as unknown as Intake[]) ?? [])[0] ?? null;
    },
  });
  const recentLabs = useQuery({
    queryKey: ["pctx-labs", patientId], enabled,
    queryFn: async () => {
      const { data: orders } = await supabase.from("lab_orders" as never)
        .select("id").eq("patient_id", patientId).order("created_at", { ascending: false }).limit(10);
      const ids = ((orders as unknown as { id: string }[]) ?? []).map((o) => o.id);
      if (!ids.length) return [];
      const { data } = await supabase.from("lab_results" as never)
        .select("id, result_value, units, abnormal_flag, performed_at")
        .in("order_id", ids as never).order("performed_at", { ascending: false }).limit(5);
      return (data as unknown as LabResult[]) ?? [];
    },
  });

  const allergies = patient.data?.allergies || intake.data?.allergies;
  const conditions = patient.data?.chronic_conditions || intake.data?.conditions;
  const complaint = visit.data?.reason || intake.data?.reason_for_visit;
  const primaryDx = dx.data?.find((d) => d.is_primary) ?? dx.data?.[0];

  return (
    <div className="mt-2 rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <User className="h-3 w-3" /> Patient context
      </button>
      {open && (
        <div className="grid gap-2 border-t p-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <Block label="Demographics">
            {patient.isLoading ? "…" : (
              <>
                <div>{patient.data?.full_name}</div>
                <div className="text-muted-foreground">{ageFrom(patient.data?.date_of_birth ?? null)} · {patient.data?.gender ?? "—"}</div>
              </>
            )}
          </Block>
          <Block label="Allergies" tone={allergies ? "warn" : undefined}>
            {allergies || <span className="text-muted-foreground">None recorded</span>}
          </Block>
          <Block label="Active conditions">
            {conditions || <span className="text-muted-foreground">None recorded</span>}
          </Block>
          <Block label="Chief complaint">
            {complaint || <span className="text-muted-foreground">—</span>}
          </Block>
          <Block label="Working diagnosis">
            {primaryDx ? (
              <>
                <div className="font-mono">{primaryDx.icd_code}</div>
                <div>{primaryDx.description}</div>
              </>
            ) : <span className="text-muted-foreground">—</span>}
          </Block>
          <Block label="Latest vitals">
            {vitals.data ? (
              <div className="space-y-0.5">
                <div>BP {vitals.data.systolic_bp ?? "—"}/{vitals.data.diastolic_bp ?? "—"} · HR {vitals.data.heart_rate ?? "—"}</div>
                <div>SpO₂ {vitals.data.oxygen_saturation ?? "—"}% · T {vitals.data.temperature_c ?? "—"}°C</div>
                <div className="text-muted-foreground">{new Date(vitals.data.captured_at).toLocaleString()}</div>
              </div>
            ) : <span className="text-muted-foreground">No vitals on file</span>}
          </Block>
          {recentLabs.data && recentLabs.data.length > 0 && (
            <Block label="Recent lab results" wide>
              <ul className="space-y-0.5">
                {recentLabs.data.map((r) => (
                  <li key={r.id}>
                    {r.result_value} {r.units} {r.abnormal_flag && <span className="text-destructive font-semibold">{r.abnormal_flag}</span>}
                    <span className="ml-1 text-muted-foreground">{r.performed_at ? new Date(r.performed_at).toLocaleDateString() : ""}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ label, children, tone, wide }: { label: string; children: React.ReactNode; tone?: "warn"; wide?: boolean }) {
  return (
    <div className={`rounded border bg-background p-2 ${wide ? "sm:col-span-2 lg:col-span-3" : ""} ${tone === "warn" ? "border-amber-500/40" : ""}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

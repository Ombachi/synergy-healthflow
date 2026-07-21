import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, User, Clock, Stethoscope, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { RoleGate } from "@/components/role-gate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/my-inpatients")({
  component: () => (
    <RoleGate path="/my-inpatients">
      <MyInpatientsPage />
    </RoleGate>
  ),
});

interface AdmissionRow {
  id: string;
  patient_id: string;
  visit_id: string | null;
  bed_id: string | null;
  admitted_at: string;
  discharged_at: string | null;
  status: string;
  acuity: string | null;
  primary_diagnosis: string | null;
  admission_reason: string | null;
  admitting_consultant: string | null;
  isolation_required: boolean | null;
  expected_discharge_date: string | null;
}
interface Patient { id: string; full_name: string; medical_record_number: string | null }
interface Bed { id: string; code: string; ward_id: string }
interface Ward { id: string; name: string; code: string | null }

function daysBetween(fromISO: string, toISO?: string | null) {
  const from = new Date(fromISO).getTime();
  const to = toISO ? new Date(toISO).getTime() : Date.now();
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

function MyInpatientsPage() {
  const { user, hasAnyRole } = useAuth();
  const isDoctor = hasAnyRole(["doctor"]);

  const admissions = useQuery({
    queryKey: ["my-inpatients", user?.id, isDoctor],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("admissions" as never)
        .select("id, patient_id, visit_id, bed_id, admitted_at, discharged_at, status, acuity, primary_diagnosis, admission_reason, admitting_consultant, isolation_required, expected_discharge_date")
        .is("discharged_at", null)
        .order("admitted_at", { ascending: false });
      // Doctors see only their own inpatients by default; admins/nurses see all.
      if (isDoctor && !hasAnyRole(["admin", "nurse"])) {
        q = q.eq("admitting_consultant", user!.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as AdmissionRow[]) ?? [];
    },
  });

  const patientIds = admissions.data?.map((a) => a.patient_id) ?? [];
  const bedIds = admissions.data?.map((a) => a.bed_id).filter(Boolean) as string[];

  const patients = useQuery({
    queryKey: ["my-inpatients-patients", patientIds.join(",")],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name, medical_record_number")
        .in("id", patientIds as never);
      if (error) throw error;
      return (data as unknown as Patient[]) ?? [];
    },
  });

  const beds = useQuery({
    queryKey: ["my-inpatients-beds", bedIds.join(",")],
    enabled: bedIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beds" as never)
        .select("id, code, ward_id")
        .in("id", bedIds as never);
      if (error) throw error;
      return (data as unknown as Bed[]) ?? [];
    },
  });

  const wardIds = [...new Set((beds.data ?? []).map((b) => b.ward_id))];
  const wards = useQuery({
    queryKey: ["my-inpatients-wards", wardIds.join(",")],
    enabled: wardIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wards" as never)
        .select("id, name, code")
        .in("id", wardIds as never);
      if (error) throw error;
      return (data as unknown as Ward[]) ?? [];
    },
  });

  const grouped = useMemo(() => {
    const pMap = new Map((patients.data ?? []).map((p) => [p.id, p]));
    const bMap = new Map((beds.data ?? []).map((b) => [b.id, b]));
    const wMap = new Map((wards.data ?? []).map((w) => [w.id, w]));

    const buckets = new Map<string, { ward: Ward | null; rows: (AdmissionRow & { patient?: Patient; bed?: Bed })[] }>();
    (admissions.data ?? []).forEach((a) => {
      const bed = a.bed_id ? bMap.get(a.bed_id) : undefined;
      const ward = bed ? wMap.get(bed.ward_id) ?? null : null;
      const key = ward?.id ?? "__unassigned";
      if (!buckets.has(key)) buckets.set(key, { ward, rows: [] });
      buckets.get(key)!.rows.push({ ...a, patient: pMap.get(a.patient_id), bed });
    });
    return Array.from(buckets.values()).sort((a, b) =>
      (a.ward?.name ?? "zz").localeCompare(b.ward?.name ?? "zz"),
    );
  }, [admissions.data, patients.data, beds.data, wards.data]);

  const acuityBadge = (a: string | null) => {
    if (!a) return null;
    const cls =
      a === "critical" ? "bg-destructive text-destructive-foreground" :
      a === "high" ? "bg-amber-500 text-white" :
      "bg-muted";
    return <Badge className={cls}>{a}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BedDouble className="h-6 w-6 text-primary" /> My inpatients
        </h1>
        <p className="text-sm text-muted-foreground">
          Active inpatient encounters {isDoctor && !hasAnyRole(["admin", "nurse"]) ? "assigned to you " : ""}grouped by ward. Click any patient to open the inpatient workspace.
        </p>
      </div>

      {admissions.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {admissions.data?.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No active inpatients {isDoctor && !hasAnyRole(["admin", "nurse"]) ? "under your care" : ""} right now.
          </CardContent>
        </Card>
      )}

      {grouped.map(({ ward, rows }) => (
        <Card key={ward?.id ?? "unassigned"}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>
                {ward ? `${ward.name}${ward.code ? ` · ${ward.code}` : ""}` : "Unassigned bed"}
              </span>
              <Badge variant="outline">{rows.length} patient{rows.length === 1 ? "" : "s"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {rows.map((r) => {
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {r.patient?.full_name ?? r.patient_id.slice(0, 8)}
                        {r.patient?.medical_record_number && (
                          <span className="text-xs text-muted-foreground">· {r.patient.medical_record_number}</span>
                        )}
                        {acuityBadge(r.acuity)}
                        {r.isolation_required && (
                          <Badge className="bg-purple-600"><AlertTriangle className="mr-1 h-3 w-3" />Isolation</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {r.bed && <span>Bed {r.bed.code}</span>}
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> LOS {daysBetween(r.admitted_at)}d
                        </span>
                        <span>Admitted {new Date(r.admitted_at).toLocaleDateString()}</span>
                        {r.primary_diagnosis && (
                          <span className="inline-flex items-center gap-1">
                            <Stethoscope className="h-3 w-3" /> {r.primary_diagnosis}
                          </span>
                        )}
                        {r.expected_discharge_date && (
                          <span>Est. discharge {new Date(r.expected_discharge_date).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" disabled={!r.visit_id}>
                      Open chart →
                    </Button>
                  </>
                );
                return r.visit_id ? (
                  <Link
                    key={r.id}
                    to="/visits/$visitId"
                    params={{ visitId: r.visit_id }}
                    className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-accent/40"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm opacity-60">
                    {inner}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

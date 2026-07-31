import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Syringe, Printer, Download, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { exportVaccinationCardPDF } from "@/lib/vaccination-card-pdf";

export const Route = createFileRoute("/_authenticated/my-vaccines")({
  component: MyVaccines,
  head: () => ({
    meta: [
      { title: "My Vaccines · Litu Vault" },
      { name: "description", content: "Your lifelong immunization record and digital vaccination card." },
      { property: "og:title", content: "My Vaccines · Litu Vault" },
      { property: "og:description", content: "Your lifelong immunization record and digital vaccination card." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Patient { id: string; full_name: string; medical_record_number: string | null; date_of_birth: string | null; gender: string | null }
interface Dose {
  id: string; patient_id: string; vaccine_name: string; antigen: string | null; dose_number: number;
  route: string | null; site: string | null; administered_at: string; batch_number: string | null;
  expiry_date: string | null; manufacturer: string | null; vaccinator_name: string | null;
  facility: string | null; immediate_reaction: string | null; comments: string | null;
}

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB") : "—");

function MyVaccines() {
  const { user } = useAuth();

  const patient = useQuery({
    queryKey: ["myvax-patient", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("patients" as never)
        .select("id, full_name, medical_record_number, date_of_birth, gender")
        .eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data as unknown as Patient | null;
    },
  });
  const pid = patient.data?.id;

  const doses = useQuery({
    queryKey: ["myvax-doses", pid], enabled: !!pid,
    queryFn: async () => {
      const { data, error } = await supabase.from("immunizations" as never)
        .select("*").eq("patient_id", pid!).order("administered_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Dose[]) ?? [];
    },
  });

  const rows = doses.data ?? [];

  async function card() {
    if (!patient.data) return;
    await exportVaccinationCardPDF(patient.data, rows);
    toast.success("Digital vaccination card generated");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Syringe className="h-6 w-6 text-primary" /> My vaccines
          </h1>
          <p className="text-sm text-muted-foreground">Your lifelong immunization history and digital vaccination card.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!patient.data} onClick={card}>
            <Printer className="h-4 w-4" /> Print card
          </Button>
          <Button size="sm" disabled={!patient.data} onClick={card}>
            <Download className="h-4 w-4" /> Download report
          </Button>
        </div>
      </div>

      {!patient.data && !patient.isLoading && (
        <p className="text-sm text-muted-foreground">No patient record is linked to your account yet.</p>
      )}

      {patient.data && (
        <div className="rounded-lg border bg-card p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-muted-foreground">Patient</div><div className="font-medium">{patient.data.full_name}</div></div>
            <div><div className="text-xs text-muted-foreground">MRN</div><div className="font-mono">{patient.data.medical_record_number ?? "—"}</div></div>
            <div><div className="text-xs text-muted-foreground">Date of birth</div><div>{d(patient.data.date_of_birth)}</div></div>
            <div><div className="text-xs text-muted-foreground">Doses recorded</div><div>{rows.length}</div></div>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-2 border-b p-3 text-sm font-medium">
          <CalendarClock className="h-4 w-4 text-primary" /> Immunization timeline
        </div>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No vaccinations recorded yet.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{r.vaccine_name} <span className="text-muted-foreground">· dose {r.dose_number}</span></div>
                  <div className="text-xs text-muted-foreground">{d(r.administered_at)}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[r.antigen, r.route, r.site, r.batch_number ? `Batch ${r.batch_number}` : null, r.manufacturer, r.vaccinator_name, r.facility]
                    .filter(Boolean).join(" · ") || "—"}
                </div>
                {r.immediate_reaction && (
                  <div className="mt-1 text-xs text-amber-700">Reaction: {r.immediate_reaction}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

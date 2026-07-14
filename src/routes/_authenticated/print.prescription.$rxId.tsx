import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Printer, Heart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderQR } from "@/lib/print-codes";
import { SignRecord } from "@/components/sign-record";

export const Route = createFileRoute("/_authenticated/print/prescription/$rxId")({
  component: RxPrint,
});

interface Rx {
  id: string;
  visit_id: string;
  medication: string;
  dose: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  created_by: string | null;
  created_at: string;
}

function RxPrint() {
  const { rxId } = Route.useParams();
  const qrRef = useRef<HTMLCanvasElement>(null);

  const rx = useQuery({
    queryKey: ["print-rx", rxId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prescriptions" as never)
        .select("id, visit_id, medication, dose, frequency, duration, instructions, created_by, created_at")
        .eq("id", rxId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Rx) ?? null;
    },
  });

  const visit = useQuery({
    queryKey: ["print-rx-visit", rx.data?.visit_id],
    enabled: !!rx.data?.visit_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("visits" as never)
        .select("id, patient_id")
        .eq("id", rx.data!.visit_id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; patient_id: string } | null;
    },
  });

  const patient = useQuery({
    queryKey: ["print-rx-patient", visit.data?.patient_id],
    enabled: !!visit.data?.patient_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name, medical_record_number, date_of_birth, sex")
        .eq("id", visit.data!.patient_id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as {
        id: string;
        full_name: string;
        medical_record_number: string | null;
        date_of_birth: string | null;
        sex: string | null;
      } | null;
    },
  });

  useEffect(() => {
    if (rx.data) {
      const verifyUrl = `${window.location.origin}/verify/rx/${rx.data.id}`;
      void renderQR(qrRef.current, verifyUrl, 140);
    }
  }, [rx.data]);

  if (!rx.data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Prescription</h1>
        <div className="flex gap-2">
          <SignRecord
            entityType="prescription"
            entityId={rx.data.id}
            payload={`${rx.data.medication}|${rx.data.dose}|${rx.data.frequency}`}
          />
          <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button>
        </div>
      </div>

      <div className="rounded-lg border-2 border-black bg-white p-8 text-black">
        {/* Letterhead */}
        <div className="flex items-center justify-between border-b-2 border-black pb-3">
          <div className="flex items-center gap-3">
            <Heart className="h-10 w-10" />
            <div>
              <div className="text-xl font-bold tracking-tight">VITALIS / LITUCARE HOSPITAL</div>
              <div className="text-[11px]">Nairobi, Kenya • Tel: +254 700 000 000 • care@vitalis.co.ke</div>
            </div>
          </div>
          <div className="text-right text-[11px]">
            <div>Rx #{rx.data.id.slice(0, 8).toUpperCase()}</div>
            <div>{new Date(rx.data.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Patient block */}
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[10px] uppercase text-gray-600">Patient</div>
            <div className="font-semibold">{patient.data?.full_name ?? "—"}</div>
            <div className="text-xs">MRN: {patient.data?.medical_record_number ?? "—"}</div>
            <div className="text-xs">DOB: {patient.data?.date_of_birth ?? "—"} • Sex: {patient.data?.sex ?? "—"}</div>
          </div>
          <div className="text-right">
            <canvas ref={qrRef} className="ml-auto" />
            <div className="mt-1 text-[9px] text-gray-600">Scan to verify authenticity</div>
          </div>
        </div>

        {/* Rx block */}
        <div className="mt-6">
          <div className="text-3xl font-serif italic">℞</div>
          <div className="mt-2 rounded border border-black/20 p-4">
            <div className="text-lg font-semibold">{rx.data.medication}</div>
            <div className="mt-1 text-sm">
              <b>Dosage:</b> {rx.data.dosage ?? "—"} &nbsp;•&nbsp;
              <b>Frequency:</b> {rx.data.frequency ?? "—"} &nbsp;•&nbsp;
              <b>Duration:</b> {rx.data.duration ?? "—"}
            </div>
            {rx.data.instructions && (
              <div className="mt-2 text-sm">
                <b>Instructions:</b> {rx.data.instructions}
              </div>
            )}
          </div>
        </div>

        {/* Signature */}
        <div className="mt-10 flex items-end justify-between">
          <div>
            <div className="border-t border-black pt-1 text-xs">Prescriber signature</div>
            <div className="mt-1 text-[10px] text-gray-600">Prescriber ID: {rx.data.prescribed_by?.slice(0, 8) ?? "—"}</div>
          </div>
          <div className="text-right text-[10px] text-gray-600">
            <div>Verify at:</div>
            <Link to="/verify/rx/$rxId" params={{ rxId: rx.data.id }} className="underline">
              /verify/rx/{rx.data.id.slice(0, 8)}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

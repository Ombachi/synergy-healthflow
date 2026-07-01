import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderBarcode } from "@/lib/print-codes";

export const Route = createFileRoute("/_authenticated/print/wristband/$patientId")({
  component: WristbandPrint,
});

interface P {
  id: string;
  full_name: string;
  medical_record_number: string | null;
  date_of_birth: string | null;
  sex: string | null;
  phone: string | null;
}

function WristbandPrint() {
  const { patientId } = Route.useParams();
  const svgRef = useRef<SVGSVGElement>(null);

  const p = useQuery({
    queryKey: ["print-wristband", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients" as never)
        .select("id, full_name, medical_record_number, date_of_birth, sex, phone")
        .eq("id", patientId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as P) ?? null;
    },
  });

  useEffect(() => {
    if (p.data?.medical_record_number) renderBarcode(svgRef.current, p.data.medical_record_number);
  }, [p.data?.medical_record_number]);

  if (!p.data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Patient wristband</h1>
        <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button>
      </div>

      <div className="mx-auto w-[320px] rounded-lg border-2 border-black bg-white p-4 text-black print:border-black">
        <div className="text-xs font-semibold uppercase tracking-wide">Vitalis / LituCare</div>
        <div className="mt-1 text-lg font-bold leading-tight">{p.data.full_name}</div>
        <div className="mt-1 text-xs">
          MRN: <b>{p.data.medical_record_number ?? "—"}</b>
        </div>
        <div className="text-xs">
          DOB: {p.data.date_of_birth ?? "—"} • Sex: {p.data.sex ?? "—"}
        </div>
        <div className="mt-3 flex justify-center">
          <svg ref={svgRef} />
        </div>
      </div>
    </div>
  );
}

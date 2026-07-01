import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderBarcode } from "@/lib/print-codes";

export const Route = createFileRoute("/_authenticated/print/sample/$sampleId")({
  component: SamplePrint,
});

interface S {
  id: string;
  order_id: string;
  container_type: string | null;
  collected_at: string | null;
  patient_id: string | null;
  patient_name?: string;
}

function SamplePrint() {
  const { sampleId } = Route.useParams();
  const ref = useRef<SVGSVGElement>(null);

  const q = useQuery({
    queryKey: ["print-sample", sampleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lab_samples" as never)
        .select("id, order_id, container_type, collected_at")
        .eq("id", sampleId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as S) ?? null;
    },
  });

  useEffect(() => {
    if (q.data?.id) renderBarcode(ref.current, q.data.id.slice(0, 12), { height: 44, fontSize: 10 });
  }, [q.data?.id]);

  if (!q.data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Sample label</h1>
        <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button>
      </div>

      <div className="mx-auto w-[260px] rounded border-2 border-black bg-white p-2 text-black">
        <div className="text-[10px] font-semibold uppercase">Vitalis Lab</div>
        <div className="mt-0.5 text-xs">Sample {q.data.id.slice(0, 8)}</div>
        <div className="text-[10px]">Order {q.data.order_id.slice(0, 8)}</div>
        <div className="text-[10px]">Container: {q.data.container_type ?? "—"}</div>
        <div className="mt-1 flex justify-center"><svg ref={ref} /></div>
      </div>
    </div>
  );
}

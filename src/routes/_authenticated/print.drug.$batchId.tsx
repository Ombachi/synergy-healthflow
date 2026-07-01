import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderBarcode } from "@/lib/print-codes";

export const Route = createFileRoute("/_authenticated/print/drug/$batchId")({
  component: DrugPackPrint,
});

interface B {
  id: string;
  item_id: string;
  batch_no: string | null;
  expiry_date: string | null;
  qty_on_hand: number | null;
}

function DrugPackPrint() {
  const { batchId } = Route.useParams();
  const ref = useRef<SVGSVGElement>(null);

  const b = useQuery({
    queryKey: ["print-drug", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_batches" as never)
        .select("id, item_id, batch_no, expiry_date, qty_on_hand")
        .eq("id", batchId)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as B) ?? null;
    },
  });

  const item = useQuery({
    queryKey: ["print-drug-item", b.data?.item_id],
    enabled: !!b.data?.item_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items" as never)
        .select("id, name, unit")
        .eq("id", b.data!.item_id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; name: string; unit: string | null } | null;
    },
  });

  useEffect(() => {
    if (b.data?.batch_no) renderBarcode(ref.current, b.data.batch_no, { height: 44, fontSize: 10 });
  }, [b.data?.batch_no]);

  if (!b.data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold">Drug pack label</h1>
        <Button onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" /> Print</Button>
      </div>

      <div className="mx-auto w-[280px] rounded border-2 border-black bg-white p-3 text-black">
        <div className="text-[10px] font-semibold uppercase">Vitalis Pharmacy</div>
        <div className="mt-0.5 text-sm font-bold">{item.data?.name ?? "—"}</div>
        <div className="text-[11px]">Batch: <b>{b.data.batch_no ?? "—"}</b></div>
        <div className="text-[11px]">Expires: {b.data.expiry_date ?? "—"}</div>
        <div className="text-[11px]">Qty: {b.data.qty_on_hand ?? 0} {item.data?.unit ?? ""}</div>
        <div className="mt-2 flex justify-center"><svg ref={ref} /></div>
      </div>
    </div>
  );
}

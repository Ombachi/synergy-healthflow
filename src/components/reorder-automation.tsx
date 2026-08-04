import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, PackagePlus, RefreshCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pager, usePager } from "@/components/pager";

interface Suggestion {
  item_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  reorder_threshold: number;
  suggested_qty: number;
  supplier: string | null;
  unit_price_cents: number | null;
}

interface Supplier { id: string; name: string }

const money = (c: number) => `KES ${(c / 100).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;

/**
 * Reorder-level automation: everything at or below its reorder threshold,
 * with a suggested order quantity and a one-click draft purchase order.
 */
export function ReorderAutomation() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [supplierId, setSupplierId] = useState("");

  const suggestions = useQuery({
    queryKey: ["reorder-suggestions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("reorder_suggestions" as never);
      if (error) throw error;
      return (data as unknown as Suggestion[]) ?? [];
    },
  });

  const suppliers = useQuery({
    queryKey: ["reorder-suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers" as never).select("id, name").order("name");
      return (data as unknown as Supplier[]) ?? [];
    },
  });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (suggestions.data ?? []).filter(
      (r) => !q || r.name.toLowerCase().includes(q) || (r.sku ?? "").toLowerCase().includes(q) || (r.category ?? "").toLowerCase().includes(q),
    );
  }, [suggestions.data, search]);
  const pager = usePager(rows, 15);

  const selectedRows = (suggestions.data ?? []).filter((r) => selected[r.item_id]);
  const estTotal = selectedRows.reduce((s, r) => s + (r.unit_price_cents ?? 0) * (selected[r.item_id] ?? 0), 0);

  const createPO = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("Choose a supplier for the purchase order");
      if (!selectedRows.length) throw new Error("Select at least one item");
      const { data: po, error } = await supabase.from("purchase_orders" as never).insert({
        supplier_id: supplierId, status: "draft", notes: "Auto-generated from reorder levels",
        total_cents: estTotal,
      } as never).select("id").single();
      if (error) throw error;
      const poId = (po as unknown as { id: string }).id;
      const items = selectedRows.map((r) => ({
        po_id: poId, item_id: r.item_id, qty: selected[r.item_id] ?? r.suggested_qty,
        unit_cost_cents: r.unit_price_cents ?? 0,
      }));
      const { error: e2 } = await supabase.from("purchase_order_items" as never).insert(items as never);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Draft purchase order created");
      setSelected({});
      qc.invalidateQueries({ queryKey: ["reorder-suggestions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    const header = ["Item", "SKU", "Category", "On hand", "Reorder at", "Suggested qty", "Supplier", "Unit price"];
    const lines = rows.map((r) => [r.name, r.sku ?? "", r.category ?? "", r.quantity, r.reorder_threshold, r.suggested_qty, r.supplier ?? "", ((r.unit_price_cents ?? 0) / 100).toFixed(2)]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `reorder-list-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <PackagePlus className="h-4 w-4 text-primary" /> Reorder automation
          <span className="rounded bg-rose-500/10 px-2 py-0.5 text-xs text-rose-600">{(suggestions.data ?? []).length} at/below level</span>
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => suggestions.refetch()}><RefreshCcw className="mr-1 h-3.5 w-3.5" /> Refresh</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-3.5 w-3.5" /> CSV</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="max-w-xs" placeholder="Search item, SKU or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="h-9 rounded border bg-background px-2 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Supplier for PO…</option>
            {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Button size="sm" disabled={!selectedRows.length || createPO.isPending} onClick={() => createPO.mutate()}>
            Create draft PO ({selectedRows.length}) · {money(estTotal)}
          </Button>
        </div>

        <div className="overflow-hidden rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2 w-8"></th>
                <th className="p-2">Item</th>
                <th className="p-2">On hand</th>
                <th className="p-2">Reorder at</th>
                <th className="p-2">Order qty</th>
                <th className="p-2">Supplier</th>
              </tr>
            </thead>
            <tbody>
              {pager.slice.map((r) => (
                <tr key={r.item_id} className="border-t">
                  <td className="p-2">
                    <input type="checkbox" checked={!!selected[r.item_id]}
                      onChange={(e) => setSelected((s) => {
                        const next = { ...s };
                        if (e.target.checked) next[r.item_id] = r.suggested_qty; else delete next[r.item_id];
                        return next;
                      })} />
                  </td>
                  <td className="p-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.sku ?? "—"} · {r.category ?? "uncategorised"}</div>
                  </td>
                  <td className="p-2 font-semibold text-rose-600">{r.quantity}</td>
                  <td className="p-2 text-muted-foreground">{r.reorder_threshold}</td>
                  <td className="p-2">
                    <Input type="number" min={1} className="h-8 w-24"
                      value={selected[r.item_id] ?? r.suggested_qty}
                      onChange={(e) => setSelected((s) => ({ ...s, [r.item_id]: Number(e.target.value) }))} />
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">{r.supplier ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="p-4 text-sm text-muted-foreground">Nothing needs reordering right now.</td></tr>
              )}
            </tbody>
          </table>
          <Pager page={pager.page} pageCount={pager.pageCount} total={pager.total} pageSize={pager.pageSize} setPage={pager.setPage} label="items" />
        </div>
      </CardContent>
    </Card>
  );
}

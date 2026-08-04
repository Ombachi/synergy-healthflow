import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WorkflowChip } from "@/components/workflow-chip";

interface InvItem { id: string; name: string; quantity: number; category: string | null }
interface Req { id: string; department: string | null; status: string; notes: string | null; created_at: string; requester_id: string }
interface ReqItem { id: string; request_id: string; item_id: string; qty_requested: number; qty_approved: number | null; qty_issued: number | null }

// Reusable form used by /lab and /pharmacy to raise a stock request to central store.
export function StockRequestForm({ department, categoryHint }: { department: "lab" | "pharmacy" | "ward"; categoryHint?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<{ item_id: string; qty: number }[]>([{ item_id: "", qty: 1 }]);
  // Users can also request general hospital consumables (PPE, IV supplies,
  // wound care, stationery…) — flip this to widen the item picker beyond
  // the department-specific category hint.
  const [showAll, setShowAll] = useState(false);
  const [itemSearch, setItemSearch] = useState("");

  const items = useQuery({
    queryKey: ["sr-items", showAll ? "all" : (categoryHint ?? "all")],
    queryFn: async () => {
      let q = supabase.from("inventory_items" as never).select("id, name, quantity, category").order("name").limit(2000);
      if (!showAll && categoryHint) q = q.ilike("category", `%${categoryHint}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as InvItem[]) ?? [];
    },
  });

  const filteredItems = (items.data ?? []).filter((i) =>
    !itemSearch.trim() ? true : i.name.toLowerCase().includes(itemSearch.toLowerCase()),
  );


  const myRequests = useQuery({
    queryKey: ["sr-mine", department, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("stock_requests" as never)
        .select("*").eq("department", department).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data as unknown as Req[]) ?? [];
    },
  });

  const reqItems = useQuery({
    queryKey: ["sr-mine-items", (myRequests.data ?? []).map((r) => r.id).join(",")],
    enabled: (myRequests.data ?? []).length > 0,
    queryFn: async () => {
      const ids = (myRequests.data ?? []).map((r) => r.id);
      const { data, error } = await supabase.from("stock_request_items" as never).select("*").in("request_id", ids as never);
      if (error) throw error;
      return (data as unknown as ReqItem[]) ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const cleaned = lines.filter((l) => l.item_id && l.qty > 0);
      if (cleaned.length === 0) throw new Error("Add at least one item");
      const { data: req, error: e1 } = await supabase.from("stock_requests" as never)
        .insert({ requester_id: user!.id, department, status: "submitted", notes: notes || null } as never)
        .select().single();
      if (e1) throw e1;
      const reqId = (req as { id: string }).id;
      const { error: e2 } = await supabase.from("stock_request_items" as never)
        .insert(cleaned.map((l) => ({ request_id: reqId, item_id: l.item_id, qty_requested: l.qty })) as never);
      if (e2) throw e2;
    },
    onSuccess: () => {
      setOpen(false); setLines([{ item_id: "", qty: 1 }]); setNotes("");
      qc.invalidateQueries({ queryKey: ["sr-mine", department] });
      qc.invalidateQueries({ queryKey: ["sr-mine-items"] });
      toast.success("Stock request sent to central store");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const itemName = (id: string) => items.data?.find((i) => i.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <div>
          <div className="font-medium">Requests to central store</div>
          <div className="text-xs text-muted-foreground">Raise a request when {department === "lab" ? "reagents or consumables" : "medication or consumables"} run low.</div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-3 w-3" /> New request</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Request stock from central store</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2">
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                  Show all hospital items (PPE, IV supplies, wound care…)
                </label>
                <Input
                  className="ml-auto h-8 max-w-[220px] text-xs"
                  placeholder="Search items…"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                {lines.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select
                      className="col-span-8 rounded border bg-background px-2 py-1.5 text-sm"
                      value={l.item_id}
                      onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, item_id: e.target.value } : x))}
                    >
                      <option value="">Select item…</option>
                      {filteredItems.map((i) => <option key={i.id} value={i.id}>{i.name} (on hand {i.quantity}){i.category ? ` — ${i.category}` : ""}</option>)}
                    </select>
                    <Input
                      className="col-span-3"
                      type="number"
                      min={1}
                      value={l.qty}
                      onChange={(e) => setLines(lines.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) } : x))}
                    />
                    <Button
                      type="button" size="icon" variant="ghost" className="col-span-1"
                      onClick={() => setLines(lines.length > 1 ? lines.filter((_, i) => i !== idx) : lines)}
                    ><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setLines([...lines, { item_id: "", qty: 1 }])}>
                  <Plus className="h-3 w-3" /> Add line
                </Button>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Urgency, intended use, etc." />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => submit.mutate()} disabled={submit.isPending}>Submit request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="divide-y">
        {(myRequests.data ?? []).length === 0 && <div className="p-3 text-xs text-muted-foreground">No requests yet.</div>}
        {myRequests.data?.map((r) => {
          const ri = (reqItems.data ?? []).filter((x) => x.request_id === r.id);
          return (
            <div key={r.id} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("en-GB")}</div>
                <WorkflowChip status={r.status} />
              </div>
              <ul className="mt-1 text-xs text-muted-foreground">
                {ri.map((x) => (
                  <li key={x.id}>
                    {itemName(x.item_id)} — requested {x.qty_requested}
                    {x.qty_approved != null && <> · approved {x.qty_approved}</>}
                    {x.qty_issued != null && <> · issued {x.qty_issued}</>}
                  </li>
                ))}
              </ul>
              {r.notes && <div className="mt-1 text-xs italic text-muted-foreground">{r.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

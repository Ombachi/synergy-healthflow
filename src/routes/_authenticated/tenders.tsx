import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/tenders")({ component: TendersPage });

interface Tender { id: string; reference: string; title: string; description: string | null; status: string; budget_cents: number | null; closes_at: string; created_by: string }
interface Bid { id: string; tender_id: string; bidder_id: string; bidder_name: string; amount_cents: number; delivery_days: number | null; proposal: string | null; status: string; review_notes: string | null; created_at: string }

const money = (c: number | null) => `KES ${((c ?? 0) / 100).toLocaleString()}`;

function TendersPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const isProc = hasRole("admin") || hasRole("procurement");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "", budget: "", closes_at: "" });
  const [active, setActive] = useState<Tender | null>(null);
  const [bid, setBid] = useState({ bidder_name: "", bidder_email: "", bidder_phone: "", amount: "", delivery_days: "", proposal: "" });

  const tenders = useQuery({
    queryKey: ["tenders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenders" as never).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Tender[]) ?? [];
    },
  });

  const bids = useQuery({
    queryKey: ["bids", active?.id],
    enabled: !!active && isProc,
    queryFn: async () => {
      const { data, error } = await supabase.from("tender_bids" as never).select("*")
        .eq("tender_id", active!.id).order("amount_cents");
      if (error) throw error;
      return (data as unknown as Bid[]) ?? [];
    },
  });

  async function createTender() {
    if (!form.title || !form.closes_at) return toast.error("Title and closing date required");
    const { error } = await supabase.from("tenders" as never).insert({
      title: form.title, description: form.description, category: form.category || null,
      budget_cents: form.budget ? Math.round(parseFloat(form.budget) * 100) : null,
      closes_at: new Date(form.closes_at).toISOString(), created_by: user?.id, status: "open",
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Tender published"); setOpen(false);
    setForm({ title: "", description: "", category: "", budget: "", closes_at: "" });
    qc.invalidateQueries({ queryKey: ["tenders"] });
  }

  async function submitBid(t: Tender) {
    if (!bid.bidder_name || !bid.amount) return toast.error("Name and amount required");
    const { error } = await supabase.from("tender_bids" as never).insert({
      tender_id: t.id, bidder_id: user?.id,
      bidder_name: bid.bidder_name, bidder_email: bid.bidder_email || null, bidder_phone: bid.bidder_phone || null,
      amount_cents: Math.round(parseFloat(bid.amount) * 100),
      delivery_days: bid.delivery_days ? parseInt(bid.delivery_days) : null,
      proposal: bid.proposal || null,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Bid submitted");
    setBid({ bidder_name: "", bidder_email: "", bidder_phone: "", amount: "", delivery_days: "", proposal: "" });
    qc.invalidateQueries({ queryKey: ["tenders"] });
  }

  async function awardBid(b: Bid) {
    const { error } = await supabase.from("tender_bids" as never).update({ status: "awarded" } as never).eq("id", b.id);
    if (error) return toast.error(error.message);
    await supabase.from("tenders" as never).update({ status: "awarded", awarded_bid_id: b.id } as never).eq("id", b.tender_id);
    toast.success("Awarded");
    qc.invalidateQueries({ queryKey: ["tenders"] });
    qc.invalidateQueries({ queryKey: ["bids", b.tender_id] });
  }

  const open_tenders = (tenders.data ?? []).filter((t) => t.status === "open");
  const closed_tenders = (tenders.data ?? []).filter((t) => t.status !== "open");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tenders & bids</h1>
          <p className="text-sm text-muted-foreground">Bidders submit, procurement awards.</p>
        </div>
        {isProc && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button>Publish tender</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New tender</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                <div><Label>Budget (KES)</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
                <div><Label>Closes at</Label><Input type="datetime-local" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} /></div>
                <Button className="w-full" onClick={createTender}>Publish</Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Open ({open_tenders.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed/Awarded ({closed_tenders.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className="space-y-3">
          {open_tenders.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between">
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  <span className="text-xs text-muted-foreground">{t.reference}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {t.description && <p>{t.description}</p>}
                <div className="text-xs text-muted-foreground">Budget: {money(t.budget_cents)} • Closes: {new Date(t.closes_at).toLocaleString()}</div>
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild><Button size="sm" variant="outline">Submit bid</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Bid on: {t.title}</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div><Label>Bidder name / company</Label><Input value={bid.bidder_name} onChange={(e) => setBid({ ...bid, bidder_name: e.target.value })} /></div>
                        <div><Label>Email</Label><Input value={bid.bidder_email} onChange={(e) => setBid({ ...bid, bidder_email: e.target.value })} /></div>
                        <div><Label>Phone</Label><Input value={bid.bidder_phone} onChange={(e) => setBid({ ...bid, bidder_phone: e.target.value })} /></div>
                        <div><Label>Amount (KES)</Label><Input type="number" value={bid.amount} onChange={(e) => setBid({ ...bid, amount: e.target.value })} /></div>
                        <div><Label>Delivery days</Label><Input type="number" value={bid.delivery_days} onChange={(e) => setBid({ ...bid, delivery_days: e.target.value })} /></div>
                        <div><Label>Proposal</Label><Textarea value={bid.proposal} onChange={(e) => setBid({ ...bid, proposal: e.target.value })} /></div>
                        <Button className="w-full" onClick={() => submitBid(t)}>Submit bid</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  {isProc && <Button size="sm" variant="ghost" onClick={() => setActive(t)}>View bids</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="closed" className="space-y-2">
          {closed_tenders.map((t) => (
            <div key={t.id} className="flex justify-between rounded border p-3 text-sm">
              <span>{t.title} • {t.reference}</span>
              <span className="rounded bg-muted px-2 text-xs">{t.status}</span>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      {isProc && active && (
        <Card>
          <CardHeader>
            <div className="flex justify-between">
              <CardTitle>Bids for: {active.title}</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setActive(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(bids.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No bids yet.</p> : bids.data?.map((b) => (
              <div key={b.id} className="rounded border p-3 text-sm">
                <div className="flex justify-between">
                  <div className="font-medium">{b.bidder_name}</div>
                  <div>{money(b.amount_cents)} • {b.delivery_days ?? "?"}d</div>
                </div>
                {b.proposal && <p className="text-xs text-muted-foreground">{b.proposal}</p>}
                <div className="flex gap-2 pt-2">
                  <span className="rounded bg-primary/10 px-2 text-xs text-primary">{b.status}</span>
                  {b.status === "submitted" && <Button size="sm" onClick={() => awardBid(b)}>Award</Button>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

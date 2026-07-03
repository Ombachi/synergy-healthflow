import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/cash-reconciliation")({ component: CashReconPage });

interface CashSession {
  id: string;
  cashier_id: string;
  opened_at: string;
  opening_float_cents: number;
  closed_at: string | null;
  declared_cash_cents: number | null;
  system_cash_cents: number | null;
  variance_cents: number | null;
  status: string;
  notes: string | null;
}

const money = (c: number | null | undefined) =>
  ((c ?? 0) / 100).toLocaleString(undefined, { style: "currency", currency: "KES" });

function CashReconPage() {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin");
  const [openFloat, setOpenFloat] = useState("");
  const [closing, setClosing] = useState<CashSession | null>(null);
  const [declared, setDeclared] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  const sessions = useQuery({
    queryKey: ["cash-sessions"],
    queryFn: async () => {
      const q = supabase.from("cash_sessions" as never).select("*").order("opened_at", { ascending: false }).limit(50);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as CashSession[]) ?? [];
    },
  });

  const mine = sessions.data?.filter((s) => s.cashier_id === user?.id) ?? [];
  const openSession = mine.find((s) => s.status === "open") ?? null;

  const openMut = useMutation({
    mutationFn: async () => {
      const cents = Math.round(parseFloat(openFloat || "0") * 100);
      const { error } = await supabase.from("cash_sessions" as never).insert({
        cashier_id: user!.id,
        opening_float_cents: cents,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setOpenFloat("");
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      toast.success("Shift opened");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMut = useMutation({
    mutationFn: async () => {
      if (!closing) return;
      const cents = Math.round(parseFloat(declared || "0") * 100);
      const { error } = await supabase.rpc("close_cash_session" as never, {
        _session_id: closing.id,
        _declared_cents: cents,
        _notes: closeNotes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setClosing(null); setDeclared(""); setCloseNotes("");
      qc.invalidateQueries({ queryKey: ["cash-sessions"] });
      toast.success("Shift closed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = isAdmin ? sessions.data ?? [] : mine;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><Wallet className="h-6 w-6 text-primary" /> Cash reconciliation</h1>
        <p className="text-sm text-muted-foreground">Open a shift with an opening float; close it to reconcile declared cash against system total.</p>
      </div>

      {!openSession && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 font-medium">Open shift</div>
          <div className="flex flex-wrap items-end gap-3">
            <div><Label>Opening float</Label><Input type="number" step="0.01" value={openFloat} onChange={(e) => setOpenFloat(e.target.value)} /></div>
            <Button onClick={() => openMut.mutate()} disabled={openMut.isPending}>Open</Button>
          </div>
        </div>
      )}

      {openSession && (
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 font-medium">Your open shift</div>
          <div className="text-sm text-muted-foreground">Opened {new Date(openSession.opened_at).toLocaleString()} · Float {money(openSession.opening_float_cents)}</div>
          <Button className="mt-3" onClick={() => { setClosing(openSession); setDeclared(""); setCloseNotes(""); }}>Close shift</Button>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="border-b p-3 font-medium">{isAdmin ? "All sessions" : "My sessions"}</div>
        <div className="divide-y">
          {rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">No sessions.</div>}
          {rows.map((s) => (
            <div key={s.id} className="grid grid-cols-2 gap-2 p-3 text-sm md:grid-cols-6">
              <div><div className="text-xs text-muted-foreground">Opened</div>{new Date(s.opened_at).toLocaleString()}</div>
              <div><div className="text-xs text-muted-foreground">Closed</div>{s.closed_at ? new Date(s.closed_at).toLocaleString() : "—"}</div>
              <div><div className="text-xs text-muted-foreground">Float</div>{money(s.opening_float_cents)}</div>
              <div><div className="text-xs text-muted-foreground">System</div>{money(s.system_cash_cents)}</div>
              <div><div className="text-xs text-muted-foreground">Declared</div>{money(s.declared_cash_cents)}</div>
              <div>
                <div className="text-xs text-muted-foreground">Variance</div>
                <span className={
                  s.variance_cents == null ? "" :
                  s.variance_cents === 0 ? "text-green-700" :
                  s.variance_cents > 0 ? "text-amber-700" : "text-rose-700"
                }>{money(s.variance_cents)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!closing} onOpenChange={(v) => !v && setClosing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Close shift</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Declared cash on hand</Label><Input type="number" step="0.01" value={declared} onChange={(e) => setDeclared(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={() => closeMut.mutate()} disabled={closeMut.isPending}>Close shift</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { AlertOctagon, AlertTriangle, BookOpen, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { OVERRIDE_REASONS, type CdsCard } from "@/lib/cds/cds-hooks-runner";

const STYLE = {
  critical: { box: "border-destructive/50 bg-destructive/10 text-destructive", icon: AlertOctagon },
  warning: { box: "border-amber-500/40 bg-amber-500/10 text-amber-700", icon: AlertTriangle },
  info: { box: "border-blue-500/40 bg-blue-500/10 text-blue-700", icon: Info },
} as const;

export function CdsCards({ cards, onSuggest }: { cards: CdsCard[]; onSuggest?: (medication: string) => void }) {
  const [mono, setMono] = useState<CdsCard | null>(null);
  if (cards.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-green-500/40 bg-green-500/10 px-3 py-2 text-xs text-green-700">
        <ShieldCheck className="h-4 w-4" /> CDS: no interaction, allergy or dose alerts.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {cards.map((c) => {
        const s = STYLE[c.indicator];
        const Icon = s.icon;
        return (
          <div key={c.uuid} className={`rounded-md border px-3 py-2 text-xs ${s.box}`}>
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-background/60 px-1.5 text-[10px] font-bold uppercase">{c.indicator}</span>
                  <span className="font-semibold">{c.summary}</span>
                </div>
                <div className="mt-0.5 opacity-90">{c.detail}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {c.suggestions.map((sg) => (
                    <Button key={sg.uuid} size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                      onClick={() => onSuggest?.(sg.medication)}>{sg.label}</Button>
                  ))}
                  {c.monograph && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setMono(c)}>
                      <BookOpen className="h-3 w-3" /> Monograph
                    </Button>
                  )}
                </div>
                <div className="mt-1 text-[10px] opacity-70">{c.source.label}</div>
              </div>
            </div>
          </div>
        );
      })}
      <Dialog open={!!mono} onOpenChange={(o) => !o && setMono(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Interaction monograph</DialogTitle>
            <DialogDescription>{mono?.summary}</DialogDescription>
          </DialogHeader>
          {mono?.monograph && (
            <dl className="space-y-2 text-sm">
              <div><dt className="font-medium">Drugs</dt><dd className="text-muted-foreground">{mono.monograph.drugs.join(" + ")}</dd></div>
              <div><dt className="font-medium">Severity</dt><dd className="capitalize text-muted-foreground">{mono.monograph.severity}</dd></div>
              <div><dt className="font-medium">Mechanism</dt><dd className="text-muted-foreground">{mono.monograph.mechanism}</dd></div>
              <div><dt className="font-medium">Clinical consequence</dt><dd className="text-muted-foreground">{mono.monograph.consequence}</dd></div>
              <div><dt className="font-medium">Recommended action</dt><dd className="text-muted-foreground">{mono.monograph.action}</dd></div>
              <div><dt className="font-medium">Evidence</dt><dd className="text-muted-foreground">{mono.monograph.evidence}</dd></div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export interface OverrideResult { rationaleCode: string; rationaleText: string; reauthenticated: boolean }

/**
 * Hard-stop modal for critical alerts. Requires a rationale code, free-text
 * justification and password re-entry (second factor) before release.
 */
export function CdsHardStopDialog({
  open, onOpenChange, cards, email, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cards: CdsCard[];
  email: string | null | undefined;
  onConfirm: (r: OverrideResult) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!code) return toast.error("Choose an override reason");
    if (text.trim().length < 10) return toast.error("Clinical justification must be at least 10 characters");
    if (!email) return toast.error("Your account has no email to verify against");
    if (!password) return toast.error("Re-enter your password to sign the override");
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error("Password verification failed — override not signed");
      await onConfirm({ rationaleCode: code, rationaleText: text.trim(), reauthenticated: true });
      setCode(""); setText(""); setPassword("");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertOctagon className="h-5 w-5" /> Critical safety hard stop
          </DialogTitle>
          <DialogDescription>
            Prescribing is blocked. Choose a suggested alternative, or sign a logged override.
          </DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
          {cards.map((c) => <li key={c.uuid}>{c.summary}</li>)}
        </ul>
        <div className="space-y-3">
          <div>
            <Label>Override reason</Label>
            <select value={code} onChange={(e) => setCode(e.target.value)}
              className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm">
              <option value="">— select —</option>
              {OVERRIDE_REASONS.map((r) => <option key={r.code} value={r.code}>{r.display}</option>)}
            </select>
          </div>
          <div>
            <Label>Clinical justification</Label>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Penicillin allergy de-labelled after oral challenge on 12/03/2026" />
          </div>
          <div>
            <Label>Re-enter your password to sign</Label>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? "Verifying…" : "Sign override & prescribe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

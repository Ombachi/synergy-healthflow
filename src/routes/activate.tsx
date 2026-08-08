import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { activatePortalAccount, validateActivationToken } from "@/lib/portal-invitations.functions";
import { ShieldCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/activate")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Activate your patient portal — Litu Vault" },
      { name: "description", content: "Securely activate your Litu Vault patient portal account and access your health records." },
      { property: "og:title", content: "Activate your patient portal — Litu Vault" },
      { property: "og:description", content: "Securely activate your Litu Vault patient portal account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivatePage,
});

type State =
  | { kind: "loading" }
  | { kind: "invalid"; reason: string }
  | { kind: "form"; email: string | null; fullName: string | null; phoneHint: string | null }
  | { kind: "done"; email: string };

const MESSAGES: Record<string, string> = {
  invalid: "This activation link is not valid. Please ask reception to send you a new one.",
  expired: "This activation link has expired. Ask reception to resend your invitation.",
  used: "This link has already been used. Try signing in instead.",
  revoked: "This link was replaced by a newer invitation. Please use the most recent email or SMS.",
};

function ActivatePage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [verify, setVerify] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  const token = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token") ?? ""
    : "";

  useEffect(() => {
    if (!token) return setState({ kind: "invalid", reason: "invalid" });
    validateActivationToken({ data: { token } })
      .then((res) => {
        if (!res.valid) setState({ kind: "invalid", reason: res.reason });
        else setState({ kind: "form", email: res.email, fullName: res.fullName, phoneHint: res.phoneHint });
      })
      .catch(() => setState({ kind: "invalid", reason: "invalid" }));
  }, [token]);

  async function handleActivate(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      const res = await activatePortalAccount({
        data: { token, password, verify, acceptedTerms: terms },
      });
      const { error } = await supabase.auth.signInWithPassword({ email: res.email, password });
      if (error) {
        setState({ kind: "done", email: res.email });
      } else {
        toast.success("Your portal is active.");
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Activation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-medium">Litu Vault patient portal</span>
        </div>

        {state.kind === "loading" && (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your activation link…
          </p>
        )}

        {state.kind === "invalid" && (
          <>
            <h1 className="mt-4 text-xl font-semibold">Link unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {MESSAGES[state.reason] ?? MESSAGES["invalid"]}
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate({ to: "/auth" })}>
              Go to sign in
            </Button>
          </>
        )}

        {state.kind === "done" && (
          <>
            <h1 className="mt-4 text-xl font-semibold">Account activated</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sign in with {state.email} and the password you just created.
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate({ to: "/auth" })}>Sign in</Button>
          </>
        )}

        {state.kind === "form" && (
          <>
            <h1 className="mt-4 text-2xl font-semibold">
              Welcome{state.fullName ? `, ${state.fullName.split(" ")[0]}` : ""}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirm your details and set a password to activate your portal. This link can only be used once.
            </p>

            <form onSubmit={handleActivate} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="verify">Confirm your email or phone number</Label>
                <Input
                  id="verify" required value={verify} autoComplete="off"
                  placeholder={state.phoneHint ? `e.g. 07•• ••• ${state.phoneHint.slice(-3)}` : "you@example.com"}
                  onChange={(e) => setVerify(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Must match the contact details we hold for you.
                </p>
              </div>
              <div>
                <Label htmlFor="pw">Create a password</Label>
                <Input id="pw" type="password" required minLength={12} value={password}
                  onChange={(e) => setPassword(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">At least 12 characters.</p>
              </div>
              <div>
                <Label htmlFor="pw2">Confirm password</Label>
                <Input id="pw2" type="password" required minLength={12} value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} />
                <span className="text-muted-foreground">
                  I accept the terms of use and the privacy notice covering my health information.
                </span>
              </label>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Activating…" : "Activate my patient portal"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

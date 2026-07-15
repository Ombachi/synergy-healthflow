import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, KeyRound, FileLock2, Activity, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/litu-vault-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Litu Vault — Your Health Records, Locked in the Vault" },
      {
        name: "description",
        content:
          "Litu Vault is a bank-grade health records platform. Encrypted, audited, and role-gated — trusted the way people trust a vault with their money.",
      },
      { property: "og:title", content: "Litu Vault — Health Records, Vault-Grade" },
      {
        property: "og:description",
        content:
          "Encrypted, audited, and role-gated health records for clinicians, athletes, and administrators.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <header className="border-b border-white/10">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <img src={logoUrl} alt="Litu Vault" className="h-8 w-8" width={32} height={32} />
            <span className="tracking-wide">Litu Vault</span>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost" className="text-slate-100 hover:bg-white/10 hover:text-white">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild className="bg-white text-slate-900 hover:bg-slate-100">
              <Link to="/auth">Create account</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto flex min-h-[calc(100vh-4rem)] items-center px-4 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-slate-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Vault-grade health records
          </div>

          <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-3 shadow-2xl">
            <img src={logoUrl} alt="Litu Vault logo" className="h-full w-full" />
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            Welcome to <span className="text-white">Litu Vault</span>
          </h1>
          <p className="mt-6 text-lg text-slate-300">
            Open the vault — sign in to access your records.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-white text-slate-900 hover:bg-slate-100">
              <Link to="/auth">
                Sign in
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/30 bg-transparent text-slate-100 hover:bg-white/10 hover:text-white"
            >
              <Link to="/auth">Create an account</Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
            <div className="flex items-center gap-2"><FileLock2 className="h-4 w-4 text-emerald-400" /> Encrypted</div>
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-emerald-400" /> Role-based access</div>
            <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-400" /> Full audit trail</div>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        Trusted like a bank vault. Built for clinicians, athletes, and administrators.
      </footer>
    </div>
  );
}

function _unused_VaultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
      <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-100">{value}</span>
    </div>
  );
}

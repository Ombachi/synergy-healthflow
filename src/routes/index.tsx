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

      <main className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          {/* Left: brand + CTAs */}
          <section>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-widest text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Vault-grade health records
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Your health records,
              <br />
              <span className="text-slate-400">locked in the vault.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-slate-300">
              People trust banks with their money because vaults are built for it.
              Litu Vault is built the same way for your medical, sports, and clinical records —
              encrypted, audited, and only opened by the people you allow.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="bg-white text-slate-900 hover:bg-slate-100"
              >
                <Link to="/auth">
                  Sign in to the vault
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

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <FileLock2 className="h-4 w-4 text-emerald-400" /> End-to-end encrypted
              </div>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-emerald-400" /> Role-based access
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" /> Full audit trail
              </div>
            </div>
          </section>

          {/* Right: vault card */}
          <section className="relative">
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-white/[0.02] to-transparent p-8 shadow-2xl backdrop-blur">
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

              <div className="relative flex items-center justify-center py-6">
                <img
                  src={logoUrl}
                  alt="Litu Vault logo"
                  className="h-48 w-48 md:h-56 md:w-56"
                  width={224}
                  height={224}
                />
              </div>

              <div className="relative mt-6 space-y-3">
                <VaultRow label="Encryption" value="AES-256 at rest" />
                <VaultRow label="Access control" value="Role-gated · least privilege" />
                <VaultRow label="Audit" value="Every open, every edit, logged" />
                <VaultRow label="Sovereignty" value="You own the key" />
              </div>
            </div>
          </section>
        </div>

        <footer className="mt-24 border-t border-white/10 pt-6 text-center text-xs text-slate-500">
          Trusted like a bank vault. Built for clinicians, athletes, and administrators.
        </footer>
      </main>
    </div>
  );
}

function VaultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3">
      <span className="text-xs uppercase tracking-wider text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-100">{value}</span>
    </div>
  );
}

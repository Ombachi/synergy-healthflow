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
          <div className="mx-auto mb-8 flex h-32 w-32 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03] p-3 shadow-2xl">
            <img src={logoUrl} alt="Litu Vault logo" className="h-full w-full" />
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            Welcome to <span className="text-white">Litu Vault</span>
          </h1>

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
        </div>
      </main>
    </div>
  );
}



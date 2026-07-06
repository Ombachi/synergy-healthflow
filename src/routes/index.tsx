import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Heart, Package, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vitalis — Integrated Health & Sports Platform" },
      {
        name: "description",
        content:
          "Unified medical records, athlete performance, and inventory management for clinics and sports organizations.",
      },
      { property: "og:title", content: "Vitalis — Integrated Health & Sports Platform" },
      {
        property: "og:description",
        content:
          "Unified medical records, athlete performance, and inventory management.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 font-semibold">
            <Heart className="h-5 w-5 text-primary" />
            Vitalis
          </div>
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-20">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            One platform. Medical, sports, and supply — connected.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            A microservice-inspired workspace where clinicians, athletes, and admins
            collaborate around patient care, sports medicine, and inventory in real time.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Open dashboard</Link>
            </Button>
          </div>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Heart,
              title: "Medical / EHR",
              desc: "Patient records, diagnoses, and clinical notes.",
            },
            {
              icon: Activity,
              title: "Sports & Athletes",
              desc: "Roster, vitals, and injury status.",
            },
            {
              icon: Package,
              title: "Inventory",
              desc: "Stock levels, reorder thresholds, and suppliers.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-lg border p-6">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </section>

        <section className="mt-20 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          Role-based access control across clinical, staff, and operations modules.
        </section>
      </main>
    </div>
  );
}

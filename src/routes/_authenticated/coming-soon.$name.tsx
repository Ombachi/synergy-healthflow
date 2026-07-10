import { createFileRoute } from "@tanstack/react-router";
import { Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/coming-soon/$name")({
  component: ComingSoonPage,
});

function humanize(slug: string) {
  return decodeURIComponent(slug).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ComingSoonPage() {
  const { name } = Route.useParams();
  const title = humanize(name);
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-amber-500" /> {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            This module is scheduled for a future release. The navigation slot is reserved so your workflow stays
            consistent as we roll out the full clinical suite.
          </p>
          <p className="text-xs">
            Reach out to your Vitalis administrator to prioritise <strong>{title}</strong> for your site.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

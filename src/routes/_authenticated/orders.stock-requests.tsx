import { createFileRoute } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { StockRequestForm } from "@/components/stock-request-form";

export const Route = createFileRoute("/_authenticated/orders/stock-requests")({
  component: StockRequestsPage,
});

function StockRequestsPage() {
  const { hasAnyRole } = useAuth();
  // Decide which department the user is raising the request for
  const dept: "lab" | "pharmacy" | "ward" = hasAnyRole(["pharmacist"])
    ? "pharmacy"
    : hasAnyRole(["nurse"])
      ? "ward"
      : "lab";
  const hint = dept === "pharmacy" ? "pharmacy" : dept === "ward" ? undefined : "lab";
  const what =
    dept === "pharmacy" ? "medication / consumables"
      : dept === "ward" ? "ward supplies, consumables and PPE"
        : "reagents / consumables";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ShoppingCart className="h-6 w-6 text-primary" /> Stock requests
        </h1>
        <p className="text-sm text-muted-foreground">
          Raise a request to the central store for {what}. Storekeepers will approve and issue stock.
        </p>
      </div>
      <StockRequestForm department={dept} categoryHint={hint} />
    </div>
  );
}

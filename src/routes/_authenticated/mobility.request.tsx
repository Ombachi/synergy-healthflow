import { createFileRoute } from "@tanstack/react-router";
import { BookingWizard } from "@/modules/mobility/booking/booking-wizard";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_authenticated/mobility/request")({
  component: RequestTransportPage,
  head: () => ({
    meta: [
      { title: "Request transport — Litu Vault Mobility" },
      { name: "description", content: "Book an ambulance, healthcare cab, assisted transport or hearse through your Litu Vault account." },
      { property: "og:title", content: "Request transport — Litu Vault Mobility" },
      { property: "og:description", content: "Healthcare transportation booked against your existing patient record." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RequestTransportPage() {
  return (
    <RoleGate path="/mobility/request">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Request transport</h1>
          <p className="text-sm text-muted-foreground">
            Healthcare transportation booked against your Litu Vault record — no separate account needed.
          </p>
        </div>
        <BookingWizard />
      </div>
    </RoleGate>
  );
}

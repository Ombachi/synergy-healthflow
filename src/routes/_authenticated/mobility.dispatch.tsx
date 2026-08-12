import { createFileRoute } from "@tanstack/react-router";

import { RoleGate } from "@/components/role-gate";
import { DispatchBoard } from "@/modules/mobility/dispatch/dispatch-board";

export const Route = createFileRoute("/_authenticated/mobility/dispatch")({
  component: DispatchPage,
  head: () => ({
    meta: [
      { title: "Dispatch board — Litu Vault Mobility" },
      { name: "description", content: "Live transport dispatch: triage requests, match vehicles and track trips in real time." },
      { property: "og:title", content: "Dispatch board — Litu Vault Mobility" },
      { property: "og:description", content: "Triage transport requests, auto or manually dispatch vehicles and follow every trip live." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function DispatchPage() {
  return (
    <RoleGate path="/mobility/dispatch">
      <DispatchBoard />
    </RoleGate>
  );
}

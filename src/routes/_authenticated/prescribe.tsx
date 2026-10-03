import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/role-gate";
import { PrescribePanel } from "@/components/prescribe-panel";

export const Route = createFileRoute("/_authenticated/prescribe")({
  head: () => ({ meta: [{ title: "Prescribe medication · Litu Vault" }, { name: "description", content: "Prescribe with live drug safety checks." }] }),
  component: () => <RoleGate path="/prescribe"><PrescribePanel /></RoleGate>,
});

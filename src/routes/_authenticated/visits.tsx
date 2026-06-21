import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/visits")({
  component: VisitsLayout,
});

function VisitsLayout() {
  return <Outlet />;
}
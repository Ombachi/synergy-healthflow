import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canAccess } from "@/lib/role-permissions";

export function RoleGate({ path, children }: { path: string; children: React.ReactNode }) {
  const { roles, loading } = useAuth();
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!canAccess(path, roles)) {
    return (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-6 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 text-lg font-semibold">Access denied</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your role does not have permission to view this module.
        </p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm text-primary underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

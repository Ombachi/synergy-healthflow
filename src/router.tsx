import { QueryClient } from "@tanstack/react-query";
import { createRouter, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ({ error }) => (
      <div role="alert" className="mx-auto max-w-md rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">This section didn't load</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Please try again."}</p>
        <button className="mt-4 text-sm text-primary underline" onClick={() => window.location.reload()}>Reload</button>
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="mx-auto max-w-md rounded-lg border bg-card p-6 text-center">
        <h1 className="text-lg font-semibold">Record not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may belong to another facility or no longer exists.</p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm text-primary underline">Back to dashboard</Link>
      </div>
    ),
  });

  return router;
};

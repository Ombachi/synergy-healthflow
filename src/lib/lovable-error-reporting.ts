type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};

type LovableEvents = {
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};

declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
  }
}

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const route = window.location.pathname;
  window.__lovableEvents?.captureException?.(
    error,
    { source: "react_error_boundary", route, ...context },
    { mechanism: "react_error_boundary", handled: false, severity: "error" },
  );
  // Also persist to error_events so admins have an in-app error log.
  void logErrorToBackend(error, route, context);
}

async function logErrorToBackend(
  error: unknown,
  route: string,
  context: Record<string, unknown>,
) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const err = error as { message?: string; stack?: string } | undefined;
    const message = err?.message ?? String(error ?? "unknown error");
    await supabase.rpc("log_error" as never, {
      _message: message,
      _stack: err?.stack ?? null,
      _route: route,
      _context: context as never,
      _env: import.meta.env.DEV ? "dev" : "prod",
    } as never);
  } catch {
    // never let error reporting itself break the app
  }
}

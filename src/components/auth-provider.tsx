import { createContext, useContext, type ReactNode } from "react";
import { useAuthState, type AuthState } from "@/hooks/use-auth-state";

const AuthContext = createContext<AuthState | null>(null);

/**
 * Single source of truth for session + roles + profile.
 * Mounted once in __root so role resolution happens exactly once per app
 * boot — this is what removes the dashboard flicker and the brief flashes
 * of the previous/incorrect role view during navigation.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthState | null {
  return useContext(AuthContext);
}

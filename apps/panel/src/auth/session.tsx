import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onSessionLost } from "@/api/client";
import { createSession, deleteSession, getOverview } from "@/api/endpoints";
import { queryClient } from "@/api/query-client";

export type SessionStatus = "checking" | "authenticated" | "anonymous";

interface SessionContextValue {
  status: SessionStatus;
  /** Troca o segredo por um cookie de sessão. Rejeita (ApiError 401) no segredo errado. */
  login: (secret: string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("checking");

  // Probe inicial: o cookie é HttpOnly, então "autenticado?" se infere de uma
  // chamada leve. 200 → sessão válida; qualquer erro (401 inclusive) → anônimo.
  useEffect(() => {
    let cancelled = false;
    getOverview()
      .then(() => {
        if (!cancelled) setStatus("authenticated");
      })
      .catch(() => {
        if (!cancelled) setStatus("anonymous");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Qualquer 401 em chamada autenticada → volta ao login e descarta o cache.
  useEffect(
    () =>
      onSessionLost(() => {
        queryClient.clear();
        setStatus("anonymous");
      }),
    [],
  );

  const login = useCallback(async (secret: string) => {
    await createSession(secret);
    await queryClient.invalidateQueries();
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await deleteSession();
    } finally {
      queryClient.clear();
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, login, logout }),
    [status, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession precisa estar dentro de <SessionProvider>");
  }
  return context;
}

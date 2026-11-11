import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onSessionLost, isApiError } from "@/api/client";
import { createSession, createTeamSession, getSessionRole, deleteSession, getOverview, type OperatorSessionRole } from "@/api/endpoints";
import { queryClient } from "@/api/query-client";

export type SessionStatus = "checking" | "authenticated" | "anonymous";

interface SessionContextValue {
  status: SessionStatus;
  role: OperatorSessionRole | null;
  /** Troca o segredo por um cookie de sessão. Rejeita (ApiError 401) no segredo errado. */
  login: (secret: string) => Promise<void>;
  loginTeam: (username:string,password:string) => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("checking");
  const [role,setRole] = useState<OperatorSessionRole|null>(null);

  // Probe inicial: o cookie é HttpOnly, então "autenticado?" se infere de uma
  // chamada leve. 200 → sessão válida; qualquer erro (401 inclusive) → anônimo.
  useEffect(() => {
    let cancelled = false;
    getOverview()
      .then(async () => {
        let nextRole:OperatorSessionRole="agent";
        try {nextRole=await getSessionRole();}
        catch(error){if(isApiError(error,404))nextRole="admin";}
        if(!cancelled){setRole(nextRole);setStatus("authenticated");}
      })
      .catch(() => {
        if (!cancelled){setRole(null);setStatus("anonymous");}
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
        setRole(null);
        setStatus("anonymous");
      }),
    [],
  );

  const login = useCallback(async (secret: string) => {
    await createSession(secret);
    await queryClient.invalidateQueries();
    setRole("admin");
    setStatus("authenticated");
  }, []);

  const loginTeam=useCallback(async(username:string,password:string)=>{
    const result=await createTeamSession(username,password);
    await queryClient.invalidateQueries();
    setRole(result);
    setStatus("authenticated");
  },[]);

  const logout = useCallback(async () => {
    try {
      await deleteSession();
    } finally {
      queryClient.clear();
      setRole(null);
      setStatus("anonymous");
    }
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, role, login, loginTeam, logout }),
    [status, role, login, loginTeam, logout],
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

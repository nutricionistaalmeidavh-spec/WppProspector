import { QueryCache, QueryClient } from "@tanstack/react-query";
import { isApiError } from "./client";
import { ContractMismatchError, isContractMismatchError } from "./parse";

type ContractMismatchListener = (error: ContractMismatchError) => void;
const contractMismatchListeners = new Set<ContractMismatchListener>();

/** Notificado sempre que uma resposta falha a validação de contrato. */
export function onContractMismatch(listener: ContractMismatchListener): () => void {
  contractMismatchListeners.add(listener);
  return () => contractMismatchListeners.delete(listener);
}

/**
 * Defaults de todas as queries:
 * - `refetchIntervalInBackground: false` — o polling para com a aba oculta.
 * - `retry` moderado, nunca para 4xx nem para incompatibilidade de contrato.
 * - `onError` global: um 401 limpa o cache (o redirecionamento ao login é feito
 *   pelo ouvinte de "sessão perdida" no cliente HTTP); um `ContractMismatchError`
 *   notifica o banner global.
 */
export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isApiError(error, 401)) {
        queryClient.clear();
      }
      if (isContractMismatchError(error)) {
        for (const listener of contractMismatchListeners) {
          listener(error);
        }
      }
    },
  }),
  defaultOptions: {
    queries: {
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (isContractMismatchError(error)) return false;
        if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

/** Intervalo padrão de polling das telas de dados (ms). Dentro da faixa 10–30 s. */
export const POLL_INTERVAL_MS = 15_000;

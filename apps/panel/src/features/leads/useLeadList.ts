import { useInfiniteQuery } from "@tanstack/react-query";
import { listLeads, type LeadListParams } from "@/api/endpoints";
import { POLL_INTERVAL_MS } from "@/api/query-client";

export type LeadFilters = Omit<LeadListParams, "cursor" | "limit">;

/**
 * Listagem de leads paginada por cursor. A chave inclui os filtros, então trocar
 * um filtro reinicia a paginação. Polling a cada `POLL_INTERVAL_MS` (suspenso com
 * a aba oculta pelo default do QueryClient).
 */
export function useLeadList(filters: LeadFilters) {
  return useInfiniteQuery({
    queryKey: ["leads", "list", filters],
    queryFn: ({ pageParam, signal }) => listLeads({ ...filters, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

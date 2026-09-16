import { useInfiniteQuery } from "@tanstack/react-query";
import { listConversations, type ConversationListParams } from "@/api/endpoints";
import { POLL_INTERVAL_MS } from "@/api/query-client";

export type ConversationFilters = Omit<ConversationListParams, "cursor" | "limit">;

/**
 * Listagem paginada por cursor. A chave inclui os filtros, então trocar um
 * filtro reinicia a paginação. Polling a cada `POLL_INTERVAL_MS` (para com a aba
 * oculta via default do QueryClient).
 */
export function useConversationList(filters: ConversationFilters) {
  return useInfiniteQuery({
    queryKey: ["conversations", "list", filters],
    queryFn: ({ pageParam, signal }) =>
      listConversations({ ...filters, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: POLL_INTERVAL_MS,
  });
}

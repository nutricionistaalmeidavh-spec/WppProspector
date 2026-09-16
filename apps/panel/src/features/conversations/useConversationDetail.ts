import { useQuery } from "@tanstack/react-query";
import { isApiError } from "@/api/client";
import { getConversation } from "@/api/endpoints";
import { POLL_INTERVAL_MS } from "@/api/query-client";

/**
 * Detalhe de uma conversa. Um `404` (telefone sem conversa) NÃO é tratado como
 * erro de carregamento: o componente checa `isNotFound` e mostra um estado
 * dedicado.
 */
export function useConversationDetail(leadPhone: string) {
  const query = useQuery({
    queryKey: ["conversations", "detail", leadPhone],
    queryFn: ({ signal }) => getConversation(leadPhone, signal),
    refetchInterval: POLL_INTERVAL_MS,
    enabled: leadPhone.length > 0,
  });

  const isNotFound = isApiError(query.error, 404);
  return { ...query, isNotFound, isError: query.isError && !isNotFound };
}

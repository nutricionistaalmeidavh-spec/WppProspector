import { useQuery } from "@tanstack/react-query";
import { getCapabilities, type Capabilities } from "@/api/endpoints";

/**
 * Decide quais afordâncias de ação a interface pode oferecer.
 *
 * Ordem: se o deploy expõe `GET /admin/api/capabilities`, usa a resposta; senão
 * cai para flags de build (`VITE_MANAGEMENT_ACTIONS` / `VITE_MANAGEMENT_PROSPECTING`),
 * que ficam desligadas por padrão. Assim um deploy cuja API ainda não tem os
 * endpoints de ação nunca mostra um controle acionável.
 *
 * Quando `add-management-conversation-actions` / `add-outbound-prospecting-trigger`
 * chegarem, elas passam a expor `/capabilities` (ou os próprios endpoints) e este
 * hook liga as telas sem outra mudança.
 */
function fromBuildFlags(): Capabilities {
  return {
    conversationActions: import.meta.env.VITE_MANAGEMENT_ACTIONS === "true",
    prospecting: import.meta.env.VITE_MANAGEMENT_PROSPECTING === "true",
  };
}

export function useActionAvailability(): Capabilities {
  const { data } = useQuery({
    queryKey: ["capabilities"],
    queryFn: async ({ signal }) => (await getCapabilities(signal)) ?? fromBuildFlags(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return data ?? { conversationActions: false, prospecting: false };
}

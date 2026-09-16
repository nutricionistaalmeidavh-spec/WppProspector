import { useQueryClient } from "@tanstack/react-query";

/** Invalida toda a listagem de leads (todas as combinações de filtro). */
export function useInvalidateLeadList(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["leads", "list"] });
}

import { useMutation } from "@tanstack/react-query";
import type { ImportLeadsInput } from "@/api/contracts";
import { importLeads } from "@/api/endpoints";
import { useInvalidateLeadList } from "./invalidate-lead-list";

/** Envia `POST /admin/api/leads/import` e recarrega a listagem no sucesso. */
export function useImportLeads() {
  const invalidate = useInvalidateLeadList();
  return useMutation({
    mutationFn: (payload: ImportLeadsInput) => importLeads(payload),
    onSuccess: invalidate,
  });
}

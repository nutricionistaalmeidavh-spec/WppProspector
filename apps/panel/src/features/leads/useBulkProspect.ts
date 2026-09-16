import { useMutation } from "@tanstack/react-query";
import type { BulkProspectInput } from "@/api/contracts";
import { bulkProspect } from "@/api/endpoints";
import { useInvalidateLeadList } from "./invalidate-lead-list";

/** Envia `POST /admin/api/leads/prospect` (disparo em lote) e recarrega a listagem. */
export function useBulkProspect() {
  const invalidate = useInvalidateLeadList();
  return useMutation({
    mutationFn: (payload: BulkProspectInput) => bulkProspect(payload),
    onSuccess: invalidate,
  });
}

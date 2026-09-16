import { useMutation } from "@tanstack/react-query";
import { resetLead } from "@/api/endpoints";
import { useInvalidateLeadList } from "./invalidate-lead-list";

/** Envia `POST /admin/api/leads/:leadPhone/reset` e recarrega a listagem. */
export function useResetLead() {
  const invalidate = useInvalidateLeadList();
  return useMutation({
    mutationFn: (leadPhone: string) => resetLead(leadPhone),
    onSuccess: invalidate,
  });
}

import { useQuery } from "@tanstack/react-query";
import { getConsumption } from "@/api/endpoints";
import type { ConsumptionGroupBy } from "@/api/contracts";
import { POLL_INTERVAL_MS } from "@/api/query-client";

export function useConsumption(params: { from: string; to: string; groupBy: ConsumptionGroupBy }) {
  return useQuery({
    queryKey: ["consumption", params.from, params.to, params.groupBy],
    queryFn: ({ signal }) => getConsumption(params, signal),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

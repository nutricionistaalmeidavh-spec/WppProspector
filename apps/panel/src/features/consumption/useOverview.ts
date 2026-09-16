import { useQuery } from "@tanstack/react-query";
import { getOverview } from "@/api/endpoints";
import { POLL_INTERVAL_MS } from "@/api/query-client";

export function useOverview() {
  return useQuery({
    queryKey: ["stats", "overview"],
    queryFn: ({ signal }) => getOverview(signal),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

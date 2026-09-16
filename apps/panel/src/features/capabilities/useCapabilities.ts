import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";

export interface CrmCapabilities {
  opportunities: boolean;
  companies: boolean;
  campaigns: boolean;
}

export interface UiCapabilities {
  conversationActions: boolean;
  prospecting: boolean;
  crm?: CrmCapabilities;
}

export async function fetchCapabilities(signal?: AbortSignal): Promise<UiCapabilities | null> {
  try {
    const data = await apiFetch<Partial<UiCapabilities>>("/capabilities", { signal });
    const crm = data?.crm;
    return {
      conversationActions: Boolean(data?.conversationActions),
      prospecting: Boolean(data?.prospecting),
      ...(crm
        ? {
            crm: {
              opportunities: Boolean(crm.opportunities),
              companies: Boolean(crm.companies),
              campaigns: Boolean(crm.campaigns),
            },
          }
        : {}),
    };
  } catch {
    return null;
  }
}

export function useCapabilities(): UiCapabilities | null {
  const { data } = useQuery({
    queryKey: ["ui-capabilities"],
    queryFn: ({ signal }) => fetchCapabilities(signal),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return data ?? null;
}

import { useCapabilities, type UiCapabilities } from "@/features/capabilities/useCapabilities";

export interface CrmModules {
  opportunities: boolean;
  companies: boolean;
  campaigns: boolean;
}

export interface CrmRuntime {
  source: "http" | "mock" | "disabled";
  modules: CrmModules;
}

const DISABLED_MODULES: CrmModules = {
  opportunities: false,
  companies: false,
  campaigns: false,
};

const DEVELOPMENT_MODULES: CrmModules = {
  opportunities: true,
  companies: true,
  campaigns: true,
};

export function resolveCrmRuntime(
  capabilities: UiCapabilities | null | undefined,
  development = import.meta.env.DEV,
): CrmRuntime {
  if (capabilities?.crm) {
    const modules = {
      opportunities: capabilities.crm.opportunities,
      companies: capabilities.crm.companies,
      campaigns: capabilities.crm.campaigns,
    };
    const supported = Object.values(modules).some(Boolean);
    return { source: supported ? "http" : "disabled", modules };
  }

  if (development) {
    return { source: "mock", modules: DEVELOPMENT_MODULES };
  }

  return { source: "disabled", modules: DISABLED_MODULES };
}

export function useCrmRuntime(): CrmRuntime {
  return resolveCrmRuntime(useCapabilities());
}

import { apiFetch } from "@/api/client";
import { mockCampaigns, mockCompanies, mockOpportunities } from "./mock-data";
import type { CampaignSummary, Company, Opportunity } from "./types";

export interface CrmRepository {
  listOpportunities(): Promise<Opportunity[]>;
  getOpportunity(id: string): Promise<Opportunity | null>;
  listCompanies(): Promise<Company[]>;
  listCampaigns(): Promise<CampaignSummary[]>;
}

export class MockCrmRepository implements CrmRepository {
  async listOpportunities(): Promise<Opportunity[]> {
    return structuredClone(mockOpportunities);
  }

  async getOpportunity(id: string): Promise<Opportunity | null> {
    const found = mockOpportunities.find((item) => item.id === id);
    return found ? structuredClone(found) : null;
  }

  async listCompanies(): Promise<Company[]> {
    return structuredClone(mockCompanies);
  }

  async listCampaigns(): Promise<CampaignSummary[]> {
    return structuredClone(mockCampaigns);
  }
}

function unwrapItems<T>(payload: T[] | { items: T[] }): T[] {
  return Array.isArray(payload) ? payload : payload.items;
}

export class HttpCrmRepository implements CrmRepository {
  async listOpportunities(): Promise<Opportunity[]> {
    return unwrapItems(
      await apiFetch<Opportunity[] | { items: Opportunity[] }>("/crm/opportunities"),
    );
  }

  async getOpportunity(id: string): Promise<Opportunity | null> {
    return apiFetch<Opportunity | null>(`/crm/opportunities/${encodeURIComponent(id)}`);
  }

  async listCompanies(): Promise<Company[]> {
    return unwrapItems(await apiFetch<Company[] | { items: Company[] }>("/crm/companies"));
  }

  async listCampaigns(): Promise<CampaignSummary[]> {
    return unwrapItems(
      await apiFetch<CampaignSummary[] | { items: CampaignSummary[] }>("/crm/campaigns"),
    );
  }
}

const mockRepository = new MockCrmRepository();
const httpRepository = new HttpCrmRepository();

export function getCrmRepository(source: "http" | "mock"): CrmRepository {
  return source === "http" ? httpRepository : mockRepository;
}

/** Compatibilidade temporária para telas de analytics ainda restritas ao preview local. */
export const crmRepository: CrmRepository = mockRepository;

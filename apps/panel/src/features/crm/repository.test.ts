import { afterEach, describe, expect, it } from "vitest";
import { installFetchMock, restoreFetch } from "@/test/harness";
import { HttpCrmRepository, MockCrmRepository } from "./repository";

afterEach(restoreFetch);

describe("MockCrmRepository", () => {
  it("mantém relações coerentes entre oportunidades e lookup por id", async () => {
    const repository = new MockCrmRepository();
    const opportunities = await repository.listOpportunities();
    expect(opportunities.length).toBeGreaterThan(0);
    const first = opportunities[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("fixture sem oportunidade");

    const found = await repository.getOpportunity(first.id);
    expect(found?.companyId).toBe(first.companyId);
    expect(found?.leadPhone).toBe(first.leadPhone);
  });

  it("devolve cópias e não compartilha mutação entre leituras", async () => {
    const repository = new MockCrmRepository();
    const firstRead = await repository.listOpportunities();
    const first = firstRead[0];
    expect(first).toBeDefined();
    if (!first) throw new Error("fixture sem oportunidade");
    first.companyName = "mutado";

    const secondRead = await repository.listOpportunities();
    expect(secondRead[0]?.companyName).not.toBe("mutado");
  });
});

describe("HttpCrmRepository", () => {
  it("consome os endpoints HTTP do CRM em vez de dados mockados", async () => {
    const sample = (await new MockCrmRepository().listOpportunities())[0];
    expect(sample).toBeDefined();
    if (!sample) throw new Error("fixture sem oportunidade");

    const { calls } = installFetchMock({
      "GET /crm/opportunities": { body: () => [sample] },
      [`GET /crm/opportunities/${sample.id}`]: { body: () => sample },
      "GET /crm/companies": { body: () => [] },
      "GET /crm/campaigns": { body: () => [] },
    });

    const repository = new HttpCrmRepository();
    expect(await repository.listOpportunities()).toEqual([sample]);
    expect(await repository.getOpportunity(sample.id)).toEqual(sample);
    expect(await repository.listCompanies()).toEqual([]);
    expect(await repository.listCampaigns()).toEqual([]);

    const paths = calls.map((call) => new URL(call.url).pathname);
    expect(paths).toContain("/admin/api/crm/opportunities");
    expect(paths).toContain(`/admin/api/crm/opportunities/${sample.id}`);
    expect(paths).toContain("/admin/api/crm/companies");
    expect(paths).toContain("/admin/api/crm/campaigns");
  });
});

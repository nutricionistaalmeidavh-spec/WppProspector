import { describe, expect, it } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { CrmStore } from "./crm-store.ts";

describe("CrmStore SQLite", () => {
  it("persiste empresas, oportunidades e transições com valor monetário em centavos", () => {
    const db = openDatabase(":memory:");
    const store = new CrmStore(db, () => new Date("2026-10-12T17:00:00.000Z"));
    db.prepare("INSERT INTO leads(phone,display_name,company,prospecting_state,created_at,updated_at) VALUES(?,?,?,'pending',?,?)")
      .run("+5516999999999","Ana","Construtora Um","2026-10-12T17:00:00.000Z","2026-10-12T17:00:00.000Z");
    const company = store.createCompany({ name: "Construtora Um", city: "Ribeirão Preto", segment: "Construção" });
    const opp = store.createOpportunity({ title: "Sistema obra", companyId: company.id, leadPhone: "+5516999999999", estimatedValue: 1999.9, owner: "Victor", nextAction: "Demonstrar" });
    expect(opp.estimatedValue).toBe(1999.9);
    expect(store.listCompanies()[0]).toMatchObject({ leadCount: 1, opportunityCount: 1, pipelineValue: 1999.9 });
    store.updateOpportunity(opp.id, { stage: "won" });
    expect(new CrmStore(db).getOpportunity(opp.id)?.stage).toBe("won");
    expect(store.getOpportunityHistory(opp.id).map(e => e.toStage)).toEqual(["new", "won"]);
    const metrics = store.conversionMetrics();
    expect(metrics).toMatchObject({ total: 1, qualified: 1, proposal: 1, won: 1, wonValue: 1999.9 });
    db.close();
  });

  it("associa público existente sem enviar mensagens e agrega estados reais dos leads", () => {
    const db = openDatabase(":memory:");
    const store = new CrmStore(db);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO leads(phone,prospecting_state,created_at,updated_at) VALUES(?,'replied',?,?)")
      .run("+5516999999999",now,now);
    const campaign = store.createCampaign({ name: "Contatos autorizados" });
    expect(store.addCampaignMembers(campaign.id, ["+5516999999999", "+5516888888888"])).toEqual({ added: 1, missing: ["+5516888888888"] });
    expect(store.listCampaigns()[0]).toMatchObject({ audience: 1, sent: 1, replied: 1, failed: 0 });
    expect(store.addCampaignMembers(campaign.id, ["+5516999999999"])).toEqual({ added: 0, missing: [] });
    db.close();
  });
});

import { describe, expect, it } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { CrmStore } from "./crm-store.ts";

const phone = "+5516999999999";
function fixture() {
  const db = openDatabase(":memory:");
  const store = new CrmStore(db, () => new Date("2026-11-11T15:00:00.000Z"));
  const at = "2026-11-11T15:00:00.000Z";
  db.prepare("INSERT INTO leads(phone,display_name,company,prospecting_state,created_at,updated_at) VALUES(?,?,?,'pending',?,?)")
    .run(phone, "Cliente de teste", "ArtiSys Cliente", at, at);
  const company = store.createCompany({ name: "ArtiSys Cliente" });
  const opportunity = store.createOpportunity({
    title: "Implantação", companyId: company.id, leadPhone: phone, estimatedValue: 1500, owner: "Comercial",
  });
  return { db, store, company, opportunity };
}

describe("CRM comercial persistente — sem dependências pagas", () => {
  it("converte lead uma única vez e mantém o registro canônico de prospecção", () => {
    const { db, store } = fixture();
    try {
      const first = store.convertLeadToCustomer(phone);
      const second = store.convertLeadToCustomer(phone);
      expect(first.id).toBe(second.id);
      expect(first.leadPhone).toBe(phone);
      expect(db.prepare("SELECT COUNT(*) AS n FROM crm_customers").get()).toMatchObject({ n: 1 });
      expect(db.prepare("SELECT prospecting_state FROM leads WHERE phone=?").get(phone)).toMatchObject({ prospecting_state: "pending" });
    } finally { db.close(); }
  });

  it("emite orçamento local idempotente com valores em centavos, sem emitir cobrança", () => {
    const { db, store, opportunity } = fixture();
    try {
      const customer = store.convertLeadToCustomer(phone);
      const first = store.createQuote({
        opportunityId: opportunity.id,
        items: [{ description: "Sistema", quantity: 2, unitPrice: 249.95 }],
        notes: "Proposta de demonstração",
      });
      const second = store.createQuote({
        opportunityId: opportunity.id,
        items: [{ description: "Sistema", quantity: 2, unitPrice: 249.95 }],
      });
      expect(first.id).toBe(second.id);
      expect(first.customerId).toBe(customer.id);
      expect(first.totalCents).toBe(49990);
      expect(store.getOpportunity(opportunity.id)?.stage).toBe("proposal");
      expect(store.getOpportunityHistory(opportunity.id).map(x=>x.toStage)).toEqual(["new","proposal"]);
      expect(store.getQuote(first.id)?.items).toHaveLength(1);
      expect(db.prepare("SELECT COUNT(*) AS n FROM crm_quotes").get()).toMatchObject({ n: 1 });
    } finally { db.close(); }
  });

  it("registra e conclui tarefas com datas e responsável sem perder histórico", () => {
    const { db, store, opportunity } = fixture();
    try {
      const task = store.createActivity({
        opportunityId: opportunity.id, kind: "CALL", subject: "Retornar cliente",
        dueAt: "2026-11-12", owner: "Comercial",
      });
      expect(store.listActivities({ status: "OPEN" }).map(a => a.id)).toContain(task.id);
      expect(store.completeActivity(task.id)?.status).toBe("DONE");
      expect(store.completeActivity(task.id)?.completedAt).toBeTruthy();
      expect(store.listActivities({ status: "OPEN" })).toHaveLength(0);
    } finally { db.close(); }
  });

  it("registra probabilidade e motivo de perda, preservando transição de etapa", () => {
    const { db, store, opportunity } = fixture();
    try {
      store.updateOpportunity(opportunity.id, { stage: "lost", probabilityPercent: 15, lossReason: "Sem orçamento" });
      const saved = store.getOpportunity(opportunity.id);
      expect(saved).toMatchObject({ stage: "lost", probabilityPercent: 15, lossReason: "Sem orçamento" });
      expect(store.getOpportunityHistory(opportunity.id).map(x => x.toStage)).toEqual(["new", "lost"]);
    } finally { db.close(); }
  });

  it("gera indicadores por origem e responsável a partir de dados reais", () => {
    const { db, store, opportunity } = fixture();
    try {
      store.updateOpportunity(opportunity.id, { stage: "won", source: "site" });
      const report = store.commercialReport();
      expect(report.total).toBe(1);
      expect(report.won).toBe(1);
      expect(report.byOwner.find(x => x.name === "Comercial")?.total).toBe(1);
      expect(report.bySource.find(x => x.name === "site")?.total).toBe(1);
    } finally { db.close(); }
  });
});

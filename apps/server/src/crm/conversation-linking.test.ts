import { describe, expect, it } from "vitest";
import { Conversation } from "../conversation-engine/domain/conversation.ts";
import { buildAdminTestApp } from "../management/test-support/admin-test-app.ts";

const PRIMARY = "+5516999999999";
const SECONDARY = "+5516888888888";

describe("WhatsApp ↔ CRM: vínculos canônicos", () => {
  it("registra automaticamente um lead mínimo ao receber inbound e evita duplicidade", async () => {
    const h = await buildAdminTestApp();
    try {
      const conversation = Conversation.createNew(PRIMARY);
      conversation.recordInboundTurn({ text: "Olá, preciso de orçamento", timestamp: new Date("2026-10-12T17:00:00.000Z"), messageId: "wamid.inbound-001" });
      await h.repository.save(conversation);
      await h.repository.save(conversation);
      const lead = await h.leads.findByPhone(PRIMARY);
      expect(lead).toMatchObject({ phone: PRIMARY, source: "whatsapp_inbound", prospectingState: "pending" });
      expect(h.db.prepare("SELECT COUNT(*) AS n FROM leads WHERE phone = ?").get(PRIMARY)).toMatchObject({ n: 1 });
    } finally { await h.close(); }
  });

  it("localiza a oportunidade pelo telefone e permite vínculo explícito sem alterar o dono", async () => {
    const h = await buildAdminTestApp();
    try {
      const cookie = await h.login();
      const api = (method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
        h.app.inject({ method, url, headers: { cookie }, payload });
      for (const phone of [PRIMARY, SECONDARY]) {
        const conversation = Conversation.createNew(phone);
        conversation.recordInboundTurn({ text: "Quero atendimento", timestamp: new Date("2026-10-12T17:00:00.000Z"), messageId: `wamid.${phone}` });
        await h.repository.save(conversation);
      }
      const company = (await api("POST", "/admin/api/crm/companies", { name: "Empresa de teste" })).json();
      const opportunity = (await api("POST", "/admin/api/crm/opportunities", {
        title: "Contrato de teste", companyId: company.id, leadPhone: PRIMARY,
      })).json();
      const own = await api("GET", `/admin/api/crm/conversations/${encodeURIComponent(PRIMARY)}/context`);
      expect(own.statusCode).toBe(200);
      expect(own.json().opportunities.map((item: { id: string }) => item.id)).toContain(opportunity.id);

      const linked = await api("POST", `/admin/api/crm/conversations/${encodeURIComponent(SECONDARY)}/opportunities/${opportunity.id}`);
      expect(linked.statusCode).toBe(200);
      expect((await api("GET", `/admin/api/crm/conversations/${encodeURIComponent(SECONDARY)}/context`)).json().opportunities).toHaveLength(1);
      expect((await api("GET", `/admin/api/crm/opportunities/${opportunity.id}/conversations`)).json().items).toEqual(expect.arrayContaining([PRIMARY, SECONDARY]));
      expect((await api("GET", `/admin/api/crm/opportunities/${opportunity.id}`)).json().leadPhone).toBe(PRIMARY);
      expect((await api("DELETE", `/admin/api/crm/conversations/${encodeURIComponent(SECONDARY)}/opportunities/${opportunity.id}`)).statusCode).toBe(204);
      expect((await api("GET", `/admin/api/crm/conversations/${encodeURIComponent(SECONDARY)}/context`)).json().opportunities).toHaveLength(0);
    } finally { await h.close(); }
  });

  it("sincroniza contatos sem enviar mensagens, sem duplicar leads e sem substituir nome editado", async () => {
    const h = await buildAdminTestApp();
    try {
      const cookie = await h.login();
      const call = (method: "GET" | "POST", url: string, payload?: object) =>
        h.app.inject({ method, url, headers: { cookie }, payload });
      const imported = await call("POST", "/admin/api/whatsapp/contacts/import", {
        source: "file", contacts: [
          { phone: PRIMARY, displayName: "Cliente teste" },
          { phone: PRIMARY, displayName: "Cliente teste" },
          { phone: SECONDARY, displayName: "Outro cliente" },
        ],
      });
      expect(imported.statusCode).toBe(200);
      expect((await call("GET", "/admin/api/whatsapp/contacts")).json().items).toHaveLength(2);
      expect(await h.leads.findByPhone(PRIMARY)).toBeNull();
      const promoted = await call("POST", `/admin/api/whatsapp/contacts/${encodeURIComponent(PRIMARY)}/lead`);
      expect(promoted.statusCode).toBe(200);
      expect((await h.leads.findByPhone(PRIMARY))?.displayName).toBe("Cliente teste");
    } finally { await h.close(); }
  });
});

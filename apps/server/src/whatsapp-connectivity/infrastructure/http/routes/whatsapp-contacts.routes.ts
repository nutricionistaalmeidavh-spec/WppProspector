import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { LeadRepositoryPort } from "../../../../management/application/ports/lead-repository.port.ts";
import { WhatsappContactsStore } from "../../persistence/whatsapp-contacts-store.ts";

const PHONE = /^\+[1-9]\d{7,14}$/;
const contact = z.object({ phone: z.string().regex(PHONE), displayName: z.string().max(160).optional() });
const batch = z.object({ source: z.literal("file"), contacts: z.array(contact).min(1).max(2000) });
const phoneParam = z.object({ phone: z.string().regex(PHONE) });

export const registerWhatsAppContactsRoutes: FastifyPluginAsync<{
  store: WhatsappContactsStore; leads: LeadRepositoryPort;
}> = async (app, { store, leads }) => {
  app.get("/api/whatsapp/contacts", async (req, reply) => {
    const result = z.object({ search: z.string().max(100).optional() }).safeParse(req.query);
    if (!result.success) return reply.code(422).send({ error: "Busca inválida" });
    return { items: store.list(result.data.search ?? "") };
  });
  app.post("/api/whatsapp/contacts/import", async (req, reply) => {
    const result = batch.safeParse(req.body);
    if (!result.success) return reply.code(422).send({ error: "Lista de contatos inválida", issues: result.error.issues });
    return store.upsertMany(result.data.contacts, result.data.source);
  });
  app.post<{ Params: { phone: string } }>("/api/whatsapp/contacts/:phone/lead", async (req, reply) => {
    const parsed = phoneParam.safeParse(req.params);
    if (!parsed.success) return reply.code(422).send({ error: "Telefone inválido" });
    const found = store.get(parsed.data.phone);
    if (!found) return reply.code(404).send({ error: "Contato não encontrado" });
    // Idempotente: importar agenda não sobrescreve nome ou origem curados pelo CRM.
    const prior = await leads.findByPhone(found.phone);
    const lead = prior ?? await leads.upsert({ phone: found.phone,
      ...(found.displayName ? { displayName: found.displayName } : {}),
      source: "whatsapp_contacts" });
    return reply.send({ phone: lead.phone, displayName: lead.displayName });
  });
};

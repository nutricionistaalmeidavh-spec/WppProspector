import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SqliteConsentStore } from "../../persistence/sqlite-consent-store.ts";

const params = z.object({ phone: z.string().regex(/^\+[1-9]\d{1,14}$/) });
const grantSchema = z.object({ source: z.string().min(3) });

/** Montar apenas dentro de /admin, sob o session guard existente. */
export const registerConsentRoutes: FastifyPluginAsync<{ consent: SqliteConsentStore }> = async (app, { consent }) => {
  app.post<{ Params: { phone: string } }>("/api/contacts/:phone/consent", async (req, reply) => {
    const p = params.safeParse(req.params), body = grantSchema.safeParse(req.body);
    if (!p.success || !body.success) return reply.code(422).send({ error: "invalid_consent" });
    consent.grant(p.data.phone, body.data.source);
    return reply.code(200).send(consent.status(p.data.phone));
  });
  app.post<{ Params: { phone: string } }>("/api/contacts/:phone/opt-out", async (req, reply) => {
    const p = params.safeParse(req.params);
    if (!p.success) return reply.code(422).send({ error: "invalid_phone" });
    consent.optOut(p.data.phone);
    return reply.code(200).send(consent.status(p.data.phone));
  });
  app.get<{ Params: { phone: string } }>("/api/contacts/:phone/consent", async (req, reply) => {
    const p = params.safeParse(req.params);
    if (!p.success) return reply.code(422).send({ error: "invalid_phone" });
    return reply.code(200).send(consent.status(p.data.phone));
  });
};

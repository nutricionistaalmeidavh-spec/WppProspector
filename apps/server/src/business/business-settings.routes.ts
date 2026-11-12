import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { registerBusinessStudioRoutes } from "./business-studio.routes.ts";
import { ZodError } from "zod";
import { verify } from "../management/infrastructure/http/session-token.ts";
import { SESSION_COOKIE_NAME } from "../management/infrastructure/http/session-guard.ts";
import type { BusinessAiStore } from "./business-ai-store.ts";

export interface BusinessSettingsRouteDeps {
  store: BusinessAiStore;
  db: DatabaseSync;
  sessionSecret: string;
  clock?: () => Date;
}
export const registerBusinessSettingsRoutes: FastifyPluginAsync<BusinessSettingsRouteDeps> = async (app, deps) => {
  // Equipe e agentes não podem nem visualizar chaves configuradas ou alterar políticas.
  const adminOnly: preHandlerAsyncHookHandler = async (request, reply) => {
    const cookie = request.cookies?.[SESSION_COOKIE_NAME] ?? "";
    const status = verify(cookie, (deps.clock ?? (() => new Date()))(), deps.sessionSecret);
    if (status.status !== "ok") return reply.code(401).send({error:"unauthorized"});
    if (status.payload.userId) return reply.code(403).send({error:"forbidden"});
  };
  await app.register(registerBusinessStudioRoutes,{db:deps.db,store:deps.store,sessionSecret:deps.sessionSecret,clock:deps.clock});
  app.get("/api/business/profile", {preHandler:adminOnly}, async () => deps.store.getBusiness());
  app.put("/api/business/profile", {preHandler:adminOnly}, async (request, reply) => {
    try { return deps.store.saveBusiness(request.body); }
    catch (error) {
      if (error instanceof ZodError) return reply.code(422).send({error:"Perfil inválido",details:error.issues.map(x=>x.path.join("."))});
      throw error;
    }
  });
  app.get("/api/business/ai", {preHandler:adminOnly}, async () => deps.store.getAi());
  app.put("/api/business/ai", {preHandler:adminOnly}, async (request, reply) => {
    try { return deps.store.saveAi(request.body); }
    catch (error) {
      if (error instanceof ZodError) return reply.code(422).send({error:"Configuração de IA inválida"});
      if (error instanceof Error) return reply.code(422).send({error:error.message});
      throw error;
    }
  });
};

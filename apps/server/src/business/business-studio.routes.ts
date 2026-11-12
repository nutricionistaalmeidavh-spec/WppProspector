import type { DatabaseSync } from "node:sqlite";
import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z, ZodError } from "zod";
import { verify } from "../management/infrastructure/http/session-token.ts";
import { SESSION_COOKIE_NAME } from "../management/infrastructure/http/session-guard.ts";
import type { BusinessAiStore } from "./business-ai-store.ts";
import { BusinessStudioStore, StudioValidationError } from "./business-studio-store.ts";
import { LocalRulesLlmClient } from "../conversation-engine/infrastructure/llm/local-rules-llm-client.ts";
import { OpenAiChatClient } from "./openai-chat-client.ts";
import { AnthropicLlmClient } from "../conversation-engine/infrastructure/llm/anthropic-llm-client.ts";

interface Deps { db:DatabaseSync; store:BusinessAiStore; sessionSecret:string; clock?:()=>Date; requestFetch?:typeof fetch }
const previewSchema=z.object({message:z.string().trim().min(1).max(2000),allowExternal:z.boolean().default(false)});
const diagnosticsSchema=z.object({allowExternal:z.boolean().default(false)});
const clock=()=>new Date();
const safe=<T>(fn:()=>Promise<T>|T,reply:{code:(status:number)=>{send:(v:unknown)=>unknown}}):Promise<T|unknown> =>
  Promise.resolve().then(fn).catch((error:unknown)=>{
    const code=error instanceof StudioValidationError?409:422;
    const message=error instanceof ZodError?"Dados inválidos: "+error.issues.map(x=>x.path.join(".")).join(", "):
      error instanceof Error?error.message:"Falha na operação.";
    return reply.code(code).send({error:message.slice(0,360)});
  });

/** Rotas operacionais internas: laboratório nunca envia WhatsApp ou consome consentimento. */
export const registerBusinessStudioRoutes:FastifyPluginAsync<Deps> = async(app,deps)=>{
  const studio=new BusinessStudioStore(deps.db,deps.store);
  const requestFetch=deps.requestFetch??fetch;
  const adminOnly:preHandlerAsyncHookHandler=async(request,reply)=>{
    const cookie=request.cookies?.[SESSION_COOKIE_NAME]??"";
    const status=verify(cookie,(deps.clock??clock)(),deps.sessionSecret);
    if(status.status!=="ok")return reply.code(401).send({error:"unauthorized"});
    if(status.payload.userId)return reply.code(403).send({error:"forbidden"});
  };

  app.get("/api/business/studio",{preHandler:adminOnly},async()=>({
    draft:studio.getDraft(),pendingAi:deps.store.getPendingAi(),activeAi:deps.store.getAi(),
    rulesDraft:studio.getRulesDraft(),validation:studio.getValidation(),history:studio.history(),
    commerce:studio.commerceStatus(),integration:studio.integrationStatus(),
  }));
  app.put("/api/business/studio/draft",{preHandler:adminOnly},async(request,reply)=>safe(()=>studio.saveDraft(request.body),reply));
  app.post("/api/business/studio/publish",{preHandler:adminOnly},async(_request,reply)=>safe(()=>studio.publish(),reply));
  app.post("/api/business/studio/rollback",{preHandler:adminOnly},async(request,reply)=>safe(()=>{
    const {revision}=z.object({revision:z.number().int().positive()}).parse(request.body);
    return studio.rollback(revision);
  },reply));

  app.put("/api/business/studio/rules-draft",{preHandler:adminOnly},async(request,reply)=>safe(()=>studio.saveRulesDraft(request.body),reply));
  app.post("/api/business/studio/rules-publish",{preHandler:adminOnly},async(_request,reply)=>safe(()=>studio.publishRules(),reply));
  app.put("/api/business/studio/ai-draft",{preHandler:adminOnly},async(request,reply)=>safe(()=>deps.store.stageAi(request.body),reply));
  app.post("/api/business/studio/ai-publish",{preHandler:adminOnly},async(_request,reply)=>safe(()=>{
    if(!deps.store.getPendingAi().published)studio.assertValidated("engine");
    return deps.store.publishAi();
  },reply));

  app.post("/api/business/studio/ai-diagnostics",{preHandler:adminOnly},async(request,reply)=>safe(async()=>{
    const {allowExternal}=diagnosticsSchema.parse(request.body);
    const engine=deps.store.getPreviewAi();
    if(engine.provider==="rules")return {
      ok:true,provider:"rules",model:"local-rules",checkedAt:(deps.clock??clock)().toISOString(),
      diagnostic:"As regras locais não dependem de rede ou credenciais.",charged:false,
    };
    // Consentimento é exigido pelo backend, não apenas por um checkbox na interface.
    if(!allowExternal)return reply.code(409).send({error:"Confirme o teste de conexão externa antes de executá-lo."});
    const started=Date.now();
    try {
      const client=engine.provider==="anthropic" ? new AnthropicLlmClient({apiKey:engine.apiKey!})
        :new OpenAiChatClient(engine.apiKey??"",requestFetch,engine.endpoint);
      const answer=await client.generate({
        system:"Diagnóstico técnico: responda exatamente OK, sem dados de clientes.",
        messages:[{role:"user",content:"OK"}],model:engine.model,maxTokens:12,
      });
      return {ok:true,provider:engine.provider,model:answer.usage.model,
        checkedAt:(deps.clock??clock)().toISOString(),durationMs:Date.now()-started,
        diagnostic:"Autenticação, conectividade e modelo responderam.",charged:engine.provider!=="compatible"};
    }catch(error) {
      // Não retornar corpos HTTP, tokens, URLs privadas ou respostas do provedor ao browser.
      const raw=error instanceof Error?error.message:"";
      const reason=/\\b(401|403)\\b/.test(raw)?"auth":/\\b404\\b/.test(raw)?"model":
        /\\b429\\b/.test(raw)?"rate_limit":"connection";
      return reply.code(422).send({ok:false,provider:engine.provider,reason,
        error:reason==="auth"?"Credenciais rejeitadas pelo provedor.":
          reason==="model"?"Modelo informado não encontrado.":
          reason==="rate_limit"?"Limite de requisições do provedor.":
          "Não foi possível validar a conexão e o modelo."});
    }
  },reply));

  app.post("/api/business/studio/simulate",{preHandler:adminOnly},async(request,reply)=>safe(async()=>{
    const {message,allowExternal}=previewSchema.parse(request.body);
    const match=studio.previewRule(message);
    if(match){
      if(!studio.getRulesDraft().published)studio.markValidated("rules");
      return {provider:"automation",rule:match.rule,reply:match.reply,handoff:match.handoff,sent:false,charged:false,
        validation:studio.getValidation()};
    }
    const business=studio.getDraft().profile;
    const engine=deps.store.getPreviewAi();
    if(engine.provider==="rules"||!allowExternal){
      const response=await new LocalRulesLlmClient(()=>business).generate({
        system:"Atendimento de simulação",messages:[{role:"user",content:message}],maxTokens:300,model:"local-rules",
      });
      const output=JSON.parse(response.text) as {replyMessages:string[];handoffToHuman:boolean};
      if(!studio.getDraft().published)studio.markValidated("profile");
      if(engine.provider==="rules"&&!deps.store.getPendingAi().published)studio.markValidated("engine");
      return {provider:"rules",configuredProvider:engine.provider,reply:output.replyMessages.join("\n"),
        handoff:output.handoffToHuman,sent:false,charged:false,validation:studio.getValidation()};
    }
    const context=["Você é um atendente da empresa abaixo. Use somente os dados cadastrados; nunca invente preços, estoque ou promessas.",
      "Empresa: "+business.name,"Segmento: "+business.segment,"Descrição: "+business.description,
      "Horários: "+business.openingHours,"Pagamentos: "+business.paymentMethods,
      "Entregas: "+business.deliveryPolicy,"Trocas: "+business.returnPolicy,
      "Produtos: "+business.products.map(p=>p.name+" | "+p.price+" | "+p.description).join("; "),
      "FAQ: "+business.faq.map(p=>p.question+" = "+p.answer).join("; "),
      "Se faltar informação, encaminhe à equipe humana."].join("\n");
    const client=engine.provider==="anthropic"?new AnthropicLlmClient({apiKey:engine.apiKey!}):
      engine.provider==="compatible"?new OpenAiChatClient("",requestFetch,engine.endpoint!):new OpenAiChatClient(engine.apiKey!,requestFetch);
    const answer=await client.generate({system:context,messages:[{role:"user",content:message}],model:engine.model,maxTokens:240});
    if(!studio.getDraft().published)studio.markValidated("profile");
    if(!deps.store.getPendingAi().published)studio.markValidated("engine");
    return {provider:engine.provider,reply:answer.text,handoff:false,sent:false,
      charged:engine.provider!=="compatible",usage:{input:answer.usage.inputTokens,output:answer.usage.outputTokens},
      validation:studio.getValidation()};
  },reply));

  app.get("/api/business/studio/catalog",{preHandler:adminOnly},async()=>({
    items:studio.getCatalog(),orders:studio.getOrders(),status:studio.commerceStatus(),
  }));
  app.post("/api/business/studio/catalog/import",{preHandler:adminOnly},async(request,reply)=>safe(()=>{
    const {items}=z.object({items:z.array(z.unknown()).max(2500)}).parse(request.body);
    return studio.importCatalog(items);
  },reply));
  app.put("/api/business/studio/catalog/enabled",{preHandler:adminOnly},async(request,reply)=>safe(()=>{
    const {enabled}=z.object({enabled:z.boolean()}).parse(request.body);
    return studio.enableCatalog(enabled);
  },reply));

  // Fonte genérica e self-hosted: token gerado localmente, gravado apenas como hash.
  app.get("/api/business/studio/integration-token",{preHandler:adminOnly},async()=>studio.integrationStatus());
  app.post("/api/business/studio/integration-token",{preHandler:adminOnly},async()=>studio.rotateIntegrationToken());
  app.delete("/api/business/studio/integration-token",{preHandler:adminOnly},async()=>studio.revokeIntegrationToken());
  app.post("/integrations/commerce/v1/sync",async(request,reply)=>{
    const auth=request.headers.authorization??"";
    if(!auth.startsWith("Bearer ")||!studio.validateIntegrationToken(auth.slice(7)))
      return reply.code(401).send({error:"unauthorized"});
    return safe(()=>studio.syncIntegration(request.body),reply);
  });

  // Conector específico legado: facultativo, nunca pré-requisito da fonte genérica.
  app.put("/api/business/studio/shopify",{preHandler:adminOnly},async(request,reply)=>safe(()=>deps.store.saveShopifyConnection(request.body),reply));
  app.delete("/api/business/studio/shopify",{preHandler:adminOnly},async()=>deps.store.removeShopifyConnection());
  app.post("/api/business/studio/shopify/sync",{preHandler:adminOnly},async(_request,reply)=>safe(()=>studio.syncShopify(),reply));
};

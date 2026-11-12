import type { DatabaseSync } from "node:sqlite";
import type { FastifyPluginAsync, preHandlerAsyncHookHandler } from "fastify";
import { z, ZodError } from "zod";
import { verify } from "../management/infrastructure/http/session-token.ts";
import { SESSION_COOKIE_NAME } from "../management/infrastructure/http/session-guard.ts";
import type { BusinessAiStore } from "./business-ai-store.ts";
import { BusinessStudioStore } from "./business-studio-store.ts";
import { LocalRulesLlmClient } from "../conversation-engine/infrastructure/llm/local-rules-llm-client.ts";
import { OpenAiChatClient } from "./openai-chat-client.ts";
import { AnthropicLlmClient } from "../conversation-engine/infrastructure/llm/anthropic-llm-client.ts";
import { AutomationStore, renderAutomationTemplate } from "../automation/automation-store.ts";

interface Deps { db:DatabaseSync; store:BusinessAiStore; sessionSecret:string; clock?:()=>Date }
const previewSchema=z.object({message:z.string().trim().min(1).max(2000),allowExternal:z.boolean().default(false)});
const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");

/** Rotas do laboratório: nunca enviam WhatsApp, alteram leads ou agendam follow-ups. */
export const registerBusinessStudioRoutes:FastifyPluginAsync<Deps> = async(app,deps)=>{
  const studio=new BusinessStudioStore(deps.db,deps.store);
  const adminOnly:preHandlerAsyncHookHandler=async(request,reply)=>{
    const cookie=request.cookies?.[SESSION_COOKIE_NAME]??"";
    const status=verify(cookie,(deps.clock??(()=>new Date()))(),deps.sessionSecret);
    if(status.status!=="ok")return reply.code(401).send({error:"unauthorized"});
    if(status.payload.userId)return reply.code(403).send({error:"forbidden"});
  };
  const safe=<T>(run:()=>Promise<T>|T,reply:{code:(status:number)=>{send:(v:unknown)=>unknown}}):Promise<T|unknown>=>{
    return Promise.resolve().then(run).catch((error:unknown)=>{
      const msg=error instanceof ZodError?"Dados inválidos: "+error.issues.map(x=>x.path.join(".")).join(", "):
        error instanceof Error?error.message:"Não foi possível concluir a operação.";
      return reply.code(422).send({error:msg.slice(0,400)});
    });
  };
  app.get("/api/business/studio",{preHandler:adminOnly},async()=>({
    draft:studio.getDraft(),pendingAi:deps.store.getPendingAi(),activeAi:deps.store.getAi(),
    history:studio.history(),commerce:studio.commerceStatus(),
  }));
  app.put("/api/business/studio/draft",{preHandler:adminOnly},async(request,reply)=>safe(()=>studio.saveDraft(request.body),reply));
  app.post("/api/business/studio/publish",{preHandler:adminOnly},async(_request,reply)=>safe(()=>studio.publish(),reply));
  app.post("/api/business/studio/rollback",{preHandler:adminOnly},async(request,reply)=>safe(()=>{
    const {revision}=z.object({revision:z.number().int().positive()}).parse(request.body);
    return studio.rollback(revision);
  },reply));
  app.put("/api/business/studio/ai-draft",{preHandler:adminOnly},async(request,reply)=>safe(()=>deps.store.stageAi(request.body),reply));
  app.post("/api/business/studio/ai-publish",{preHandler:adminOnly},async(_request,reply)=>safe(()=>deps.store.publishAi(),reply));
  app.post("/api/business/studio/simulate",{preHandler:adminOnly},async(request,reply)=>safe(async()=>{
    const {message,allowExternal}=previewSchema.parse(request.body);
    const business=studio.getDraft().profile;
    // Consulta as regras sem chamar evaluate(): evaluate() persiste sessões de menus.
    for(const rule of new AutomationStore(deps.db).listRules()){
      if(!rule.enabled)continue;
      const text=normalize(message),trigger=normalize(rule.trigger);
      const match=rule.match==="equals"?text===trigger:rule.match==="starts_with"?text.startsWith(trigger):text.includes(trigger);
      if(match)return {
        provider:"automation",rule:rule.name,reply:renderAutomationTemplate(rule.response,"[simulação]",message)+
          (rule.action==="menu"?"\n"+rule.options.map(o=>o.key+". "+o.label).join("\n"):""),
        handoff:rule.action==="handoff",sent:false,charged:false,
      };
    }
    const engine=deps.store.getPreviewAi();
    if(engine.provider==="rules" || !allowExternal){
      const response=await new LocalRulesLlmClient(()=>business).generate({
        system:"Atendimento de simulação",messages:[{role:"user",content:message}],maxTokens:300,model:"local-rules",
      });
      const output=JSON.parse(response.text) as {replyMessages:string[];handoffToHuman:boolean};
      return {provider:"rules",configuredProvider:engine.provider,reply:output.replyMessages.join("\n"),
        handoff:output.handoffToHuman,sent:false,charged:false};
    }
    // A API externa só recebe dados após allowExternal=true enviado em ação explícita.
    const context=["Você é um atendente da empresa abaixo. Use somente os dados cadastrados; nunca invente preços, estoque ou promessas.",
      "Empresa: "+business.name,"Segmento: "+business.segment,"Descrição: "+business.description,
      "Horários: "+business.openingHours,"Pagamentos: "+business.paymentMethods,
      "Entregas: "+business.deliveryPolicy,"Trocas: "+business.returnPolicy,
      "Produtos: "+business.products.map(p=>p.name+" | "+p.price+" | "+p.description).join("; "),
      "FAQ: "+business.faq.map(p=>p.question+" = "+p.answer).join("; "),
      "Se faltar informação, encaminhe à equipe humana."].join("\n");
    const client=engine.provider==="anthropic"?new AnthropicLlmClient({apiKey:engine.apiKey!}):
      engine.provider==="compatible"?new OpenAiChatClient("",fetch,engine.endpoint!):new OpenAiChatClient(engine.apiKey!);
    const answer=await client.generate({system:context,messages:[{role:"user",content:message}],model:engine.model,maxTokens:240});
    return {provider:engine.provider,reply:answer.text,handOff:false,sent:false,
      charged:engine.provider!=="compatible",usage:{input:answer.usage.inputTokens,output:answer.usage.outputTokens}};
  },reply));
  app.get("/api/business/studio/catalog",{preHandler:adminOnly},async()=>({items:studio.getCatalog(),orders:studio.getOrders(),status:studio.commerceStatus()}));
  app.post("/api/business/studio/catalog/import",{preHandler:adminOnly},async(request,reply)=>safe(()=>{
    const {items}=z.object({items:z.array(z.unknown()).max(2500)}).parse(request.body);
    return studio.importCatalog(items);
  },reply));
  app.put("/api/business/studio/catalog/enabled",{preHandler:adminOnly},async(request,reply)=>safe(()=>{
    const {enabled}=z.object({enabled:z.boolean()}).parse(request.body);
    return studio.enableCatalog(enabled);
  },reply));
  app.put("/api/business/studio/shopify",{preHandler:adminOnly},async(request,reply)=>safe(()=>deps.store.saveShopifyConnection(request.body),reply));
  app.delete("/api/business/studio/shopify",{preHandler:adminOnly},async()=>deps.store.removeShopifyConnection());
  app.post("/api/business/studio/shopify/sync",{preHandler:adminOnly},async(_request,reply)=>safe(()=>studio.syncShopify(),reply));
};

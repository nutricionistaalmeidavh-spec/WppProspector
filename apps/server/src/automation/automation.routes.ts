import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { SqliteConsentStore } from "../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";
import { AutomationStore, followupInputSchema, ruleInputSchema } from "./automation-store.ts";

const idSchema = z.object({ id: z.string().uuid() });
export const registerAutomationRoutes: FastifyPluginAsync<{
  automation: AutomationStore; consent: SqliteConsentStore; followupsEnabled: boolean;
}> = async (app,{automation,consent,followupsEnabled}) => {
  app.get("/api/automations/rules", async () => ({ items:automation.listRules() }));

  app.post("/api/automations/rules", async(req,reply)=>{
    const parsed=ruleInputSchema.safeParse(req.body);
    if(!parsed.success)return reply.code(422).send({error:"Regra inválida",issues:parsed.error.issues});
    const { id: _ignored, ...clean } = parsed.data;
    return reply.code(201).send(automation.saveRule(clean));
  });
  app.put<{ Params:{id:string} }>("/api/automations/rules/:id", async(req,reply)=>{
    const id=idSchema.safeParse(req.params),body=ruleInputSchema.safeParse(req.body);
    if(!id.success||!body.success)return reply.code(422).send({error:"Regra inválida"});
    if(!automation.listRules().some(item=>item.id===id.data.id))return reply.code(404).send({error:"Regra inexistente"});
    return reply.send(automation.saveRule({...body.data,id:id.data.id}));
  });
  app.delete<{ Params:{id:string} }>("/api/automations/rules/:id", async(req,reply)=>{
    const id=idSchema.safeParse(req.params);
    if(!id.success)return reply.code(422).send({error:"ID inválido"});
    if(!automation.deleteRule(id.data.id))return reply.code(404).send({error:"Regra inexistente"});
    return reply.code(204).send();
  });

  app.get("/api/automations/followups", async()=>({items:automation.listFollowups(),enabled:followupsEnabled}));
  app.post("/api/automations/followups", async(req,reply)=>{
    if(!followupsEnabled)return reply.code(409).send({error:"Agendamentos de texto requerem conector local; API oficial usa templates aprovados."});
    const body=followupInputSchema.safeParse(req.body);
    if(!body.success)return reply.code(422).send({error:"Follow-up inválido",issues:body.error.issues});
    const due=new Date(body.data.dueAt).getTime(),now=Date.now();
    if(due<now+60_000 || due>now+30*24*60*60_000)return reply.code(422).send({error:"Selecione entre 1 minuto e 30 dias no futuro."});
    if(!consent.canProspect(body.data.phone))return reply.code(403).send({error:"Contato sem consentimento vigente."});
    try{return reply.code(201).send(automation.scheduleFollowup(body.data,consent));}
    catch{return reply.code(403).send({error:"Contato sem consentimento vigente."});}
  });
  app.delete<{Params:{id:string}}>("/api/automations/followups/:id",async(req,reply)=>{
    const parsed=idSchema.safeParse(req.params);
    if(!parsed.success)return reply.code(422).send({error:"ID inválido"});
    if(!automation.cancelFollowup(parsed.data.id))return reply.code(409).send({error:"Agendamento inexistente ou já concluído"});
    return reply.code(204).send();
  });
};

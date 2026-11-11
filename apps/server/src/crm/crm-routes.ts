import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CRM_STAGES, type CrmStore } from "./crm-store.ts";
import type { ProspectLeadUseCase } from "../management/application/prospect-lead.use-case.ts";
import {CustomerAlreadyConvertedError,ProspectingGatewayError} from "../management/application/errors.ts";

const idParams=z.object({id:z.string().uuid()});
const phone=z.string().regex(/^\+[1-9]\d{1,14}$/);
const companyData=z.object({
  name:z.string().trim().min(2).max(160),
  city:z.string().trim().max(100).default(""),
  segment:z.string().trim().max(100).default(""),
});
const campaignData=z.object({
  name:z.string().trim().min(2).max(160),
  status:z.enum(["draft","running","paused","completed"]).default("draft"),
});
const opportunityData=z.object({
  title:z.string().trim().min(2).max(180),
  companyId:z.string().uuid(),
  leadPhone:phone,
  stage:z.enum(CRM_STAGES).default("new"),
  estimatedValue:z.number().finite().min(0).max(1e9).default(0),
  owner:z.string().trim().max(120).default(""),
  nextAction:z.string().trim().max(500).default(""),
  nextActionAt:z.string().max(80).default(""),
  campaignId:z.string().uuid().nullable().optional(),
  source:z.string().trim().max(180).default(""),
  qualification:z.string().trim().max(180).default(""),
  probabilityPercent:z.number().finite().min(0).max(100).default(0),
  lossReason:z.string().trim().max(400).default(""),
  ownerUserId:z.string().uuid().nullable().optional(),
});
// PATCH nunca deve injetar os valores padrão de POST em propriedades omitidas.
const companyPatch=z.object({
  ...companyData.shape,
  city:z.string().trim().max(100),
  segment:z.string().trim().max(100),
}).partial();
const campaignPatch=z.object({
  ...campaignData.shape,
  status:z.enum(["draft","running","paused","completed"]),
}).partial();
const opportunityPatch=z.object({
  ...opportunityData.shape,
  stage:z.enum(CRM_STAGES),
  estimatedValue:z.number().finite().min(0).max(1e9),
  owner:z.string().trim().max(120),
  nextAction:z.string().trim().max(500),
  nextActionAt:z.string().max(80),
  source:z.string().trim().max(180),
  qualification:z.string().trim().max(180),
  probabilityPercent:z.number().finite().min(0).max(100),
  lossReason:z.string().trim().max(400),
  ownerUserId:z.string().uuid().nullable().optional(),
}).partial();

const validDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
  const parsed=new Date(value+"T00:00:00.000Z");
  return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
},"Data inválida");
const quoteData=z.object({
  opportunityId:z.string().uuid(),
  items:z.array(z.object({
    description:z.string().trim().min(1).max(200),
    quantity:z.number().finite().positive().max(100000),
    unitPrice:z.number().finite().min(0).max(1e9),
  })).min(1).max(100),
  notes:z.string().trim().max(3000).default(""),
});
const activityData=z.object({
  opportunityId:z.string().uuid(),
  kind:z.enum(["CALL","EMAIL","WHATSAPP","MEETING","TASK"]),
  subject:z.string().trim().min(1).max(300),
  dueAt:validDate,
  owner:z.string().trim().max(120).default(""),
  ownerUserId:z.string().uuid().nullable().optional(),
  followupId:z.string().uuid().nullable().optional(),
});

function responseError(err:unknown):{status:409|422;message:string}{
  const msg=err instanceof Error?err.message:"Falha ao salvar";
  if(msg.includes("UNIQUE constraint failed"))return{status:409,message:"Registro duplicado."};
  if(msg.includes("FOREIGN KEY constraint failed"))return{status:422,message:"Referência inexistente."};
  return{status:422,message:msg};
}
export const registerCrmRoutes:FastifyPluginAsync<{
  store:CrmStore;prospectLead?:ProspectLeadUseCase;prospectingEnabled?:boolean;
}>=async(app,{store,prospectLead,prospectingEnabled})=>{
  app.get("/api/crm/companies",async()=>({items:store.listCompanies()}));
  app.post("/api/crm/companies",async(req,reply)=>{
    const input=companyData.safeParse(req.body);
    if(!input.success)return reply.code(422).send({error:"Empresa inválida",issues:input.error.issues});
    try{return reply.code(201).send(store.createCompany(input.data));}
    catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });
  app.patch<{Params:{id:string}}>("/api/crm/companies/:id",async(req,reply)=>{
    const params=idParams.safeParse(req.params),body=companyPatch.safeParse(req.body);
    if(!params.success||!body.success)return reply.code(422).send({error:"Dados inválidos"});
    try{
      const value=store.updateCompany(params.data.id,body.data);
      return value?reply.send(value):reply.code(404).send({error:"Empresa não encontrada"});
    }catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });


  // Associação por ID: nunca correlacionar empresas com comparação de nomes livres.
  app.patch<{Params:{phone:string}}>("/api/crm/leads/:phone/company",async(req,reply)=>{
    const params=z.object({phone}).safeParse(req.params);
    const body=z.object({companyId:z.string().uuid().nullable()}).safeParse(req.body);
    if(!params.success||!body.success)return reply.code(422).send({error:"Associação inválida"});
    try{return reply.send(store.linkLeadCompany(params.data.phone,body.data.companyId));}
    catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });
  app.get("/api/crm/team",async()=>({items:store.listAssignableOperators()}));
  app.get<{Querystring:{phone?:string}}>("/api/crm/followups",async(req,reply)=>{
    const params=z.object({phone}).safeParse(req.query);
    if(!params.success)return reply.code(422).send({error:"Telefone inválido"});
    return reply.send({items:store.listAvailableFollowups(params.data.phone)});
  });

  app.get("/api/crm/opportunities",async()=>({items:store.listOpportunities()}));
  app.get<{Params:{id:string}}>("/api/crm/opportunities/:id",async(req,reply)=>{
    const params=idParams.safeParse(req.params);
    if(!params.success)return reply.code(422).send({error:"ID inválido"});
    return reply.send(store.getOpportunity(params.data.id));
  });
  app.get<{Params:{id:string}}>("/api/crm/opportunities/:id/history",async(req,reply)=>{
    const params=idParams.safeParse(req.params);
    if(!params.success)return reply.code(422).send({error:"ID inválido"});
    if(!store.getOpportunity(params.data.id))return reply.code(404).send({error:"Oportunidade não encontrada"});
    return reply.send({items:store.getOpportunityHistory(params.data.id)});
  });
  app.post("/api/crm/opportunities",async(req,reply)=>{
    const parsed=opportunityData.safeParse(req.body);
    if(!parsed.success)return reply.code(422).send({error:"Oportunidade inválida",issues:parsed.error.issues});
    try{return reply.code(201).send(store.createOpportunity(parsed.data));}
    catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });
  app.patch<{Params:{id:string}}>("/api/crm/opportunities/:id",async(req,reply)=>{
    const params=idParams.safeParse(req.params),data=opportunityPatch.safeParse(req.body);
    if(!params.success||!data.success)return reply.code(422).send({error:"Dados inválidos"});
    try{
      const value=store.updateOpportunity(params.data.id,data.data);
      return value?reply.send(value):reply.code(404).send({error:"Oportunidade não encontrada"});
    }catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });

  app.get("/api/crm/campaigns",async()=>({items:store.listCampaigns()}));
  app.post("/api/crm/campaigns",async(req,reply)=>{
    const parsed=campaignData.safeParse(req.body);
    if(!parsed.success)return reply.code(422).send({error:"Campanha inválida",issues:parsed.error.issues});
    return reply.code(201).send(store.createCampaign(parsed.data));
  });
  app.patch<{Params:{id:string}}>("/api/crm/campaigns/:id",async(req,reply)=>{
    const params=idParams.safeParse(req.params),data=campaignPatch.safeParse(req.body);
    if(!params.success||!data.success)return reply.code(422).send({error:"Dados inválidos"});
    const result=store.updateCampaign(params.data.id,data.data);
    return result?reply.send(result):reply.code(404).send({error:"Campanha não encontrada"});
  });

  // Somente endpoint explícito, consentimento e gateway de templates habilitado.
  // Mensagens não identificadas com campaignId continuam sem atribuição.
  app.post<{Params:{id:string}}>("/api/crm/campaigns/:id/prospect",async(req,reply)=>{
    const params=idParams.safeParse(req.params);
    const body=z.object({
      phone,
      parameters:z.union([z.array(z.string()),z.record(z.string(),z.string())]).optional(),
    }).safeParse(req.body);
    if(!params.success||!body.success)return reply.code(422).send({error:"Envio inválido"});
    if(!prospectLead||prospectingEnabled===false)
      return reply.code(503).send({error:"Prospecção por template indisponível nesta instalação"});
    if(!store.hasCampaignMember(params.data.id,body.data.phone))
      return reply.code(404).send({error:"Contato não associado a esta campanha"});
    try{
      const sent=await prospectLead.prospect(body.data.phone,{parameters:body.data.parameters});
      if(sent.alreadyProspected||!sent.wamid)return reply.send({outcome:"skipped",wamid:null});
      store.recordCampaignSend(params.data.id,body.data.phone,sent.wamid);
      return reply.send({outcome:"sent",wamid:sent.wamid});
    }catch(e){
      if(e instanceof CustomerAlreadyConvertedError)
        return reply.code(409).send({error:"customer_already_converted"});
      if(e instanceof ProspectingGatewayError){
        store.recordCampaignFailure(params.data.id,body.data.phone);
        return reply.code(502).send({error:"prospecting_gateway_error",reason:e.reason});
      }
      const err=responseError(e);return reply.code(err.status).send({error:err.message});
    }
  });

  app.get<{Params:{id:string}}>("/api/crm/campaigns/:id/members",async(req,reply)=>{
    const params=idParams.safeParse(req.params);
    if(!params.success)return reply.code(422).send({error:"ID inválido"});
    if(!store.listCampaigns().some(c=>c.id===params.data.id))return reply.code(404).send({error:"Campanha não encontrada"});
    return reply.send({items:store.listCampaignMembers(params.data.id)});
  });
  app.post<{Params:{id:string}}>("/api/crm/campaigns/:id/members",async(req,reply)=>{
    const params=idParams.safeParse(req.params),body=z.object({phones:z.array(phone).min(1).max(500)}).safeParse(req.body);
    if(!params.success||!body.success)return reply.code(422).send({error:"Público inválido"});
    try{return reply.send(store.addCampaignMembers(params.data.id,body.data.phones));}
    catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });
  app.delete<{Params:{id:string;phone:string}}>("/api/crm/campaigns/:id/members/:phone",async(req,reply)=>{
    const params=z.object({id:z.string().uuid(),phone}).safeParse(req.params);
    if(!params.success)return reply.code(422).send({error:"Parâmetros inválidos"});
    if(!store.removeCampaignMember(params.data.id,params.data.phone))
      return reply.code(404).send({error:"Associação não encontrada"});
    return reply.code(204).send();
  });

  // CRM comercial: clientes e orçamentos são locais; nenhuma rota efetua cobrança ou envio.
  app.get("/api/crm/customers",async()=>({items:store.listCustomers()}));
  app.post("/api/crm/customers/convert",async(req,reply)=>{
    const parsed=z.object({leadPhone:phone}).safeParse(req.body);
    if(!parsed.success)return reply.code(422).send({error:"Telefone inválido"});
    try{return reply.send(store.convertLeadToCustomer(parsed.data.leadPhone));}
    catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });
  app.get("/api/crm/quotes",async()=>({items:store.listQuotes()}));
  app.get<{Params:{id:string}}>("/api/crm/quotes/:id",async(req,reply)=>{
    const params=idParams.safeParse(req.params);
    if(!params.success)return reply.code(422).send({error:"ID inválido"});
    const quote=store.getQuote(params.data.id);
    return quote?reply.send(quote):reply.code(404).send({error:"Orçamento não encontrado"});
  });
  app.post("/api/crm/quotes",async(req,reply)=>{
    const parsed=quoteData.safeParse(req.body);
    if(!parsed.success)return reply.code(422).send({error:"Orçamento inválido",issues:parsed.error.issues});
    try{return reply.code(201).send(store.createQuote(parsed.data));}
    catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });
  app.get("/api/crm/activities",async(req,reply)=>{
    const parsed=z.object({
      status:z.enum(["OPEN","DONE"]).optional(),
      opportunityId:z.string().uuid().optional(),
      owner:z.string().max(120).optional(),
    }).safeParse(req.query);
    if(!parsed.success)return reply.code(422).send({error:"Filtros inválidos"});
    return reply.send({items:store.listActivities(parsed.data)});
  });
  app.post("/api/crm/activities",async(req,reply)=>{
    const parsed=activityData.safeParse(req.body);
    if(!parsed.success)return reply.code(422).send({error:"Atividade inválida",issues:parsed.error.issues});
    try{return reply.code(201).send(store.createActivity(parsed.data));}
    catch(e){const err=responseError(e);return reply.code(err.status).send({error:err.message});}
  });
  app.post<{Params:{id:string}}>("/api/crm/activities/:id/complete",async(req,reply)=>{
    const parsed=idParams.safeParse(req.params);
    if(!parsed.success)return reply.code(422).send({error:"ID inválido"});
    const saved=store.completeActivity(parsed.data.id);
    return saved?reply.send(saved):reply.code(404).send({error:"Atividade não encontrada"});
  });
  app.get("/api/crm/analytics/commercial",async()=>store.commercialReport());

  app.get("/api/crm/analytics/conversions",async()=>store.conversionMetrics());
};

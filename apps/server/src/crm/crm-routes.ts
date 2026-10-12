import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { CRM_STAGES, type CrmStore } from "./crm-store.ts";

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
}).partial();
function responseError(err:unknown):{status:409|422;message:string}{
  const msg=err instanceof Error?err.message:"Falha ao salvar";
  if(msg.includes("UNIQUE constraint failed"))return{status:409,message:"Registro duplicado."};
  if(msg.includes("FOREIGN KEY constraint failed"))return{status:422,message:"Referência inexistente."};
  return{status:422,message:msg};
}
export const registerCrmRoutes:FastifyPluginAsync<{store:CrmStore}>=async(app,{store})=>{
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
  app.get("/api/crm/analytics/conversions",async()=>store.conversionMetrics());
};

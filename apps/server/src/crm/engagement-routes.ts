import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { verify } from "../management/infrastructure/http/session-token.ts";
import { SESSION_COOKIE_NAME } from "../management/infrastructure/http/session-guard.ts";
import { CRM_STAGES } from "./crm-store.ts";
import { EngagementStore, type Actor } from "./engagement-store.ts";

const phone=z.string().regex(/^\+[1-9]\d{1,14}$/);
const uuid=z.string().uuid();
const name=z.string().trim().min(2).max(100);
const entity=z.enum(["lead","opportunity"]);
const fieldKinds=z.enum(["text","number","date"]);
const stage=z.enum(CRM_STAGES);
const actorOnly=(actor:Actor)=>actor.role==="admin"||actor.role==="manager";
const bad=(reply:{code:(n:number)=>{send:(v:unknown)=>unknown}},error:unknown)=>{
  const reason=error instanceof Error?error.message:"Não foi possível concluir operação";
  return reply.code(reason.includes("UNIQUE")?409:422).send({error:reason});
};

export const registerEngagementRoutes:FastifyPluginAsync<{
 store:EngagementStore;sessionSecret:string;clock?:()=>Date;
 onStageMoved?:(id:string,stage:string,phone:string)=>void;
}>=async(app,deps)=>{
  const clock=deps.clock??(()=>new Date());
  function actor(cookie:string):Actor|null {
    const token=verify(cookie,clock(),deps.sessionSecret);
    if(token.status!=="ok")return null;
    return {role:token.payload.role??"admin",...(token.payload.userId?{userId:token.payload.userId}:{})};
  }
  const getActor=(request:{cookies?:Record<string,string|undefined>})=>
    actor(request.cookies?.[SESSION_COOKIE_NAME]??"");
  app.get("/api/engagement/assignments",async()=>({items:deps.store.listAssignments()}));
  app.get("/api/engagement/metrics",async()=>deps.store.metrics());
  app.get<{Params:{phone:string}}>("/api/engagement/assignments/:phone/history",async(req,reply)=>{
    const p=phone.safeParse(req.params.phone);
    if(!p.success)return reply.code(422).send({error:"Telefone inválido"});
    return {items:deps.store.history(p.data)};
  });
  app.put<{Params:{phone:string}}>("/api/engagement/assignments/:phone",async(req,reply)=>{
    const p=phone.safeParse(req.params.phone);
    const body=z.object({ownerId:uuid.nullable(),department:z.string().max(80).default("Geral")}).safeParse(req.body);
    if(!p.success||!body.success)return reply.code(422).send({error:"Atribuição inválida"});
    const a=getActor(req);
    if(!a)return reply.code(401).send({error:"Sessão inválida"});
    try{return deps.store.assign(p.data,a,body.data);}
    catch(error){return bad(reply,error);}
  });
  app.get("/api/engagement/labels",async()=>({items:deps.store.listLabels()}));
  app.post("/api/engagement/labels",async(req,reply)=>{
    const a=getActor(req),body=z.object({name}).safeParse(req.body);
    if(!a||!actorOnly(a))return reply.code(403).send({error:"Restrito à gestão"});
    if(!body.success)return reply.code(422).send({error:"Etiqueta inválida"});
    try{return reply.code(201).send(deps.store.createLabel(body.data.name));}
    catch(error){return bad(reply,error);}
  });
  app.get<{Params:{phone:string}}>("/api/engagement/contacts/:phone/labels",async(req,reply)=>{
    const p=phone.safeParse(req.params.phone);
    return p.success?{items:deps.store.getContactLabels(p.data)}:reply.code(422).send({error:"Telefone inválido"});
  });
  app.put<{Params:{phone:string}}>("/api/engagement/contacts/:phone/labels",async(req,reply)=>{
    const a=getActor(req),p=phone.safeParse(req.params.phone),body=z.object({ids:z.array(uuid).max(30)}).safeParse(req.body);
    if(!a)return reply.code(401).send({error:"Sessão inválida"});
    if(!p.success||!body.success)return reply.code(422).send({error:"Etiquetas inválidas"});
    const assignment=deps.store.getAssignment(p.data);
    if(a.role==="agent"&&assignment?.ownerId!==null&&assignment?.ownerId!==a.userId)
      return reply.code(403).send({error:"Conversa atribuída a outro operador"});
    try{return {items:deps.store.setContactLabels(p.data,body.data.ids)};}
    catch(error){return bad(reply,error);}
  });
  app.get("/api/engagement/fields",async(req,reply)=>{
    const q=z.object({entity}).safeParse(req.query);
    return q.success?{items:deps.store.listFields(q.data.entity)}:reply.code(422).send({error:"Entidade inválida"});
  });
  app.post("/api/engagement/fields",async(req,reply)=>{
    const a=getActor(req),body=z.object({entity,name,kind:fieldKinds}).safeParse(req.body);
    if(!a||!actorOnly(a))return reply.code(403).send({error:"Restrito à gestão"});
    if(!body.success)return reply.code(422).send({error:"Campo inválido"});
    try{return reply.code(201).send(deps.store.createField(body.data));}
    catch(error){return bad(reply,error);}
  });
  app.get("/api/engagement/values",async(req,reply)=>{
    const q=z.object({entity,id:z.string().min(1).max(180)}).safeParse(req.query);
    return q.success?{items:deps.store.getFieldValues(q.data.entity,q.data.id)}:reply.code(422).send({error:"Consulta inválida"});
  });
  app.put("/api/engagement/values",async(req,reply)=>{
    const a=getActor(req),body=z.object({entity,entityId:z.string().min(1).max(180),fieldId:uuid,value:z.string().max(2000)}).safeParse(req.body);
    if(!a)return reply.code(401).send({error:"Sessão inválida"});
    if(!body.success)return reply.code(422).send({error:"Valor inválido"});
    if(a.role==="agent"&&body.data.entity==="lead") {
      const assignment=deps.store.getAssignment(body.data.entityId);
      if(assignment?.ownerId&&assignment.ownerId!==a.userId)
        return reply.code(403).send({error:"Contato de outro operador"});
    }
    try{return deps.store.setFieldValue(body.data);}
    catch(error){return bad(reply,error);}
  });
  app.get("/api/engagement/pipelines",async()=>({items:deps.store.listPipelines()}));
  app.post("/api/engagement/pipelines",async(req,reply)=>{
    const a=getActor(req),body=z.object({name}).safeParse(req.body);
    if(!a||!actorOnly(a))return reply.code(403).send({error:"Restrito à gestão"});
    if(!body.success)return reply.code(422).send({error:"Funil inválido"});
    try{return reply.code(201).send(deps.store.createPipeline(body.data.name));}
    catch(error){return bad(reply,error);}
  });
  app.post<{Params:{id:string}}>("/api/engagement/pipelines/:id/stages",async(req,reply)=>{
    const a=getActor(req),p=z.union([uuid,z.literal("default")]).safeParse(req.params.id);
    const body=z.object({name,baseStage:stage}).safeParse(req.body);
    if(!a||!actorOnly(a))return reply.code(403).send({error:"Restrito à gestão"});
    if(!p.success||!body.success)return reply.code(422).send({error:"Etapa inválida"});
    try{return reply.code(201).send(deps.store.createStage(p.data,body.data));}
    catch(error){return bad(reply,error);}
  });
  app.patch<{Params:{id:string}}>("/api/engagement/stages/:id",async(req,reply)=>{
    const a=getActor(req),p=z.union([uuid,z.string().regex(/^default-(?:new|contacted|replied|qualified|meeting|proposal|negotiation|won|lost)$/)]).safeParse(req.params.id);
    const body=z.object({name}).safeParse(req.body);
    if(!a||!actorOnly(a))return reply.code(403).send({error:"Restrito à gestão"});
    if(!p.success||!body.success)return reply.code(422).send({error:"Etapa inválida"});
    try{return deps.store.renameStage(p.data,body.data.name);}
    catch(error){return bad(reply,error);}
  });
  app.get<{Params:{id:string}}>("/api/engagement/pipelines/:id/opportunities",async(req,reply)=>{
    const id=z.union([uuid,z.literal("default")]).safeParse(req.params.id);
    return id.success?{items:deps.store.listPipelineOpportunities(id.data)}:reply.code(422).send({error:"Funil inválido"});
  });
  app.patch<{Params:{id:string}}>("/api/engagement/opportunities/:id/stage",async(req,reply)=>{
    const id=uuid.safeParse(req.params.id);
    const body=z.object({pipelineId:z.union([uuid,z.literal("default")]),stageId:z.string().min(1).max(80)}).safeParse(req.body);
    if(!id.success||!body.success)return reply.code(422).send({error:"Movimento inválido"});
    try {
      const result=deps.store.moveOpportunity(id.data,body.data.pipelineId,body.data.stageId);
      const row=deps.store.listPipelineOpportunities(result.pipelineId).find(r=>r.id===result.id);
      if(row)deps.onStageMoved?.(row.id,row.stage,"");
      return result;
    }catch(error){return bad(reply,error);}
  });
};

import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { describe,expect,it } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { TeamStore } from "../team/team-store.ts";
import { issue } from "../management/infrastructure/http/session-token.ts";
import { createAdminSessionGuard } from "../management/infrastructure/http/session-guard.ts";
import { EngagementStore } from "./engagement-store.ts";
import { registerEngagementRoutes } from "./engagement-routes.ts";

const phone="+5516999888777";
const now=new Date("2026-11-13T12:00:00Z");
const secret="test-secret";
function setup(){
  const db=openDatabase(":memory:");
  const at=now.toISOString();
  db.prepare("INSERT INTO conversation_index (lead_phone,state,lead_intent,turn_count,has_pending_inbound,updated_at) VALUES (?,'active','unknown',0,0,?)").run(phone,at);
  db.prepare("INSERT INTO leads(phone,prospecting_state,created_at,updated_at) VALUES(?,'pending',?,?)").run(phone,at,at);
  const team=new TeamStore(db,()=>now);
  const anna=team.create({username:"anna",password:"StrongPassword123!",role:"agent"});
  const bruno=team.create({username:"bruno",password:"StrongPassword123!",role:"agent"});
  const manager=team.create({username:"gerente",password:"StrongPassword123!",role:"manager"});
  const store=new EngagementStore(db,()=>now);
  const app=Fastify();
  return {db,app,store,anna,bruno,manager,team};
}
function signed(actor?:{id:string;role:"manager"|"agent";version:number}){
  const token=issue(now,3600000,secret,actor?{userId:actor.id,role:actor.role,version:actor.version}:undefined);
  return {cookie:"admin_session="+token};
}
describe("API do atendimento — acesso por operador",()=>{
  it("protege leitura sem sessão, permite claim de agente e exige gestor para transferência",async()=>{
    const f=setup();
    try{
      await f.app.register(cookie);
      f.app.addHook("preHandler",createAdminSessionGuard({sessionSecret:secret,clock:()=>now,team:f.team,
        assignmentOwner:phone=>f.store.getAssignment(phone)?.ownerId??null}));
      await f.app.register(registerEngagementRoutes,{store:f.store,sessionSecret:secret,clock:()=>now});
      f.app.post("/api/conversations/:leadPhone/messages",async()=>({ok:true}));
      await f.app.ready();
      expect((await f.app.inject({method:"GET",url:"/api/engagement/assignments"})).statusCode).toBe(401);
      const a=signed(f.anna);
      const b=signed(f.bruno);
      const manager=signed(f.manager);
      const first=await f.app.inject({method:"PUT",url:"/api/engagement/assignments/"+encodeURIComponent(phone),
        headers:a,payload:{ownerId:f.anna.id,department:"Geral"}});
      expect(first.statusCode).toBe(200);
      expect(first.json().ownerId).toBe(f.anna.id);
      const stealing=await f.app.inject({method:"PUT",url:"/api/engagement/assignments/"+encodeURIComponent(phone),
        headers:b,payload:{ownerId:f.bruno.id,department:"Geral"}});
      expect(stealing.statusCode).toBe(422);
      const blockedSend=await f.app.inject({method:"POST",url:"/api/conversations/"+encodeURIComponent(phone)+"/messages",headers:b,payload:{text:"Olá"}});
      expect(blockedSend.statusCode).toBe(403);
      const moved=await f.app.inject({method:"PUT",url:"/api/engagement/assignments/"+encodeURIComponent(phone),
        headers:manager,payload:{ownerId:f.bruno.id,department:"Suporte"}});
      expect(moved.statusCode).toBe(200);
      expect(f.store.history(phone)).toHaveLength(2);
      expect((await f.app.inject({method:"POST",url:"/api/engagement/pipelines",headers:b,payload:{name:"Funil proibido"}})).statusCode).toBe(403);
      expect((await f.app.inject({method:"POST",url:"/api/engagement/pipelines",headers:manager,payload:{name:"Funil de suporte"}})).statusCode).toBe(201);
    }finally{await f.app.close();f.db.close();}
  });
  it("não modifica oportunidade, envia mensagem ou ativa serviços ao criar etiquetas",async()=>{
    const f=setup();
    try{
      await f.app.register(cookie);
      f.app.addHook("preHandler",createAdminSessionGuard({sessionSecret:secret,clock:()=>now,team:f.team}));
      await f.app.register(registerEngagementRoutes,{store:f.store,sessionSecret:secret,clock:()=>now});
      await f.app.ready();
      const admin=signed();
      const label=await f.app.inject({method:"POST",url:"/api/engagement/labels",headers:admin,payload:{name:"Retorno urgente"}});
      expect(label.statusCode).toBe(201);
      const marked=await f.app.inject({method:"PUT",url:"/api/engagement/contacts/"+encodeURIComponent(phone)+"/labels",
        headers:admin,payload:{ids:[label.json().id]}});
      expect(marked.statusCode).toBe(200);
      expect(f.store.getContactLabels(phone).map(t=>t.name)).toEqual(["Retorno urgente"]);
      expect(f.db.prepare("SELECT count(*) AS n FROM crm_opportunities").get()).toMatchObject({n:0});
      expect(f.db.prepare("SELECT count(*) AS n FROM automation_followups").get()).toMatchObject({n:0});
    }finally{await f.app.close();f.db.close();}
  });
});

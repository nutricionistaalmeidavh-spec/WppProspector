import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { SqliteConsentStore } from "../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";
import { registerAutomationRoutes } from "./automation.routes.ts";
import { AutomationStore } from "./automation-store.ts";

describe("API de automação", () => {
  it("CRUD com validação de menu, bloqueio de agendamento não autorizado e cancelamento", async () => {
    const db=openDatabase(":memory:");
    const app=Fastify(),consent=new SqliteConsentStore(db);
    await app.register(registerAutomationRoutes,{automation:new AutomationStore(db),consent,followupsEnabled:true});
    const body={name:"Menu inicial",match:"equals",trigger:"menu",response:"Escolha",priority:2,enabled:true,action:"menu",options:[{key:"1",label:"Ajuda",response:"Como ajudar?",handoff:false}]};
    const created=await app.inject({method:"POST",url:"/api/automations/rules",payload:body});
    expect(created.statusCode).toBe(201);
    expect((await app.inject({method:"GET",url:"/api/automations/rules"})).json().items).toHaveLength(1);
    expect((await app.inject({method:"POST",url:"/api/automations/rules",payload:{...body,options:[]}})).statusCode).toBe(422);
    const phone="+5516999999999",dueAt=new Date(Date.now()+300_000).toISOString();
    expect((await app.inject({method:"POST",url:"/api/automations/followups",payload:{phone,message:"Olá",dueAt}})).statusCode).toBe(403);
    consent.grant(phone,"formulario");
    const scheduled=await app.inject({method:"POST",url:"/api/automations/followups",payload:{phone,message:"Olá",dueAt}});
    expect(scheduled.statusCode).toBe(201);
    expect((await app.inject({method:"DELETE",url:"/api/automations/followups/"+scheduled.json().id})).statusCode).toBe(204);
    expect((await app.inject({method:"DELETE",url:"/api/automations/rules/"+created.json().id})).statusCode).toBe(204);
    await app.close();db.close();
  });
});

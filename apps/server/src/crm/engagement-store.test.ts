import { describe, expect, it } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { TeamStore } from "../team/team-store.ts";
import { EngagementStore } from "./engagement-store.ts";

const phone = "+5516999991234";
const at = "2026-11-13T13:00:00.000Z";
function fixture() {
  const db = openDatabase(":memory:");
  db.prepare("INSERT INTO conversation_index (lead_phone,state,lead_intent,turn_count,has_pending_inbound,updated_at) VALUES (?,'awaitingHuman','unknown',0,1,?)").run(phone,at);
  db.prepare("INSERT INTO leads (phone,prospecting_state,created_at,updated_at) VALUES (?,'pending',?,?)").run(phone,at,at);
  const team = new TeamStore(db,()=>new Date(at));
  const alice=team.create({username:"alice",password:"PasswordStrong!123",role:"agent"});
  const bob=team.create({username:"bob",password:"PasswordStrong!123",role:"agent"});
  return {db, alice,bob,store:new EngagementStore(db,()=>new Date(at))};
}
describe("Central de atendimento, sem dados externos ou mensagens",()=>{
  it("permite assumir fila livre, impede roubo entre agentes e registra transferência auditável",()=>{
    const {db,alice,bob,store}=fixture();
    try{
      const first=store.assign(phone,{role:"agent",userId:alice.id},{ownerId:alice.id,department:"Comercial"});
      expect(first.ownerId).toBe(alice.id);
      expect(()=>store.assign(phone,{role:"agent",userId:bob.id},{ownerId:bob.id,department:"Comercial"})).toThrow();
      const next=store.assign(phone,{role:"manager",userId:bob.id},{ownerId:bob.id,department:"Suporte"});
      expect(next.ownerId).toBe(bob.id);
      expect(next.department).toBe("Suporte");
      expect(store.history(phone)).toHaveLength(2);
      expect(store.metrics().byAgent.find(x=>x.ownerId===bob.id)?.assigned).toBe(1);
    } finally {db.close();}
  });
  it("mantém etiquetas e campos personalizados atrelados ao telefone canônico",()=>{
    const {db,store}=fixture();
    try{
      const label=store.createLabel("Prioritário");
      store.setContactLabels(phone,[label.id]);
      expect(store.getContactLabels(phone).map(x=>x.name)).toEqual(["Prioritário"]);
      const field=store.createField({entity:"lead",name:"Origem do evento",kind:"text"});
      store.setFieldValue({entity:"lead",entityId:phone,fieldId:field.id,value:"Feira regional"});
      expect(store.getFieldValues("lead",phone).map(x=>x.value)).toEqual(["Feira regional"]);
    } finally {db.close();}
  });
  it("cria pipeline separado, preserva etapa canônica ao mover e registra histórico por estágio",()=>{
    const {db,store}=fixture();
    try{
      db.prepare("INSERT INTO crm_companies (id,name,created_at,updated_at) VALUES ('company','Empresa',?,?)").run(at,at);
      db.prepare("INSERT INTO crm_opportunities (id,title,company_id,lead_phone,stage,created_at,updated_at) VALUES ('deal','Projeto','company',?,'new',?,?)").run(phone,at,at);
      const pipeline=store.createPipeline("Pré-vendas");
      const extra=store.createStage(pipeline.id,{name:"Aguardando documentos",baseStage:"qualified"});
      const moved=store.moveOpportunity("deal",pipeline.id,extra.id);
      expect(moved.pipelineId).toBe(pipeline.id);
      expect(moved.pipelineStageId).toBe(extra.id);
      expect(db.prepare("SELECT stage FROM crm_opportunities WHERE id='deal'").get()).toMatchObject({stage:"qualified"});
      expect(store.stageHistory("deal")).toHaveLength(1);
      expect(store.listPipelineOpportunities(pipeline.id).map(x=>x.id)).toEqual(["deal"]);
    } finally {db.close();}
  });
});

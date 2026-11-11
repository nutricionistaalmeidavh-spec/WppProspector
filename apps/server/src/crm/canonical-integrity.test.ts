import {describe,expect,it} from "vitest";
import {openDatabase} from "../shared/persistence/sqlite/open-database.ts";
import {CrmStore} from "./crm-store.ts";
import {TeamStore} from "../team/team-store.ts";
import {AutomationStore} from "../automation/automation-store.ts";
import {SqliteConsentStore} from "../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";

const PHONE="+5516999888777";
const at="2026-11-11T14:00:00.000Z";
function fixture(){
 const db=openDatabase(":memory:");
 const store=new CrmStore(db,()=>new Date(at));
 db.prepare("INSERT INTO leads(phone,display_name,company,prospecting_state,source,created_at,updated_at) VALUES(?,?,?,'pending',?,?,?)")
 .run(PHONE,"Nome anterior","Nome livre","planilha",at,at);
 const company=store.createCompany({name:"Empresa A"});
 const opportunity=store.createOpportunity({title:"Implantação",companyId:company.id,leadPhone:PHONE,estimatedValue:2000,owner:"Comercial"});
 return {db,store,company,opportunity};
}
describe("P0 - integridade canônica entre módulos",()=>{
 it("nome do cliente e empresa vêm do lead atual e company_id, não de snapshots textuais",()=>{
  const {db,store,company}=fixture();
  try{
   const customer=store.convertLeadToCustomer(PHONE);
   db.prepare("UPDATE leads SET display_name='Nome novo',company='Empresa incorreta' WHERE phone=?").run(PHONE);
   expect(store.listCustomers().find(x=>x.id===customer.id)).toMatchObject({
    name:"Nome novo",companyId:company.id,leadPhone:PHONE,
   });
   expect(store.getOpportunityHistory).toBeDefined();
  }finally{db.close();}
 });
 it("campanhas não atribuem envio ou resposta global sem evidência de envio próprio",()=>{
  const {db,store}=fixture();
  try{
   const a=store.createCampaign({name:"Campanha A"});
   const b=store.createCampaign({name:"Campanha B"});
   store.addCampaignMembers(a.id,[PHONE]);store.addCampaignMembers(b.id,[PHONE]);
   db.prepare("UPDATE leads SET prospecting_state='replied' WHERE phone=?").run(PHONE);
   expect(store.listCampaigns().find(x=>x.id===a.id)).toMatchObject({sent:0,replied:0,failed:0});
   expect(store.listCampaigns().find(x=>x.id===b.id)).toMatchObject({sent:0,replied:0,failed:0});
   store.recordCampaignSend(a.id,PHONE,"wamid.test.1");
   expect(store.recordCampaignReply(PHONE)).toBe(true);
   expect(store.recordCampaignReply(PHONE)).toBe(false);
   expect(store.listCampaigns().find(x=>x.id===a.id)).toMatchObject({sent:1,replied:1});
   expect(store.listCampaigns().find(x=>x.id===b.id)).toMatchObject({sent:0,replied:0});
  }finally{db.close();}
 });
 it("vínculo de oportunidade com campanha requer associação real do lead ao público",()=>{
  const {db,store,company,opportunity}=fixture();
  try{
   const campaign=store.createCampaign({name:"Sem público"});
   expect(()=>store.createOpportunity({title:"Nova venda",companyId:company.id,
     leadPhone:PHONE,campaignId:campaign.id})).toThrow("Lead não pertence à campanha.");
   expect(()=>store.updateOpportunity(opportunity.id,{campaignId:campaign.id}))
     .toThrow("Lead não pertence à campanha.");
   store.addCampaignMembers(campaign.id,[PHONE]);
   expect(store.updateOpportunity(opportunity.id,{campaignId:campaign.id})?.campaignId).toBe(campaign.id);
  }finally{db.close();}
 });
 it("responsável é usuário canônico por UUID, renomeado sem alterar oportunidades nem atividades",()=>{
  const {db,store,opportunity}=fixture();
  try{
   const user=new TeamStore(db).create({username:"alfa",password:"SenhaBemForte!2026",role:"agent"});
   store.updateOpportunity(opportunity.id,{ownerUserId:user.id});
   const task=store.createActivity({opportunityId:opportunity.id,kind:"CALL",
    subject:"Ligar",dueAt:"2026-11-12",ownerUserId:user.id});
   db.prepare("UPDATE crm_team_users SET username='beta' WHERE id=?").run(user.id);
   expect(store.getOpportunity(opportunity.id)).toMatchObject({owner:"beta",ownerUserId:user.id});
   expect(store.getActivity(task.id)).toMatchObject({owner:"beta",ownerUserId:user.id});
   expect(store.commercialReport().byOwner.find(x=>x.name==="beta")?.total).toBe(1);
  }finally{db.close();}
 });
 it("atividade vinculada ao follow-up reflete envio e fica concluída uma única vez",()=>{
  const {db,store,opportunity}=fixture();
  try{
   const consent=new SqliteConsentStore(db);consent.grant(PHONE,"formulario",new Date(at));
   const automation=new AutomationStore(db,()=>new Date(at));
   const followup=automation.scheduleFollowup({phone:PHONE,message:"Retornar",
    dueAt:"2026-11-12T11:00:00.000Z"},consent);
   const task=store.createActivity({opportunityId:opportunity.id,kind:"WHATSAPP",
    subject:"Acompanhar retorno",dueAt:"2026-11-12",followupId:followup.id});
   expect(store.getActivity(task.id)?.followupState).toBe("pending");
   expect(automation.claim(followup.id)).toBe(true);automation.markSent(followup.id);
   expect(store.getActivity(task.id)).toMatchObject({status:"DONE",followupState:"sent"});
  }finally{db.close();}
 });
 it("orçamento tem valor cotado próprio e analytics prioriza cotação sem alterar estimativa",()=>{
  const {db,store,opportunity}=fixture();
  try{
   store.createQuote({opportunityId:opportunity.id,items:[{description:"Setup",quantity:1,unitPrice:350}]});
   expect(store.getOpportunity(opportunity.id)?.estimatedValue).toBe(2000);
   expect(store.commercialReport().openValue).toBe(350);
   expect(store.listCompanies()[0]?.pipelineValue).toBe(350);
  }finally{db.close();}
 });
});

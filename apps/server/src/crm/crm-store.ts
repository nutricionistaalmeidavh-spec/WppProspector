import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const CRM_STAGES = ["new","contacted","replied","qualified","meeting","proposal","negotiation","won","lost"] as const;
export type Stage = typeof CRM_STAGES[number];
export type CampaignStatus = "draft" | "running" | "paused" | "completed";
export interface CompanyInput { name:string; city?:string; segment?:string }
export interface CampaignInput { name:string; status?:CampaignStatus }
export interface OpportunityInput {
  title:string; companyId:string; leadPhone:string; stage?:Stage; estimatedValue?:number;
  owner?:string; nextAction?:string; nextActionAt?:string;
  campaignId?:string|null; source?:string; qualification?:string;
}
export interface Company extends Required<CompanyInput> {
  id:string; leadCount:number; opportunityCount:number; pipelineValue:number;
}
export interface Opportunity extends Required<Omit<OpportunityInput,"stage"|"estimatedValue"|"campaignId">> {
  id:string; stage:Stage; estimatedValue:number; companyName:string; leadName:string;
  createdAt:string; campaignId?:string; campaignName?:string;
}
export interface Campaign {
  id:string; name:string; status:CampaignStatus; audience:number; sent:number; replied:number;
  qualified:number; opportunities:number; won:number; failed:number; startedAt?:string;
}

type Row = Record<string, unknown>;
const str=(r:Row,k:string)=>String(r[k]??"");
const euro=(n:unknown)=>Number(n??0)/100;
export class CrmStore {
  constructor(private readonly db:DatabaseSync, private readonly clock:()=>Date=()=>new Date()) {}
  private now(){return this.clock().toISOString();}
  private exists(table:"crm_companies"|"crm_campaigns"|"leads",column:string,id:string){
    return Boolean(this.db.prepare("SELECT 1 FROM "+table+" WHERE "+column+" = ?").get(id));
  }
  listCompanies():Company[]{
    const rows=this.db.prepare(`
      SELECT c.*,
      (SELECT count(*) FROM leads l WHERE lower(trim(l.company))=lower(trim(c.name))) AS lead_count,
      (SELECT count(*) FROM crm_opportunities o WHERE o.company_id=c.id) AS opportunity_count,
      (SELECT coalesce(sum(o.estimated_cents),0) FROM crm_opportunities o WHERE o.company_id=c.id AND o.stage NOT IN ('lost','won')) AS pipeline_cents
      FROM crm_companies c ORDER BY c.name COLLATE NOCASE, c.id LIMIT 500`).all() as Row[];
    return rows.map(r=>({id:str(r,"id"),name:str(r,"name"),city:str(r,"city"),segment:str(r,"segment"),
      leadCount:Number(r.lead_count),opportunityCount:Number(r.opportunity_count),pipelineValue:euro(r.pipeline_cents)}));
  }
  createCompany(data:CompanyInput):Company{
    const id=randomUUID(),at=this.now();
    this.db.prepare("INSERT INTO crm_companies(id,name,city,segment,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(id,data.name.trim(),data.city?.trim()??"",data.segment?.trim()??"",at,at);
    return this.listCompanies().find(c=>c.id===id)!;
  }
  updateCompany(id:string,patch:Partial<CompanyInput>):Company|null{
    const old=this.db.prepare("SELECT * FROM crm_companies WHERE id=?").get(id) as Row|undefined;
    if(!old)return null;
    this.db.prepare("UPDATE crm_companies SET name=?,city=?,segment=?,updated_at=? WHERE id=?")
      .run(patch.name??str(old,"name"),patch.city??str(old,"city"),patch.segment??str(old,"segment"),this.now(),id);
    return this.listCompanies().find(c=>c.id===id)??null;
  }
  listOpportunities():Opportunity[]{
    const rows=this.db.prepare(`
      SELECT o.*,c.name AS company_name,l.display_name AS lead_name,
      cp.name AS campaign_name
      FROM crm_opportunities o JOIN crm_companies c ON c.id=o.company_id
      JOIN leads l ON l.phone=o.lead_phone
      LEFT JOIN crm_campaigns cp ON cp.id=o.campaign_id
      ORDER BY o.updated_at DESC,o.id LIMIT 500`).all() as Row[];
    return rows.map(r=>this.opportunityRow(r));
  }
  getOpportunity(id:string):Opportunity|null{
    const row=this.db.prepare(`
      SELECT o.*,c.name AS company_name,l.display_name AS lead_name,cp.name AS campaign_name
      FROM crm_opportunities o JOIN crm_companies c ON c.id=o.company_id JOIN leads l ON l.phone=o.lead_phone
      LEFT JOIN crm_campaigns cp ON cp.id=o.campaign_id WHERE o.id=?`).get(id) as Row|undefined;
    return row?this.opportunityRow(row):null;
  }
  private opportunityRow(r:Row):Opportunity{
    return {
      id:str(r,"id"),title:str(r,"title"),companyId:str(r,"company_id"),companyName:str(r,"company_name"),
      leadName:str(r,"lead_name")||str(r,"lead_phone"),leadPhone:str(r,"lead_phone"),
      stage:r.stage as Stage,estimatedValue:euro(r.estimated_cents),
      owner:str(r,"owner"),nextAction:str(r,"next_action"),nextActionAt:str(r,"next_action_at"),
      ...(r.campaign_id?{campaignId:str(r,"campaign_id"),campaignName:str(r,"campaign_name")}:{}),
      qualification:str(r,"qualification"),source:str(r,"source"),createdAt:str(r,"created_at"),
    };
  }
  createOpportunity(input:OpportunityInput):Opportunity{
    if(!this.exists("crm_companies","id",input.companyId))throw new Error("Empresa não encontrada.");
    if(!this.exists("leads","phone",input.leadPhone))throw new Error("Lead não encontrado; cadastre ou importe primeiro.");
    if(input.campaignId&&!this.exists("crm_campaigns","id",input.campaignId))throw new Error("Campanha não encontrada.");
    const id=randomUUID(),at=this.now(),stage=input.stage??"new";
    this.db.exec("BEGIN");
    try{
      this.db.prepare(`INSERT INTO crm_opportunities
      (id,title,company_id,lead_phone,stage,estimated_cents,owner,next_action,next_action_at,campaign_id,source,qualification,created_at,updated_at,won_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id,input.title.trim(),input.companyId,input.leadPhone,stage,Math.round((input.estimatedValue??0)*100),
          input.owner??"",input.nextAction??"",input.nextActionAt??"",input.campaignId??null,input.source??"",
          input.qualification??"",at,at,stage==="won"?at:null);
      this.db.prepare("INSERT INTO crm_stage_events(id,opportunity_id,from_stage,to_stage,occurred_at) VALUES(?,?,?,?,?)")
        .run(randomUUID(),id,null,stage,at);
      this.db.exec("COMMIT");
    }catch(e){this.db.exec("ROLLBACK");throw e;}
    return this.getOpportunity(id)!;
  }
  updateOpportunity(id:string,patch:Partial<OpportunityInput>):Opportunity|null{
    const old=this.db.prepare("SELECT * FROM crm_opportunities WHERE id=?").get(id) as Row|undefined;
    if(!old)return null;
    const companyId=patch.companyId??str(old,"company_id");
    const leadPhone=patch.leadPhone??str(old,"lead_phone");
    const campaignId=patch.campaignId===undefined?old.campaign_id:patch.campaignId;
    if(!this.exists("crm_companies","id",companyId))throw new Error("Empresa não encontrada.");
    if(!this.exists("leads","phone",leadPhone))throw new Error("Lead não encontrado.");
    if(campaignId&&!this.exists("crm_campaigns","id",String(campaignId)))throw new Error("Campanha não encontrada.");
    const stage=patch.stage??old.stage as Stage,at=this.now();
    const wonAt=stage==="won"?(old.stage==="won"?old.won_at:at):null;
    this.db.exec("BEGIN");
    try{
      this.db.prepare(`UPDATE crm_opportunities SET title=?,company_id=?,lead_phone=?,stage=?,estimated_cents=?,
      owner=?,next_action=?,next_action_at=?,campaign_id=?,source=?,qualification=?,updated_at=?,won_at=? WHERE id=?`)
        .run(patch.title??str(old,"title"),companyId,leadPhone,stage,
          patch.estimatedValue===undefined?Number(old.estimated_cents):Math.round(patch.estimatedValue*100),
          patch.owner??str(old,"owner"),patch.nextAction??str(old,"next_action"),
          patch.nextActionAt??str(old,"next_action_at"),campaignId??null,
          patch.source??str(old,"source"),patch.qualification??str(old,"qualification"),at,wonAt??null,id);
      if(stage!==old.stage)this.db.prepare("INSERT INTO crm_stage_events(id,opportunity_id,from_stage,to_stage,occurred_at) VALUES(?,?,?,?,?)")
        .run(randomUUID(),id,old.stage as string,stage,at);
      this.db.exec("COMMIT");
    }catch(e){this.db.exec("ROLLBACK");throw e;}
    return this.getOpportunity(id);
  }
  getOpportunityHistory(id:string):Array<{fromStage:string|null;toStage:string;occurredAt:string}>{
    const rows=this.db.prepare("SELECT from_stage,to_stage,occurred_at FROM crm_stage_events WHERE opportunity_id=? ORDER BY occurred_at,rowid").all(id) as Row[];
    return rows.map(r=>({fromStage:r.from_stage==null?null:String(r.from_stage),toStage:str(r,"to_stage"),occurredAt:str(r,"occurred_at")}));
  }
  createCampaign(data:CampaignInput):Campaign{
    const id=randomUUID(),at=this.now(),status=data.status??"draft";
    this.db.prepare("INSERT INTO crm_campaigns(id,name,status,started_at,created_at,updated_at) VALUES(?,?,?,?,?,?)")
      .run(id,data.name.trim(),status,status==="running"?at:null,at,at);
    return this.listCampaigns().find(c=>c.id===id)!;
  }
  updateCampaign(id:string,patch:Partial<CampaignInput>):Campaign|null{
    const old=this.db.prepare("SELECT * FROM crm_campaigns WHERE id=?").get(id) as Row|undefined;
    if(!old)return null;
    const status=patch.status??old.status as CampaignStatus,at=this.now();
    this.db.prepare("UPDATE crm_campaigns SET name=?,status=?,started_at=?,updated_at=? WHERE id=?")
      .run(patch.name??str(old,"name"),status,status==="running"?(old.started_at??at):old.started_at,at,id);
    return this.listCampaigns().find(c=>c.id===id)??null;
  }
  listCampaigns():Campaign[]{
    const rows=this.db.prepare(`
      SELECT c.*,
      (SELECT count(*) FROM crm_campaign_members m WHERE m.campaign_id=c.id) AS audience,
      (SELECT count(*) FROM crm_campaign_members m JOIN leads l ON l.phone=m.lead_phone WHERE m.campaign_id=c.id AND l.prospecting_state IN ('sent','replied')) AS sent,
      (SELECT count(*) FROM crm_campaign_members m JOIN leads l ON l.phone=m.lead_phone WHERE m.campaign_id=c.id AND l.prospecting_state='replied') AS replied,
      (SELECT count(*) FROM crm_campaign_members m JOIN leads l ON l.phone=m.lead_phone WHERE m.campaign_id=c.id AND l.prospecting_state='failed') AS failed,
      (SELECT count(*) FROM crm_opportunities o WHERE o.campaign_id=c.id) AS opportunities,
      (SELECT count(*) FROM crm_opportunities o WHERE o.campaign_id=c.id AND o.stage IN ('qualified','meeting','proposal','negotiation','won')) AS qualified,
      (SELECT count(*) FROM crm_opportunities o WHERE o.campaign_id=c.id AND o.stage='won') AS won
      FROM crm_campaigns c ORDER BY c.created_at DESC,c.id LIMIT 500`).all() as Row[];
    return rows.map(r=>({
      id:str(r,"id"),name:str(r,"name"),status:r.status as CampaignStatus,
      audience:Number(r.audience),sent:Number(r.sent),replied:Number(r.replied),failed:Number(r.failed),
      opportunities:Number(r.opportunities),qualified:Number(r.qualified),won:Number(r.won),
      ...(r.started_at?{startedAt:str(r,"started_at")}:{})
    }));
  }
  addCampaignMembers(campaignId:string,phones:string[]):{added:number;missing:string[]}{
    if(!this.exists("crm_campaigns","id",campaignId))throw new Error("Campanha não encontrada.");
    let added=0;const missing:string[]=[];
    this.db.exec("BEGIN");
    try{
      for(const phone of new Set(phones)){
        if(!this.exists("leads","phone",phone)){missing.push(phone);continue;}
        const result=this.db.prepare("INSERT OR IGNORE INTO crm_campaign_members(campaign_id,lead_phone,added_at) VALUES(?,?,?)")
          .run(campaignId,phone,this.now());
        added+=Number(result.changes);
      }
      this.db.exec("COMMIT");
    }catch(e){this.db.exec("ROLLBACK");throw e;}
    return {added,missing};
  }
  listCampaignMembers(id:string):string[]{
    return (this.db.prepare("SELECT lead_phone FROM crm_campaign_members WHERE campaign_id=? ORDER BY added_at,lead_phone").all(id) as Row[])
      .map(r=>str(r,"lead_phone"));
  }
  removeCampaignMember(id:string,phone:string):boolean{
    return Number(this.db.prepare("DELETE FROM crm_campaign_members WHERE campaign_id=? AND lead_phone=?").run(id,phone).changes)>0;
  }
  conversionMetrics(){
    const rows=this.db.prepare("SELECT stage,estimated_cents FROM crm_opportunities").all() as Row[];
    const qualified=new Set(["qualified","meeting","proposal","negotiation","won"]);
    const proposal=new Set(["proposal","negotiation","won"]);
    return {total:rows.length,qualified:rows.filter(r=>qualified.has(str(r,"stage"))).length,
      proposal:rows.filter(r=>proposal.has(str(r,"stage"))).length,
      won:rows.filter(r=>r.stage==="won").length,
      wonValue:rows.filter(r=>r.stage==="won").reduce((n,r)=>n+Number(r.estimated_cents),0)/100,
      stages:Object.fromEntries(CRM_STAGES.map(stage=>[stage,rows.filter(r=>r.stage===stage).length]))};
  }
}

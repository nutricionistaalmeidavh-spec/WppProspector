import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { CRM_STAGES, type Stage } from "./crm-store.ts";

type Row = Record<string, unknown>;
export type Actor = { role:"admin"|"manager"|"agent"; userId?:string };
export type Assignment = { phone:string; ownerId:string|null; ownerName:string|null; department:string; updatedAt:string };
export type PipelineStage = { id:string;pipelineId:string;name:string;baseStage:Stage;position:number };
export type Pipeline = { id:string;name:string;isDefault:boolean;stages:PipelineStage[] };
const s=(row:Row,key:string)=>String(row[key]??"");
const isStage=(v:string):v is Stage=>(CRM_STAGES as readonly string[]).includes(v);

export class EngagementStore {
  constructor(private readonly db:DatabaseSync,private readonly clock:()=>Date=()=>new Date()) {}
  private now(){return this.clock().toISOString();}
  private contactExists(phone:string):boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM leads WHERE phone=?").get(phone) ||
      this.db.prepare("SELECT 1 FROM conversation_index WHERE lead_phone=?").get(phone));
  }
  private account(id:string):{id:string;username:string}|null {
    const row=this.db.prepare("SELECT id,username FROM crm_team_users WHERE id=? AND active=1").get(id) as Row|undefined;
    return row?{id:s(row,"id"),username:s(row,"username")}:null;
  }
  getAssignment(phone:string):Assignment|null {
    const row=this.db.prepare("SELECT a.*,u.username FROM crm_conversation_assignments a LEFT JOIN crm_team_users u ON u.id=a.owner_user_id WHERE a.phone=?")
      .get(phone) as Row|undefined;
    if(!row)return null;
    return {phone,ownerId:row.owner_user_id==null?null:s(row,"owner_user_id"),
      ownerName:row.username==null?null:s(row,"username"),department:s(row,"department"),updatedAt:s(row,"updated_at")};
  }
  listAssignments():Assignment[] {
    const rows=this.db.prepare("SELECT phone FROM crm_conversation_assignments ORDER BY updated_at DESC LIMIT 1000").all() as Row[];
    return rows.flatMap(row=>{const a=this.getAssignment(s(row,"phone"));return a?[a]:[];});
  }
  assign(phone:string,actor:Actor,input:{ownerId:string|null;department:string}):Assignment {
    if(!this.contactExists(phone))throw new Error("Contato não encontrado.");
    const owner=input.ownerId;
    if(owner!==null&&!this.account(owner))throw new Error("Operador inexistente ou inativo.");
    const current=this.getAssignment(phone);
    const department=input.department.trim()||"Geral";
    if(department.length>80)throw new Error("Departamento excede 80 caracteres.");
    if(actor.role==="agent" && (!actor.userId ||
       (owner!==null&&owner!==actor.userId) ||
       (current?.ownerId&&current.ownerId!==actor.userId) ||
       (current?.department&&current.department!==department)))
      throw new Error("Agente só pode assumir ou liberar seus próprios atendimentos.");
    if(current?.ownerId===owner&&current.department===department)return current;
    const now=this.now();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("INSERT INTO crm_conversation_assignments(phone,owner_user_id,department,assigned_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(phone) DO UPDATE SET owner_user_id=excluded.owner_user_id,department=excluded.department,assigned_at=excluded.assigned_at,updated_at=excluded.updated_at")
        .run(phone,owner,department,now,now);
      this.db.prepare("INSERT INTO crm_assignment_events(id,phone,from_user_id,to_user_id,actor_user_id,actor_role,department,occurred_at) VALUES(?,?,?,?,?,?,?,?)")
        .run(randomUUID(),phone,current?.ownerId??null,owner,actor.userId??null,actor.role,department,now);
      this.db.exec("COMMIT");
    } catch(e){this.db.exec("ROLLBACK");throw e;}
    return this.getAssignment(phone)!;
  }
  history(phone:string) {
    return (this.db.prepare("SELECT from_user_id AS fromUserId,to_user_id AS toUserId,actor_role AS actorRole,department,occurred_at AS occurredAt FROM crm_assignment_events WHERE phone=? ORDER BY occurred_at,rowid").all(phone) as Array<{fromUserId:string|null;toUserId:string|null;actorRole:string;department:string;occurredAt:string}>);
  }
  metrics() {
    const rows=this.db.prepare("SELECT u.id AS ownerId,u.username AS name,count(a.phone) AS assigned,coalesce(sum(CASE WHEN c.state='awaitingHuman' THEN 1 ELSE 0 END),0) AS waiting, (SELECT count(*) FROM crm_opportunities o WHERE o.owner_user_id=u.id) AS opportunities, (SELECT count(*) FROM crm_opportunities o WHERE o.owner_user_id=u.id AND o.stage='won') AS won, (SELECT count(*) FROM crm_assignment_events e WHERE e.to_user_id=u.id AND e.from_user_id IS NOT NULL AND e.from_user_id<>u.id) AS transfersReceived FROM crm_team_users u LEFT JOIN crm_conversation_assignments a ON a.owner_user_id=u.id LEFT JOIN conversation_index c ON c.lead_phone=a.phone WHERE u.active=1 GROUP BY u.id ORDER BY u.username").all() as Row[];
    const unassigned=this.db.prepare("SELECT count(*) AS n FROM conversation_index c LEFT JOIN crm_conversation_assignments a ON a.phone=c.lead_phone WHERE a.owner_user_id IS NULL").get() as {n:number};
    return {unassigned:unassigned.n,byAgent:rows.map(r=>({ownerId:s(r,"ownerId"),name:s(r,"name"),assigned:Number(r.assigned),waiting:Number(r.waiting),opportunities:Number(r.opportunities),won:Number(r.won),transfersReceived:Number(r.transfersReceived)}))};
  }
  createLabel(name:string) {
    const label=name.trim();
    if(label.length<2||label.length>60)throw new Error("Etiqueta deve ter entre 2 e 60 caracteres.");
    const id=randomUUID();
    this.db.prepare("INSERT INTO crm_labels(id,name,created_at) VALUES(?,?,?)").run(id,label,this.now());
    return {id,name:label};
  }
  listLabels() {
    return this.db.prepare("SELECT id,name FROM crm_labels ORDER BY name COLLATE NOCASE").all() as Array<{id:string;name:string}>;
  }
  getContactLabels(phone:string) {
    return this.db.prepare("SELECT t.id,t.name FROM crm_labels t JOIN crm_contact_labels l ON l.label_id=t.id WHERE l.phone=? ORDER BY t.name").all(phone) as Array<{id:string;name:string}>;
  }
  setContactLabels(phone:string,ids:string[]) {
    if(!this.contactExists(phone))throw new Error("Contato não encontrado.");
    const unique=[...new Set(ids)];
    if(unique.length>30)throw new Error("Máximo de 30 etiquetas por contato.");
    this.db.exec("BEGIN");
    try {
      for(const id of unique) {
        if(!this.db.prepare("SELECT 1 FROM crm_labels WHERE id=?").get(id))throw new Error("Etiqueta inexistente.");
      }
      this.db.prepare("DELETE FROM crm_contact_labels WHERE phone=?").run(phone);
      for(const id of unique)this.db.prepare("INSERT INTO crm_contact_labels(phone,label_id) VALUES(?,?)").run(phone,id);
      this.db.exec("COMMIT");
    }catch(e){this.db.exec("ROLLBACK");throw e;}
    return this.getContactLabels(phone);
  }
  createField(input:{entity:"lead"|"opportunity";name:string;kind:"text"|"number"|"date"}) {
    const name=input.name.trim();
    if(name.length<2||name.length>80)throw new Error("Nome de campo inválido.");
    const id=randomUUID();
    this.db.prepare("INSERT INTO crm_custom_fields(id,entity,name,kind,created_at) VALUES(?,?,?,?,?)")
      .run(id,input.entity,name,input.kind,this.now());
    return {id,...input,name};
  }
  listFields(entity:"lead"|"opportunity") {
    return this.db.prepare("SELECT id,entity,name,kind FROM crm_custom_fields WHERE entity=? ORDER BY name").all(entity) as Array<{id:string;entity:"lead"|"opportunity";name:string;kind:"text"|"number"|"date"}>;
  }
  private entityExists(entity:"lead"|"opportunity",id:string):boolean {
    const sql=entity==="lead"?"SELECT 1 FROM leads WHERE phone=?":"SELECT 1 FROM crm_opportunities WHERE id=?";
    return Boolean(this.db.prepare(sql).get(id));
  }
  setFieldValue(input:{entity:"lead"|"opportunity";entityId:string;fieldId:string;value:string}) {
    if(!this.entityExists(input.entity,input.entityId))throw new Error("Registro não encontrado.");
    const field=this.db.prepare("SELECT entity,kind FROM crm_custom_fields WHERE id=?").get(input.fieldId) as Row|undefined;
    if(!field||field.entity!==input.entity)throw new Error("Campo personalizado inválido para o registro.");
    const value=input.value.trim();
    if(value.length>2000)throw new Error("Valor muito longo.");
    if(value&&field.kind==="number"&&!Number.isFinite(Number(value)))throw new Error("Número inválido.");
    if(value&&field.kind==="date"&&!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("Data inválida.");
    this.db.prepare("INSERT INTO crm_custom_values(entity,entity_id,field_id,value,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(entity,entity_id,field_id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .run(input.entity,input.entityId,input.fieldId,value,this.now());
    return {fieldId:input.fieldId,value};
  }
  getFieldValues(entity:"lead"|"opportunity",id:string) {
    return this.db.prepare("SELECT v.field_id AS fieldId,f.name,f.kind,v.value FROM crm_custom_values v JOIN crm_custom_fields f ON f.id=v.field_id WHERE v.entity=? AND v.entity_id=? ORDER BY f.name")
      .all(entity,id) as Array<{fieldId:string;name:string;kind:string;value:string}>;
  }
  listPipelines():Pipeline[] {
    const rows=this.db.prepare("SELECT id,name,is_default FROM crm_pipelines ORDER BY is_default DESC,created_at,id").all() as Row[];
    return rows.map(r=>({id:s(r,"id"),name:s(r,"name"),isDefault:Number(r.is_default)===1,stages:this.listStages(s(r,"id"))}));
  }
  private listStages(pipelineId:string):PipelineStage[] {
    return (this.db.prepare("SELECT id,pipeline_id AS pipelineId,name,base_stage AS baseStage,position FROM crm_pipeline_stages WHERE pipeline_id=? ORDER BY position,id").all(pipelineId) as Array<{id:string;pipelineId:string;name:string;baseStage:Stage;position:number}>);
  }
  createPipeline(name:string):Pipeline {
    const clean=name.trim();
    if(clean.length<2||clean.length>100)throw new Error("Nome do funil inválido.");
    const id=randomUUID();
    const source=this.listStages("default");
    this.db.exec("BEGIN");
    try {
      this.db.prepare("INSERT INTO crm_pipelines(id,name,created_at) VALUES(?,?,?)").run(id,clean,this.now());
      for(const stage of source)this.db.prepare("INSERT INTO crm_pipeline_stages(id,pipeline_id,name,base_stage,position) VALUES(?,?,?,?,?)")
        .run(randomUUID(),id,stage.name,stage.baseStage,stage.position);
      this.db.exec("COMMIT");
    }catch(e){this.db.exec("ROLLBACK");throw e;}
    return this.listPipelines().find(p=>p.id===id)!;
  }
  createStage(pipelineId:string,input:{name:string;baseStage:Stage}):PipelineStage {
    if(!this.db.prepare("SELECT 1 FROM crm_pipelines WHERE id=?").get(pipelineId))throw new Error("Funil inexistente.");
    const name=input.name.trim();
    if(name.length<2||name.length>100||!isStage(input.baseStage))throw new Error("Etapa inválida.");
    const id=randomUUID();
    const row=this.db.prepare("SELECT coalesce(max(position),-1)+1 AS next FROM crm_pipeline_stages WHERE pipeline_id=?").get(pipelineId) as {next:number};
    this.db.prepare("INSERT INTO crm_pipeline_stages(id,pipeline_id,name,base_stage,position) VALUES(?,?,?,?,?)").run(id,pipelineId,name,input.baseStage,row.next);
    return this.listStages(pipelineId).find(stage=>stage.id===id)!;
  }
  renameStage(stageId:string,name:string):PipelineStage {
    const clean=name.trim();
    if(clean.length<2||clean.length>100)throw new Error("Nome da etapa inválido.");
    this.db.prepare("UPDATE crm_pipeline_stages SET name=? WHERE id=?").run(clean,stageId);
    const row=this.db.prepare("SELECT pipeline_id AS pipelineId FROM crm_pipeline_stages WHERE id=?").get(stageId) as {pipelineId:string}|undefined;
    if(!row)throw new Error("Etapa não encontrada.");
    return this.listStages(row.pipelineId).find(stage=>stage.id===stageId)!;
  }
  moveOpportunity(id:string,pipelineId:string,stageId:string) {
    const old=this.db.prepare("SELECT stage,pipeline_id,pipeline_stage_id,won_at FROM crm_opportunities WHERE id=?").get(id) as Row|undefined;
    if(!old)throw new Error("Oportunidade não encontrada.");
    const stage=this.db.prepare("SELECT base_stage FROM crm_pipeline_stages WHERE id=? AND pipeline_id=?").get(stageId,pipelineId) as Row|undefined;
    if(!stage)throw new Error("Etapa não pertence ao funil.");
    const toStage=s(stage,"base_stage");
    if(!isStage(toStage))throw new Error("Etapa canônica inválida.");
    if(old.pipeline_id===pipelineId && old.pipeline_stage_id===stageId)
      return {id,pipelineId,pipelineStageId:stageId,stage:toStage};
    const at=this.now();
    this.db.exec("BEGIN");
    try {
      this.db.prepare("UPDATE crm_opportunities SET pipeline_id=?,pipeline_stage_id=?,stage=?,won_at=?,updated_at=? WHERE id=?")
        .run(pipelineId,stageId,toStage,toStage==="won"?(old.stage==="won"&&old.won_at?old.won_at:at):null,at,id);
      if(old.stage!==toStage)this.db.prepare("INSERT INTO crm_stage_events(id,opportunity_id,from_stage,to_stage,occurred_at) VALUES(?,?,?,?,?)")
        .run(randomUUID(),id,old.stage,toStage,at);
      this.db.prepare("INSERT INTO crm_pipeline_events(id,opportunity_id,from_pipeline_id,from_stage_id,to_pipeline_id,to_stage_id,occurred_at) VALUES(?,?,?,?,?,?,?)")
        .run(randomUUID(),id,old.pipeline_id,old.pipeline_stage_id,pipelineId,stageId,at);
      this.db.exec("COMMIT");
    }catch(e){this.db.exec("ROLLBACK");throw e;}
    return {id,pipelineId,pipelineStageId:stageId,stage:toStage};
  }
  listPipelineOpportunities(pipelineId:string) {
    return this.db.prepare("SELECT id,pipeline_id AS pipelineId,pipeline_stage_id AS pipelineStageId,stage FROM crm_opportunities WHERE pipeline_id=? ORDER BY updated_at DESC,id LIMIT 1000")
      .all(pipelineId) as Array<{id:string;pipelineId:string;pipelineStageId:string;stage:Stage}>;
  }
  stageHistory(id:string) {
    return this.db.prepare("SELECT from_stage_id AS fromStageId,to_stage_id AS toStageId,to_pipeline_id AS toPipelineId,occurred_at AS occurredAt FROM crm_pipeline_events WHERE opportunity_id=? ORDER BY occurred_at,rowid")
      .all(id);
  }
}

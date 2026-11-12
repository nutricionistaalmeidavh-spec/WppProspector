import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { BotDecisionInput } from "../conversation-engine/domain/bot-decision.ts";
import type { SqliteConsentStore } from "../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";
import { automationEventSchema, conditionGroupSchema, evaluateRules, scopeKey,
  type RuleContext, type RuleEvaluation } from "./rule-evaluator.ts";

export const menuOptionSchema = z.object({
  key: z.string().regex(/^[a-z0-9]{1,8}$/i),
  label: z.string().trim().min(1).max(100),
  response: z.string().trim().min(1).max(4096),
  handoff: z.boolean().default(false),
});
export const ruleInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(100),
  match: z.enum(["equals","contains","starts_with"]),
  trigger: z.string().trim().max(120),
  eventType: automationEventSchema.default("message.received"),
  conditions: conditionGroupSchema.optional(),
  action: z.enum(["reply","menu","handoff"]),
  response: z.string().trim().min(1).max(4096),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(-1000).max(1000).default(0),
  options: z.array(menuOptionSchema).max(8).default([]),
}).superRefine((value,ctx)=>{
  if (value.eventType === "message.received" && !value.trigger) ctx.addIssue({code:"custom",path:["trigger"],message:"Informe o gatilho"});
  if (value.eventType !== "message.received" && value.action === "menu") ctx.addIssue({code:"custom",path:["action"],message:"Menus exigem evento de mensagem"});
  if (value.action === "menu" && value.options.length===0) ctx.addIssue({code:"custom",path:["options"],message:"Menu deve ter pelo menos uma opção"});
  const keys = value.options.map(x=>x.key.toLowerCase());
  if (keys.length!==new Set(keys).size) ctx.addIssue({code:"custom",path:["options"],message:"Chaves duplicadas no menu"});
});
export type RuleInput = z.input<typeof ruleInputSchema>;
export type Rule = z.output<typeof ruleInputSchema> & { id: string; createdAt: string; updatedAt: string };

export const followupInputSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  message: z.string().trim().min(1).max(4096),
  dueAt: z.string().datetime({ offset: true }),
});
export type FollowupInput = z.input<typeof followupInputSchema>;
export interface Followup {
  id: string; phone: string; message: string; dueAt: string;
  state: "pending"|"sending"|"sent"|"cancelled"|"failed";
  attempts: number; nextAttemptAt: string | null; lastError: string | null;
}

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");

/** Templates textuais apenas com variáveis explícitas e valores locais. */
export function renderAutomationTemplate(source:string, phone:string, inboundText:string):string {
  return source.replace(/\{(telefone|mensagem)\}/g, (_token:string,key:string)=>
    key==="telefone" ? phone : inboundText.slice(0,500));
}
function decision(replyMessages: string[], handoffToHuman = false): BotDecisionInput {
  return {
    replyMessages, endConversation: false, leadIntent: "needs_more_info",
    leadQualification: null, handoffToHuman, reasoning: "Automação determinística configurada.",
    recommendedModules: [], interestedModules: [], quotedPlan: null,
  };
}

export class AutomationStore {
  constructor(private readonly db: DatabaseSync, private readonly clock = () => new Date()) {}

  listRules(): Rule[] {
    const rows = this.db.prepare("SELECT * FROM automation_rules ORDER BY priority DESC, created_at, id").all() as Record<string,unknown>[];
    return rows.map(r=>this.ruleRow(r));
  }
  saveRule(raw: RuleInput): Rule {
    const rule = ruleInputSchema.parse(raw);
    const now = this.clock().toISOString(), id = rule.id ?? randomUUID();
    this.db.prepare(`INSERT INTO automation_rules
      (id,name,match_type,trigger_text,action,response_text,options_json,enabled,priority,created_at,updated_at,event_type,conditions_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,match_type=excluded.match_type,trigger_text=excluded.trigger_text,
      action=excluded.action,response_text=excluded.response_text,options_json=excluded.options_json,
      enabled=excluded.enabled,priority=excluded.priority,updated_at=excluded.updated_at,
      event_type=excluded.event_type,conditions_json=excluded.conditions_json`)
      .run(id,rule.name,rule.match,rule.trigger,rule.action,rule.response,JSON.stringify(rule.options),
        Number(rule.enabled),rule.priority,now,now,rule.eventType,JSON.stringify(rule.conditions??null));
    const row=this.db.prepare("SELECT * FROM automation_rules WHERE id=?").get(id) as Record<string,unknown>;
    return this.ruleRow(row);
  }
  deleteRule(id:string):boolean {
    return Number(this.db.prepare("DELETE FROM automation_rules WHERE id=?").run(id).changes)>0;
  }

  /** Entradas reais gravam estado e auditoria; as simulações usam evaluateRules diretamente, sem efeitos. */
  evaluate(phone:string, text:string, scope?:{businessId?:string;channelId?:string}):BotDecisionInput|null {
    const context:RuleContext = {phone,message:text,eventType:"message.received",
      businessId:scope?.businessId??"default",channelId:scope?.channelId??"default"};
    const key=scopeKey(context), now=this.clock().toISOString();
    const session=this.db.prepare("SELECT rule_id,expires_at FROM automation_menu_sessions_scoped WHERE scope_key=?")
      .get(key) as {rule_id:string;expires_at:string}|undefined;
    const result=evaluateRules(this.listRules(),context,session&&session.expires_at>now?session.rule_id:null);
    if(session)this.db.prepare("DELETE FROM automation_menu_sessions_scoped WHERE scope_key=?").run(key);
    if(result.nextMenuRuleId){
      this.db.prepare(`INSERT INTO automation_menu_sessions_scoped(scope_key,rule_id,created_at,expires_at)
        VALUES(?,?,?,?) ON CONFLICT(scope_key) DO UPDATE SET
        rule_id=excluded.rule_id,created_at=excluded.created_at,expires_at=excluded.expires_at`)
        .run(key,result.nextMenuRuleId,now,new Date(this.clock().getTime()+86400000).toISOString());
    }
    this.audit(context,result);
    return result.decision;
  }

  /** Eventos de CRM/comércio são interpretados, mas nunca enviam mensagens implicitamente. */
  evaluateEvent(context:RuleContext):RuleEvaluation {
    if(context.eventType==="message.received")throw new Error("Use evaluate() para mensagens reais.");
    const result=evaluateRules(this.listRules(),context,null);
    this.audit(context,result);
    return result;
  }

  recentExecutions(limit=50):Array<{ruleId:string|null;eventType:string;source:string;at:string}> {
    const rows=this.db.prepare(`SELECT rule_id,event_type,source,occurred_at
      FROM automation_rule_executions ORDER BY occurred_at DESC,id DESC LIMIT ?`)
      .all(Math.min(Math.max(1,limit),200)) as Array<{rule_id:string|null;event_type:string;source:string;occurred_at:string}>;
    return rows.map(row=>({ruleId:row.rule_id,eventType:row.event_type,source:row.source,at:row.occurred_at}));
  }

  private audit(context:RuleContext,result:RuleEvaluation):void {
    if(result.source==="none")return;
    this.db.prepare(`INSERT INTO automation_rule_executions(id,rule_id,scope_key,event_type,source,occurred_at)
      VALUES(?,?,?,?,?,?)`).run(randomUUID(),result.matchedRuleId,scopeKey(context),
        context.eventType,result.source,this.clock().toISOString());
  }

  scheduleFollowup(raw:FollowupInput,consent:SqliteConsentStore):Followup {
    const value=followupInputSchema.parse(raw);
    if(!consent.canProspect(value.phone))throw new Error("Agendamento exige consentimento vigente.");
    const now=this.clock().toISOString(),id=randomUUID();
    this.db.prepare(`INSERT INTO automation_followups
      (id,phone,message,due_at,state,attempts,created_at,updated_at) VALUES (?,?,?,?,'pending',0,?,?)`)
      .run(id,value.phone,value.message,new Date(value.dueAt).toISOString(),now,now);
    return this.getFollowup(id)!;
  }
  listFollowups():Followup[]{
    return (this.db.prepare("SELECT * FROM automation_followups ORDER BY created_at DESC,id DESC LIMIT 200").all() as Record<string,unknown>[])
      .map(row=>this.followupRow(row));
  }
  getFollowup(id:string):Followup|null{
    const row=this.db.prepare("SELECT * FROM automation_followups WHERE id=?").get(id) as Record<string,unknown>|undefined;
    return row?this.followupRow(row):null;
  }
  cancelFollowup(id:string):boolean{
    return Number(this.db.prepare(`UPDATE automation_followups SET state='cancelled',updated_at=?
      WHERE id=? AND state IN ('pending','sending')`).run(this.clock().toISOString(),id).changes)>0;
  }
  cancelForReply(phone:string):number{
    return Number(this.db.prepare(`UPDATE automation_followups SET state='cancelled',updated_at=?
      WHERE phone=? AND state='pending'`).run(this.clock().toISOString(),phone).changes);
  }
  due(limit=50):Followup[]{
    const rows=this.db.prepare(`SELECT * FROM automation_followups WHERE state='pending'
      AND due_at<=? AND (next_attempt_at IS NULL OR next_attempt_at<=?)
      ORDER BY due_at,id LIMIT ?`).all(this.clock().toISOString(),this.clock().toISOString(),limit) as Record<string,unknown>[];
    return rows.map(row=>this.followupRow(row));
  }
  claim(id:string):boolean{
    return Number(this.db.prepare(`UPDATE automation_followups SET state='sending',attempts=attempts+1,updated_at=?
      WHERE id=? AND state='pending'`).run(this.clock().toISOString(),id).changes)===1;
  }
  markSent(id:string):void{
    this.db.prepare(`UPDATE automation_followups SET state='sent',sent_at=?,updated_at=?,last_error=NULL WHERE id=? AND state='sending'`)
      .run(this.clock().toISOString(),this.clock().toISOString(),id);
  }
  markFailure(id:string,err:unknown):void{
    const item=this.getFollowup(id);if(!item)return;
    const terminal=item.attempts>=4;
    const next=terminal?null:new Date(this.clock().getTime()+Math.min(60_000*2**Math.max(0,item.attempts-1),900_000)).toISOString();
    this.db.prepare(`UPDATE automation_followups SET state=?,next_attempt_at=?,last_error=?,updated_at=?
      WHERE id=? AND state='sending'`).run(terminal?"failed":"pending",next,
      String(err instanceof Error?err.message:err).slice(0,400),this.clock().toISOString(),id);
  }
  recoverStale():void{
    this.db.prepare("UPDATE automation_followups SET state='pending' WHERE state='sending'").run();
  }

  private ruleRow(r:Record<string,unknown>):Rule{
    return {
      id:String(r.id),name:String(r.name),match:r.match_type as Rule["match"],trigger:String(r.trigger_text),
      action:r.action as Rule["action"],response:String(r.response_text),
      options:JSON.parse(String(r.options_json)) as Rule["options"],enabled:Boolean(r.enabled),
      eventType:automationEventSchema.parse(r.event_type??"message.received"),
      ...(r.conditions_json&&r.conditions_json!=="null"?{conditions:conditionGroupSchema.parse(JSON.parse(String(r.conditions_json)))}:{}),
      priority:Number(r.priority),createdAt:String(r.created_at),updatedAt:String(r.updated_at),
    };
  }
  private followupRow(r:Record<string,unknown>):Followup{
    return {
      id:String(r.id),phone:String(r.phone),message:String(r.message),dueAt:String(r.due_at),
      state:r.state as Followup["state"],attempts:Number(r.attempts),
      nextAttemptAt:r.next_attempt_at==null?null:String(r.next_attempt_at),
      lastError:r.last_error==null?null:String(r.last_error),
    };
  }
}

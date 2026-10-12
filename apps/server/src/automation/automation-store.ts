import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { BotDecisionInput } from "../conversation-engine/domain/bot-decision.ts";
import type { SqliteConsentStore } from "../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";

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
  trigger: z.string().trim().min(1).max(120),
  action: z.enum(["reply","menu","handoff"]),
  response: z.string().trim().min(1).max(4096),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(-1000).max(1000).default(0),
  options: z.array(menuOptionSchema).max(8).default([]),
}).superRefine((value,ctx)=>{
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
      (id,name,match_type,trigger_text,action,response_text,options_json,enabled,priority,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,match_type=excluded.match_type,trigger_text=excluded.trigger_text,
      action=excluded.action,response_text=excluded.response_text,options_json=excluded.options_json,
      enabled=excluded.enabled,priority=excluded.priority,updated_at=excluded.updated_at`)
      .run(id,rule.name,rule.match,rule.trigger,rule.action,rule.response,JSON.stringify(rule.options),Number(rule.enabled),rule.priority,now,now);
    const row=this.db.prepare("SELECT * FROM automation_rules WHERE id=?").get(id) as Record<string,unknown>;
    return this.ruleRow(row);
  }
  deleteRule(id:string):boolean {
    return Number(this.db.prepare("DELETE FROM automation_rules WHERE id=?").run(id).changes)>0;
  }

  evaluate(phone:string, text:string):BotDecisionInput|null {
    const normalized=normalize(text);
    const now=this.clock().toISOString();
    const session=this.db.prepare("SELECT rule_id,expires_at FROM automation_menu_sessions WHERE phone=?")
      .get(phone) as {rule_id:string;expires_at:string}|undefined;
    if(session){
      this.db.prepare("DELETE FROM automation_menu_sessions WHERE phone=?").run(phone);
      if(session.expires_at>now){
        const row=this.db.prepare("SELECT * FROM automation_rules WHERE id=? AND enabled=1 AND action='menu'")
          .get(session.rule_id) as Record<string,unknown>|undefined;
        if(row){
          const rule=this.ruleRow(row);
          const option=rule.options.find(o=>normalize(o.key)===normalized);
          if(option)return decision([renderAutomationTemplate(option.response,phone,text)],option.handoff);
          if(normalized!==normalize(rule.trigger)){
            const expires=new Date(this.clock().getTime()+24*60*60*1000).toISOString();
            this.db.prepare("INSERT INTO automation_menu_sessions(phone,rule_id,created_at,expires_at) VALUES (?,?,?,?)")
              .run(phone,rule.id,now,expires);
            return decision([`Opção não reconhecida.\n${renderAutomationTemplate(rule.response,phone,text)}\n${rule.options.map(o=>`${o.key}. ${o.label}`).join("\n")}`]);
          }
        }
      }
    }

    for(const rule of this.listRules()){
      if(!rule.enabled)continue;
      const needle=normalize(rule.trigger);
      const matched=rule.match==="equals" ? normalized===needle
        : rule.match==="starts_with" ? normalized.startsWith(needle)
        : normalized.includes(needle);
      if(!matched)continue;
      if(rule.action==="menu"){
        const expires=new Date(this.clock().getTime()+24*60*60*1000).toISOString();
        this.db.prepare(`INSERT INTO automation_menu_sessions(phone,rule_id,created_at,expires_at) VALUES (?,?,?,?)
          ON CONFLICT(phone) DO UPDATE SET rule_id=excluded.rule_id,created_at=excluded.created_at,expires_at=excluded.expires_at`)
          .run(phone,rule.id,now,expires);
        return decision([`${renderAutomationTemplate(rule.response,phone,text)}\n${rule.options.map(o=>`${o.key}. ${o.label}`).join("\n")}`]);
      }
      return decision([renderAutomationTemplate(rule.response,phone,text)],rule.action==="handoff");
    }
    return null;
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

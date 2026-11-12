import { z } from "zod";
import type { BotDecisionInput } from "../conversation-engine/domain/bot-decision.ts";
import type { Stage } from "../crm/crm-store.ts";

/**
 * Política obrigatória > menus em andamento > regras publicadas > interpretador.
 * Funções puras: a produção e o laboratório usam a MESMA decisão.
 */
export const automationEventSchema = z.enum([
  "message.received", "crm.opportunity_updated", "commerce.inventory_updated",
]);
export type AutomationEventType = z.infer<typeof automationEventSchema>;

export const conditionGroupSchema = z.object({
  match: z.enum(["all", "any"]),
  conditions: z.array(z.object({
    field: z.enum(["message.text", "crm.stage", "commerce.stock", "commerce.sku", "event.type"]),
    op: z.enum(["equals", "contains", "starts_with", "gte", "lte"]),
    value: z.string().trim().max(160),
  }).strict()).min(1).max(12),
}).strict();
export type ConditionGroup = z.infer<typeof conditionGroupSchema>;

export interface EngineRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  match: "equals" | "contains" | "starts_with";
  trigger: string;
  action: "reply" | "menu" | "handoff" | "crm_set_stage";
  targetStage?: Stage;
  response: string;
  options: readonly { key: string; label: string; response: string; handoff: boolean }[];
  eventType?: AutomationEventType;
  conditions?: ConditionGroup | undefined;
}

export interface RuleContext {
  phone: string;
  message: string;
  eventType: AutomationEventType;
  businessId: string;
  channelId: string;
  crmStage?: string;
  crmOpportunityId?: string;
  commerceStock?: number;
  commerceSku?: string;
}
export interface RuleEvaluation {
  decision: BotDecisionInput | null;
  matchedRuleId: string | null;
  nextMenuRuleId: string | null;
  source: "policy" | "menu" | "rule" | "none";
  action: {kind:"crm_set_stage";opportunityId:string;stage:Stage} | null;
}

export function normalizeRuleText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\s+/g, " ").trim();
}

export function scopeKey(context: Pick<RuleContext, "businessId"|"channelId"|"phone">): string {
  // Prefixos explícitos e JSON evitam colisões como "a:b"+"c" vs "a"+"b:c".
  return JSON.stringify([context.businessId, context.channelId, context.phone]);
}

/** Regras comerciais nunca podem sobrepor retirada de consentimento nem pedido de humano. */
export function mandatoryPolicy(message: string): BotDecisionInput | null {
  const normalized = normalizeRuleText(message);
  if (/\b(pare|parem|parar|cancele|cancelar|descadastrar|remova|remover|nao quero mais|nao me envie|nao tenho interesse|sair)\b/.test(normalized)) {
    return decision([], false, true, "opt_out");
  }
  if (/\b(humano|atendente|pessoa real|falar com alguem|falar com uma pessoa)\b/.test(normalized)) {
    return decision(["Vou encaminhar seu atendimento a uma pessoa da equipe."], true);
  }
  return null;
}

function decision(messages: string[], handoff = false, endConversation = false,
  leadIntent: BotDecisionInput["leadIntent"] = "needs_more_info"): BotDecisionInput {
  return {
    replyMessages: messages, handoffToHuman: handoff, endConversation, leadIntent,
    leadQualification: null, reasoning: "Decisão local determinística",
    recommendedModules: [], interestedModules: [], quotedPlan: null,
  };
}

export function renderRuleTemplate(template: string, context: RuleContext): string {
  const fields: Record<string, string> = {
    telefone: context.phone,
    mensagem: context.message.slice(0, 500),
    "crm.etapa": context.crmStage ?? "",
    "estoque.saldo": context.commerceStock == null ? "" : String(context.commerceStock),
    "estoque.sku": context.commerceSku ?? "",
  };
  return template.replace(/\{(telefone|mensagem|crm\.etapa|estoque\.saldo|estoque\.sku)\}/g,
    (_match, key: string) => fields[key] ?? "");
}

function matchText(haystack: string, needle: string, op: "equals"|"contains"|"starts_with"): boolean {
  const text = normalizeRuleText(haystack);
  const target = normalizeRuleText(needle);
  if (!target) return false;
  return op === "equals" ? text === target : op === "starts_with" ? text.startsWith(target) : text.includes(target);
}

function matchesCondition(condition: ConditionGroup["conditions"][number], context: RuleContext): boolean {
  const value = condition.field === "message.text" ? context.message
    : condition.field === "crm.stage" ? context.crmStage
    : condition.field === "commerce.sku" ? context.commerceSku
    : condition.field === "event.type" ? context.eventType
    : context.commerceStock;
  if (value === undefined || value === null) return false;
  if (condition.op === "gte" || condition.op === "lte") {
    const target = Number(condition.value);
    const actual = Number(value);
    if (!Number.isFinite(target) || !Number.isFinite(actual) || condition.value.trim() === "") return false;
    return condition.op === "gte" ? actual >= target : actual <= target;
  }
  return matchText(String(value), condition.value, condition.op);
}

function matches(rule: EngineRule, context: RuleContext): boolean {
  if (!rule.enabled || (rule.eventType ?? "message.received") !== context.eventType) return false;
  if (context.eventType === "message.received" && !matchText(context.message, rule.trigger, rule.match)) return false;
  const conditions = rule.conditions;
  if (!conditions) return true;
  const values = conditions.conditions.map(item => matchesCondition(item, context));
  return conditions.match === "all" ? values.every(Boolean) : values.some(Boolean);
}

export function evaluateRules(rules: readonly EngineRule[], context: RuleContext, activeMenuRuleId: string|null): RuleEvaluation {
  const empty: RuleEvaluation = {decision:null,matchedRuleId:null,nextMenuRuleId:null,source:"none",action:null};
  if (context.eventType === "message.received") {
    const forced = mandatoryPolicy(context.message);
    if (forced) return {decision:forced,matchedRuleId:null,nextMenuRuleId:null,source:"policy",action:null};
  }

  if (activeMenuRuleId && context.eventType === "message.received") {
    const active = rules.find(item => item.id === activeMenuRuleId && item.enabled && item.action === "menu");
    if (active) {
      const selected = active.options.find(item => normalizeRuleText(item.key) === normalizeRuleText(context.message));
      if (selected) return {decision:decision([renderRuleTemplate(selected.response, context)],selected.handoff),
        matchedRuleId:active.id,nextMenuRuleId:null,source:"menu",action:null};
      if (normalizeRuleText(context.message) !== normalizeRuleText(active.trigger)) {
        return {decision:decision(["Opção não reconhecida.\n" + renderRuleTemplate(active.response, context) + "\n" +
          active.options.map(item=>item.key+". "+item.label).join("\n")]),
          matchedRuleId:active.id,nextMenuRuleId:active.id,source:"menu",action:null};
      }
    }
  }

  const ordered = [...rules].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
  const rule = ordered.find(item=>matches(item,context));
  if (!rule) return empty;
  if(rule.action==="crm_set_stage"){
    if(!context.crmOpportunityId||!rule.targetStage)return empty;
    return {decision:decision([]),matchedRuleId:rule.id,nextMenuRuleId:null,source:"rule",
      action:{kind:"crm_set_stage",opportunityId:context.crmOpportunityId,stage:rule.targetStage}};
  }
  const response = renderRuleTemplate(rule.response,context);
  if (rule.action === "menu") {
    return {decision:decision([response+"\n"+rule.options.map(item=>item.key+". "+item.label).join("\n")]),
      matchedRuleId:rule.id,nextMenuRuleId:rule.id,source:"rule",action:null};
  }
  return {decision:decision([response],rule.action==="handoff"),
    matchedRuleId:rule.id,nextMenuRuleId:null,source:"rule",action:null};
}

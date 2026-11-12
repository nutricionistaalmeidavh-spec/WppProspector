import { describe, expect, it } from "vitest";
import { evaluateRules, type EngineRule } from "./rule-evaluator.ts";

const phone = "+5516999999999";
const base: EngineRule = {
  id: "rule-1", name: "Venda", match: "contains", trigger: "comprar",
  action: "reply", response: "Veja nossos produtos", options: [], enabled: true, priority: 10,
  eventType: "message.received",
};
const input = (message: string) => ({
  phone, message, eventType: "message.received" as const, channelId: "baileys:loja-a",
  businessId: "default",
});

describe("Motor de decisões P0-P2", () => {
  it("uma solicitação humana prevalece sobre regra de vendas", () => {
    const result = evaluateRules([base], input("Quero comprar, mas falar com um atendente"), null);
    expect(result.source).toBe("policy");
    expect(result.decision?.handoffToHuman).toBe(true);
    expect(result.decision?.replyMessages).toEqual(["Vou encaminhar seu atendimento a uma pessoa da equipe."]);
  });
  it("opt-out prevalece e não produz resposta automatizada", () => {
    const result = evaluateRules([base], input("Quero comprar, mas pare de me enviar mensagens"), null);
    expect(result.source).toBe("policy");
    expect(result.decision?.endConversation).toBe(true);
    expect(result.decision?.replyMessages).toEqual([]);
  });
  it("não cancela consentimento quando cliente pede cancelamento da compra", () => {
    const result=evaluateRules([base],input("Quero cancelar minha compra"),null);
    expect(result.source).not.toBe("policy");
  });
  it("condições AND/OR usam campos canônicos e ignoram dados ausentes", () => {
    const conditioned: EngineRule = {...base, conditions: {match:"all", conditions:[
      {field:"message.text", op:"contains", value:"comprar"},
      {field:"crm.stage", op:"equals", value:"qualified"},
    ]}};
    expect(evaluateRules([conditioned],input("Quero comprar"),null).decision).toBeNull();
    expect(evaluateRules([conditioned],{...input("Quero comprar"),crmStage:"qualified"},null).matchedRuleId).toBe("rule-1");
    expect(evaluateRules([{...conditioned,conditions:{match:"any",conditions:conditioned.conditions!.conditions}}],input("Quero comprar"),null).matchedRuleId).toBe("rule-1");
  });
  it("eventos de negócio não disparam regras de mensagens", () => {
    const event = {...input("comprar"),eventType:"crm.opportunity_updated" as const,crmStage:"qualified"};
    expect(evaluateRules([base],event,null).decision).toBeNull();
    const relevant:EngineRule = {...base,eventType:"crm.opportunity_updated",trigger:"",match:"equals"};
    expect(evaluateRules([relevant],event,null).matchedRuleId).toBe("rule-1");
  });
  it("menu conserva estado apenas quando solicitado pelo avaliador puro", () => {
    const menu: EngineRule = {...base,trigger:"menu",action:"menu",response:"Escolha",
      options:[{key:"1",label:"Ajuda",response:"Suporte",handoff:false}]};
    const first = evaluateRules([menu],input("menu"),null);
    expect(first.nextMenuRuleId).toBe("rule-1");
    const second = evaluateRules([menu],input("1"),first.nextMenuRuleId);
    expect(second.decision?.replyMessages).toEqual(["Suporte"]);
    expect(second.nextMenuRuleId).toBeNull();
  });
  it("emite ação tipada CRM somente para oportunidade identificada",()=>{
    const rule: EngineRule={...base,eventType:"crm.opportunity_updated",action:"crm_set_stage",
      targetStage:"proposal",trigger:"",response:"",conditions:{match:"all",conditions:[
        {field:"crm.stage",op:"equals",value:"qualified"},
      ]}};
    const context={...input(""),eventType:"crm.opportunity_updated" as const,
      crmOpportunityId:"op-001",crmStage:"qualified"};
    const outcome=evaluateRules([rule],context,null);
    expect(outcome.action).toEqual({kind:"crm_set_stage",opportunityId:"op-001",stage:"proposal"});
    expect(outcome.decision?.replyMessages).toEqual([]);
    expect(evaluateRules([rule],{...context,crmOpportunityId:undefined},null).action).toBeNull();
  });
});

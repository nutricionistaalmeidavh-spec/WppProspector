import { describe, expect, it } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { AutomationStore, renderAutomationTemplate } from "./automation-store.ts";

describe("AutomationStore", () => {
  it("renderiza somente variáveis locais permitidas",()=>{
    expect(renderAutomationTemplate("De {telefone}: {mensagem}; {segredo}", "+5516999999999", "Oi"))
      .toBe("De +5516999999999: Oi; {segredo}");
  });
  it("responde gatilhos com correspondência normalizada por acentos e prioridade", () => {
    const db = openDatabase(":memory:");
    const store = new AutomationStore(db);
    store.saveRule({ name: "geral", match: "contains", trigger: "preço", response: "Lista geral", priority: 1, enabled: true, action: "reply", options: [] });
    store.saveRule({ name: "especial", match: "contains", trigger: "orçamento", response: "Envie os detalhes", priority: 10, enabled: true, action: "reply", options: [] });
    const reply = store.evaluate("+5516999999999", "Quero um ORCAMENTO");
    expect(reply?.replyMessages).toEqual(["Envie os detalhes"]);
    expect(store.evaluate("+5516999999999", "sem correspondência")).toBeNull();
    db.close();
  });

  it("cria menu e navega por opção condicionada à sessão do contato", () => {
    const db = openDatabase(":memory:");
    const store = new AutomationStore(db);
    store.saveRule({
      name: "Boas-vindas", match: "equals", trigger: "menu", priority: 10,
      response: "Escolha uma opção", enabled: true, action: "menu",
      options: [{ key: "1", label: "Suporte", response: "Vou ajudar com suporte", handoff: false }, { key: "2", label: "Atendente", response: "Encaminhando", handoff: true }],
    });
    expect(store.evaluate("+5516999999999", "menu")?.replyMessages[0]).toContain("1. Suporte");
    const handoff = store.evaluate("+5516999999999", "2");
    expect(handoff?.replyMessages).toEqual(["Encaminhando"]);
    expect(handoff?.handoffToHuman).toBe(true);
    expect(store.evaluate("+5516999999999", "2")).toBeNull();
    db.close();
  });

  it("desativação e exclusão tornam o fluxo inoperante", () => {
    const db = openDatabase(":memory:");
    const store = new AutomationStore(db);
    const rule = store.saveRule({ name: "oi", match: "equals", trigger: "oi", response: "Olá", action: "reply", enabled: true, priority: 0, options: [] });
    store.saveRule({ ...rule, enabled: false });
    expect(store.evaluate("+5516999999999", "oi")).toBeNull();
    expect(store.deleteRule(rule.id)).toBe(true);
    expect(store.listRules()).toHaveLength(0);
    db.close();
  });
  it("isola menus pelo canal e registra execução sem conteúdo das mensagens",()=>{
    const db=openDatabase(":memory:");
    try{
      const store=new AutomationStore(db);
      store.saveRule({name:"Menu seguro",match:"equals",trigger:"menu",action:"menu",
        response:"Escolha",options:[{key:"1",label:"Atendimento",response:"Suporte",handoff:false}],
        enabled:true,priority:1});
      store.evaluate("+5516999999999","menu",{channelId:"canal-a"});
      expect(store.evaluate("+5516999999999","1",{channelId:"canal-b"})).toBeNull();
      expect(store.evaluate("+5516999999999","1",{channelId:"canal-a"})?.replyMessages).toEqual(["Suporte"]);
      const audit=store.recentExecutions();
      expect(audit).toHaveLength(2);
      expect(JSON.stringify(audit)).not.toContain("+5516999999999");
      expect(JSON.stringify(audit)).not.toContain("Suporte");
    }finally{db.close();}
  });
});

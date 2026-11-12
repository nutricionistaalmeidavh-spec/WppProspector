import { describe, expect, it } from "vitest";
import { LocalRulesLlmClient } from "./local-rules-llm-client.ts";

const client = new LocalRulesLlmClient();

describe("LocalRulesLlmClient (R$ 0)", () => {
  it("não depende de chave e retorna decisão estruturada sem custo externo", async () => {
    const result = await client.generate({
      system: "Teste", messages: [{ role: "user", content: "Olá, quero saber mais." }],
      maxTokens: 500, model: "local-rules", responseSchema: {},
    });
    const decision = JSON.parse(result.text);
    expect(decision.replyMessages.length).toBeGreaterThan(0);
    expect(decision.leadIntent).toBe("needs_more_info");
    expect(result.usage.inputTokens).toBe(0);
  });

  it("reconhece pedido de opt-out e não insiste em venda", async () => {
    const response = await client.generate({
      system: "", messages: [{ role: "user", content: "Parem de me enviar mensagens" }],
      maxTokens: 500, model: "local-rules", responseSchema: {},
    });
    const decision = JSON.parse(response.text);
    expect(decision.leadIntent).toBe("opt_out");
    expect(decision.endConversation).toBe(true);
    expect(decision.replyMessages).toEqual([]);
  });

  it("extrai temas da última mensagem usando somente CPU local", async()=>{
    const result=await client.generate({
      system:"",messages:[{role:"user",content:"Preciso de controle de estoque e entregas"}],
      maxTokens:200,model:"local-rules",
      responseSchema:{properties:{temas:{type:"array"},dores:{type:"array"},modulosProvaveis:{type:"array"}}},
    });
    const signals=JSON.parse(result.text);
    expect(signals.temas).toContain("estoque");
    expect(signals.temas).toContain("entregas");
    expect(result.usage.inputTokens).toBe(0);
  });

  it("reconhece erro de digitação sem atribuir preço inventado",async()=>{
    const configured=new LocalRulesLlmClient(()=>({
      name:"Loja Teste",segment:"varejo",description:"",openingHours:"",paymentMethods:"",
      deliveryPolicy:"",returnPolicy:"",additionalInstructions:"",
      products:[{name:"Tênis Verde",price:"R$ 99",description:""}],faq:[],
      semanticSearch:{enabled:false,endpoint:"",model:""},
    }));
    const response=JSON.parse((await configured.generate({
      system:"",messages:[{role:"user",content:"Qual o preço do tenis verd?"}],maxTokens:300,model:"local-rules",
    })).text);
    expect(response.replyMessages.join(" ")).toContain("R$ 99");
    const generic=JSON.parse((await configured.generate({
      system:"",messages:[{role:"user",content:"Qual o valor total?"}],maxTokens:300,model:"local-rules",
    })).text);
    expect(generic.replyMessages.join(" ")).not.toContain("R$ 99");
  });

  it("encaminha suporte por cancelamento sem interpretar como opt-out",async()=>{
    const response=JSON.parse((await client.generate({
      system:"",messages:[{role:"user",content:"Quero cancelar minha compra"}],maxTokens:300,model:"local-rules",
    })).text);
    expect(response.leadIntent).toBe("needs_more_info");
    expect(response.endConversation).toBe(false);
    expect(response.handoffToHuman).toBe(true);
  });

});

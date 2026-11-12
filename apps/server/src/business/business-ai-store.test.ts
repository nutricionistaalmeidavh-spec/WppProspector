import { describe, expect, it } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { BusinessAiStore } from "./business-ai-store.ts";
import { LocalRulesLlmClient } from "../conversation-engine/infrastructure/llm/local-rules-llm-client.ts";

const request = (message: string) => ({
  system: "Atendimento comercial",
  messages: [{ role: "user" as const, content: message }],
  model: "local-rules",
  maxTokens: 1000,
});

describe("perfil de loja e motor de regras genérico", () => {
  it("não contém produtos ou preços da ArtiSys em uma instalação nova", async () => {
    const db = openDatabase(":memory:");
    try {
      const store = new BusinessAiStore(db, "a".repeat(64));
      const profile = store.getBusiness();
      expect(profile.name).toBe("");
      expect(JSON.stringify(profile)).not.toMatch(/obra na mão|fluxodre|R\\$ 200|artisys finance/i);
      const bot = new LocalRulesLlmClient(() => store.getBusiness());
      const response = JSON.parse((await bot.generate(request("Quanto custa?"))).text);
      expect(response.replyMessages.join(" ")).not.toMatch(/obra na mão|fluxodre|R\\$ 200|artisys/i);
      expect(response.handoffToHuman).toBe(true);
    } finally { db.close(); }
  });

  it("usa apenas o catálogo e as políticas da loja cadastrada, sem reutilizar informações anteriores", async () => {
    const db = openDatabase(":memory:");
    try {
      const store = new BusinessAiStore(db, "b".repeat(64));
      store.saveBusiness({
        name: "Loja Exemplo A", segment: "roupas", description: "Moda infantil",
        openingHours: "Segunda a sábado, das 9 às 18h", paymentMethods: "Pix ou cartão",
        deliveryPolicy: "Entregas em até 3 dias", returnPolicy: "Trocas em 7 dias",
        additionalInstructions: "",
        products: [{ name: "Camisa Azul", price: "R$ 45,00", description: "Algodão" }],
        faq: [],
      });
      const bot = new LocalRulesLlmClient(() => store.getBusiness());
      let answer = JSON.parse((await bot.generate(request("Qual o preço da Camisa Azul?"))).text);
      expect(answer.replyMessages.join(" ")).toContain("R$ 45,00");
      store.saveBusiness({ ...store.getBusiness(), name: "Loja Exemplo B",
        products: [{ name: "Tênis Verde", price: "R$ 99,00", description: "" }] });
      answer = JSON.parse((await bot.generate(request("Qual o preço da Camisa Azul?"))).text);
      expect(answer.replyMessages.join(" ")).not.toContain("R$ 45,00");
      answer = JSON.parse((await bot.generate(request("Quanto custa o Tênis Verde?"))).text);
      expect(answer.replyMessages.join(" ")).toContain("R$ 99,00");
    } finally { db.close(); }
  });

  it("não usa produto citado em mensagens antigas para responder outra pergunta", async () => {
    const db = openDatabase(":memory:");
    try {
      const store = new BusinessAiStore(db, "a".repeat(64));
      store.saveBusiness({ ...store.getBusiness(), name: "Loja QA",
        products: [
          { name: "Camisa Azul", price: "R$ 45", description: "" },
          { name: "Tênis Verde", price: "R$ 99", description: "" },
        ] });
      const bot = new LocalRulesLlmClient(() => store.getBusiness());
      const result = await bot.generate({
        system: "", model: "local-rules", maxTokens: 200,
        messages: [
          {role: "user", content: "Quanto custa Camisa Azul?"},
          {role: "assistant", content: "R$ 45"},
          {role: "user", content: "Quanto custa Tênis Verde?"},
        ],
      });
      const reply = JSON.parse(result.text).replyMessages.join(" ");
      expect(reply).toContain("R$ 99");
      expect(reply).not.toContain("R$ 45");
    } finally { db.close(); }
  });

  it("cifra chaves da Anthropic/OpenAI e não as devolve na configuração pública", () => {
    const db = openDatabase(":memory:");
    try {
      const store = new BusinessAiStore(db, "c".repeat(64));
      store.saveAi({ provider: "anthropic", model: "claude-sonnet-4-5", apiKey: "sk-test-not-a-real-key" });
      const visible = store.getAi();
      expect(visible.hasApiKey).toBe(true);
      expect(JSON.stringify(visible)).not.toContain("sk-test");
      expect(store.getActiveAi().apiKey).toBe("sk-test-not-a-real-key");
      const raw = JSON.stringify(db.prepare("SELECT * FROM business_ai_settings").get());
      expect(raw).not.toContain("sk-test");
      store.saveAi({ provider: "rules", model: "", apiKey: "" });
      expect(store.getActiveAi().provider).toBe("rules");
      expect(store.getAi().hasApiKey).toBe(false);
    } finally { db.close(); }
  });

  it("isola dados e preços de instalações distintas sem reiniciar o atendimento", async () => {
    const alphaDb = openDatabase(":memory:");
    const betaDb = openDatabase(":memory:");
    try {
      const alpha = new BusinessAiStore(alphaDb);
      const beta = new BusinessAiStore(betaDb);
      alpha.saveBusiness({ ...alpha.getBusiness(), name:"Loja Alpha",
        products:[{name:"Camisa Azul",description:"",price:"R$ 40"}] });
      beta.saveBusiness({ ...beta.getBusiness(), name:"Loja Beta",
        products:[{name:"Tênis Verde",description:"",price:"R$ 90"}] });
      const alphaBot=new LocalRulesLlmClient(()=>alpha.getBusiness());
      const betaBot=new LocalRulesLlmClient(()=>beta.getBusiness());
      const ask=async(bot:LocalRulesLlmClient,message:string)=>
        (JSON.parse((await bot.generate(request(message))).text) as {replyMessages:string[]}).replyMessages.join(" ");
      expect(await ask(alphaBot,"Preço da Camisa Azul")).toContain("R$ 40");
      expect(await ask(betaBot,"Preço da Camisa Azul")).not.toContain("R$ 40");
      expect(await ask(betaBot,"Preço do Tênis Verde")).toContain("R$ 90");
      alpha.saveBusiness({...alpha.getBusiness(),products:[{name:"Camisa Azul",description:"",price:"R$ 55"}]});
      expect(await ask(alphaBot,"Preço da Camisa Azul")).toContain("R$ 55");
      expect(await ask(betaBot,"Preço da Camisa Azul")).not.toContain("R$ 55");
    } finally { alphaDb.close();betaDb.close(); }
  });

});

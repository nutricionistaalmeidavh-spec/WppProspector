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
});

import { describe, expect, it } from "vitest";
import { classifyLocalIntent } from "./local-intent.pt-br.ts";

describe("intenções locais PT-BR sem provedor externo", () => {
  it.each([
    ["PAREM de me enviar mensagens!", "opt_out", "opt_out"],
    ["Não tenho interesse, obrigado", "opt_out", "opt_out"],
    ["Quero cancelar minha compra", "needs_more_info", "support"],
    ["Preciso de suporte com meu pedido", "needs_more_info", "support"],
    ["Gostaria de falar com uma pessoa", "needs_more_info", "human"],
    ["Qual é o PREÇO da camisa?", "needs_more_info", "price"],
    ["Quanto custa o frete?", "needs_more_info", "delivery"],
    ["Tem estoque de camiseta?", "needs_more_info", "stock"],
    ["Quero contratar agora", "interested", "purchase"],
    ["Não vou comprar", "not_interested", "rejection"],
    ["Qual seu horário de funcionamento?", "needs_more_info", "hours"],
    ["Vocês aceitam PIX?", "needs_more_info", "payment"],
    ["Conta uma piada", "off_topic", "off_topic"],
    ["", "unknown", "unknown"],
  ] as const)("classifica %j como %s/%s", (text, intent, topic) => {
    expect(classifyLocalIntent(text)).toMatchObject({intent,topic});
  });
});

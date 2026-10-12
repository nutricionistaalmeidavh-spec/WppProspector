import type { LlmClientPort, LlmRequest, LlmResponse } from "../../application/ports/llm-client.port.ts";

/** Fallback determinístico, sem chamadas externas e sem tokens faturáveis. */
export class LocalRulesLlmClient implements LlmClientPort {
  async generate(request: LlmRequest): Promise<LlmResponse> {
    const user = request.messages.filter((item) => item.role === "user").map((item) => item.content).join(" ").trim();
    const normalized = user.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const isExtraction = request.responseSchema !== undefined &&
      Object.prototype.hasOwnProperty.call((request.responseSchema.properties as Record<string, unknown> | undefined) ?? {}, "temas");

    let value: unknown;
    if (isExtraction) {
      value = { temas: [], dores: [], modulosProvaveis: [] };
    } else {
      const optedOut = /\b(pare|parem|parar|cancele|cancelar|remova|remover|descadastrar|nao quero mais|nao me envie|nao tenho interesse|sair)\b/.test(normalized);
      const human = /\b(humano|atendente|pessoa|falar com alguem)\b/.test(normalized);
      const interested = /\b(quero contratar|tenho interesse|comprar|contratar)\b/.test(normalized);
      const replyMessages = optedOut ? [] :
        human ? ["Vou encaminhar seu atendimento a uma pessoa da equipe."] :
        interested ? ["Obrigado pelo interesse. Vou encaminhar sua solicitação para atendimento."] :
        ["Olá! Posso ajudar com informações sobre nossos serviços. O que você gostaria de saber?"];
      value = {
        replyMessages,
        endConversation: optedOut,
        leadIntent: optedOut ? "opt_out" : interested ? "interested" : "needs_more_info",
        leadQualification: interested ? "warm" : null,
        handoffToHuman: human || interested,
        reasoning: "Classificação local por regras determinísticas.",
        recommendedModules: [],
        interestedModules: [],
        quotedPlan: null,
      };
    }
    return {
      text: JSON.stringify(value),
      usage: { model: "local-rules", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    };
  }
}

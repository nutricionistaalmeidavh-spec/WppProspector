import type { LlmClientPort, LlmRequest, LlmResponse } from "../../application/ports/llm-client.port.ts";
import type { BusinessProfile } from "../../../business/business-ai-store.ts";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const fallback = "Vou confirmar essa informação com nossa equipe para não passar dados incorretos.";

/** Respostas determinísticas usando SOMENTE o cadastro canônico desta instalação. */
export type LocalCatalogItem = {name:string;sku:string;price:string;stock:number|null;syncedAt:string};
export class LocalRulesLlmClient implements LlmClientPort {
  constructor(private readonly business: () => BusinessProfile | undefined = () => undefined,
    private readonly catalog: () => readonly LocalCatalogItem[] = () => [],
    private readonly search: (question:string) => readonly LocalCatalogItem[] = () => []) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    // Histórico não deve contaminar a identificação do produto solicitado agora.
    const user = request.messages.filter(item => item.role === "user").at(-1)?.content.trim() ?? "";
    const normalized = normalize(user);
    const isExtraction = request.responseSchema !== undefined &&
      Object.prototype.hasOwnProperty.call((request.responseSchema.properties as Record<string, unknown> | undefined) ?? {}, "temas");

    let value: unknown;
    if (isExtraction) {
      value = { temas: [], dores: [], modulosProvaveis: [] };
    } else {
      const company = this.business();
      const optedOut = /\b(pare|parem|parar|cancele|cancelar|remova|remover|descadastrar|nao quero mais|nao me envie|nao tenho interesse|sair)\b/.test(normalized);
      const human = /\b(humano|atendente|pessoa|falar com alguem)\b/.test(normalized);
      const interested = /\b(quero contratar|tenho interesse|comprar|contratar)\b/.test(normalized);
      const questionPrice = /\b(preco|quanto|custa|valor|catalogo|produto)\b/.test(normalized);
      const terms = new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
      const matches = (candidate: string) => {
        const words = normalize(candidate).split(/[^a-z0-9]+/).filter(Boolean);
        return words.length > 0 && words.every(word => terms.has(word));
      };
      const indexed=this.search(user);
      // Nunca escolher uma variante arbitrária quando várias correspondem.
      const commerceProduct=this.catalog().find(p=>matches(p.name)||(p.sku&&terms.has(normalize(p.sku)))) ??
        (indexed.length===1?indexed[0]:undefined);
      const product = commerceProduct ?? company?.products.find(p => matches(p.name));
      const asksStock=/\b(estoque|disponivel|disponibilidade|tem|quantidade)\b/.test(normalized);
      const knownFaq = company?.faq.find(x => matches(x.question));
      let answer = "";
      let unknown = false;
      if (knownFaq) answer = knownFaq.answer;
      else if (product) {
        answer = [product.name,"description" in product ? product.description : "",
          product.price ? "Preço: " + product.price : ""].filter(Boolean).join(" — ");
        if(asksStock){
          const stock=commerceProduct?.stock;
          answer += stock==null?" — Estoque não confirmado; consulte nossa equipe.":
            " — Saldo da última sincronização: "+stock+" unidade(s). Confirme disponibilidade com nossa equipe.";
          unknown=true;
        }
      }
      else if (/\b(horario|abre|aberto|funciona|funcionamento|fecha)\b/.test(normalized)) answer = company?.openingHours ?? "";
      else if (/\b(entrega|frete|envio|enviar|delivery)\b/.test(normalized)) answer = company?.deliveryPolicy ?? "";
      else if (/\b(troca|devolucao|devolver|garantia)\b/.test(normalized)) answer = company?.returnPolicy ?? "";
      else if (/\b(pagamento|pix|cartao|parcela|parcelamento)\b/.test(normalized)) answer = company?.paymentMethods ?? "";
      else if (/\b(empresa|loja|voces fazem|servicos|o que vendem)\b/.test(normalized)) answer = [company?.name, company?.description].filter(Boolean).join(" — ");
      else if (questionPrice) answer = "";
      if (!answer && (questionPrice || /\b(horario|entrega|frete|troca|devolucao|pagamento)\b/.test(normalized))) {
        unknown = true;
        answer = fallback;
      }
      const replyMessages = optedOut ? [] :
        human ? ["Vou encaminhar seu atendimento a uma pessoa da equipe."] :
        answer ? [answer] :
        interested ? ["Obrigado pelo interesse. Vou encaminhar sua solicitação para atendimento."] :
        [company?.name ? "Olá! Você está falando com " + company.name + ". Como posso ajudar?" :
          "Olá! Posso ajudar com informações sobre nossos serviços. O que você gostaria de saber?"];
      value = {
        replyMessages,
        endConversation: optedOut,
        leadIntent: optedOut ? "opt_out" : interested ? "interested" : "needs_more_info",
        leadQualification: interested ? "warm" : null,
        handoffToHuman: human || interested || unknown,
        reasoning: "Classificação e resposta determinística com cadastro comercial local.",
        recommendedModules: [], interestedModules: [], quotedPlan: null,
      };
    }
    return { text: JSON.stringify(value),
      usage: { model: "local-rules", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 } };
  }
}

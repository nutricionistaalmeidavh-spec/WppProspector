import type { LlmClientPort, LlmRequest, LlmResponse } from "../conversation-engine/application/ports/llm-client.port.ts";
import { AnthropicLlmClient } from "../conversation-engine/infrastructure/llm/anthropic-llm-client.ts";
import { LocalRulesLlmClient, type LocalCatalogItem } from "../conversation-engine/infrastructure/llm/local-rules-llm-client.ts";
import { OpenAiChatClient } from "./openai-chat-client.ts";
import type { BusinessAiStore } from "./business-ai-store.ts";

/** Seleciona provedor por turno; alterar configuração não requer reiniciar o CRM. */
export class ConfigurableBusinessLlm implements LlmClientPort {
  private readonly local: LocalRulesLlmClient;
  constructor(private readonly store: BusinessAiStore, catalog:()=>readonly LocalCatalogItem[]=()=>[],
    search:(question:string)=>readonly LocalCatalogItem[]=()=>[]) {
    this.local = new LocalRulesLlmClient(() => store.getBusiness(),catalog,search);
  }
  async generate(request: LlmRequest): Promise<LlmResponse> {
    const ai = this.store.getActiveAi();
    if (ai.provider === "rules") return this.local.generate(request);
    const provider = ai.provider === "anthropic" ? new AnthropicLlmClient({apiKey: ai.apiKey!})
      : ai.provider === "compatible" ? new OpenAiChatClient("", fetch, ai.endpoint!)
      : new OpenAiChatClient(ai.apiKey!);
    return provider.generate({ ...request, model: ai.model });
  }
}

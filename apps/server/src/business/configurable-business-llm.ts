import type { LlmClientPort, LlmRequest, LlmResponse } from "../conversation-engine/application/ports/llm-client.port.ts";
import { AnthropicLlmClient } from "../conversation-engine/infrastructure/llm/anthropic-llm-client.ts";
import { LocalRulesLlmClient, type LocalCatalogItem } from "../conversation-engine/infrastructure/llm/local-rules-llm-client.ts";
import { OpenAiChatClient } from "./openai-chat-client.ts";
import { LocalSemanticCatalogSearch } from "./local-semantic-catalog.ts";
import type { BusinessAiStore } from "./business-ai-store.ts";

/** Seleciona provedor por turno; alterar configuração não requer reiniciar o CRM. */
export class ConfigurableBusinessLlm implements LlmClientPort {
  private readonly local: LocalRulesLlmClient;
  constructor(private readonly store: BusinessAiStore, catalog:()=>readonly LocalCatalogItem[]=()=>[],
    search:(question:string)=>readonly LocalCatalogItem[]=()=>[]) {
    const semantic=new LocalSemanticCatalogSearch(
      () => store.getBusiness().semanticSearch,
      () => {
        const published=store.getBusiness().products.map(item=>({
          name:item.name,sku:"",price:item.price,stock:null,syncedAt:"profile",
        }));
        const items=[...catalog(),...published];
        const seen=new Set<string>();
        return items.filter(item=>{
          const key=item.name.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLowerCase();
          if(seen.has(key))return false;
          seen.add(key);return true;
        });
      },
    );
    this.local = new LocalRulesLlmClient(() => store.getBusiness(),catalog,search,
      question => semantic.search(question));
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

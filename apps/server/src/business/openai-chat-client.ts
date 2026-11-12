import type { LlmClientPort, LlmRequest, LlmResponse } from "../../conversation-engine/application/ports/llm-client.port.ts";
import { LlmClientError } from "../../conversation-engine/application/errors.ts";

/** API oficial de chat da OpenAI, somente por escolha explícita com chave própria. */
export class OpenAiChatClient implements LlmClientPort {
  constructor(private readonly apiKey: string, private readonly requestFetch: typeof fetch = fetch) {}
  async generate(request: LlmRequest): Promise<LlmResponse> {
    const system = typeof request.system === "string" ? request.system : request.system.map(b => b.text).join("\n\n");
    const body = {
      model: request.model,
      messages: [{ role: "system", content: system }, ...request.messages],
      ...(request.responseSchema ? { response_format: {
        type: "json_schema", json_schema: {
          name: "crm_decision", strict: true, schema: request.responseSchema,
        },
      } } : {}),
    };
    let res: Response;
    try {
      res = await this.requestFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { authorization: "Bearer " + this.apiKey, "content-type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new LlmClientError("Não foi possível conectar à API da OpenAI.");
    }
    if (!res.ok) throw new LlmClientError("OpenAI retornou erro HTTP " + res.status + ". Verifique chave, modelo e créditos.");
    const result = await res.json() as {
      model?: string; choices?: Array<{ message?: { content?: string|null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
    };
    const text = result.choices?.[0]?.message?.content?.trim();
    if (!text) throw new LlmClientError("Resposta vazia da OpenAI.");
    return { text, usage: {
      model: result.model || request.model, inputTokens: result.usage?.prompt_tokens ?? 0,
      outputTokens: result.usage?.completion_tokens ?? 0,
      cacheReadTokens: result.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: 0,
    } };
  }
}

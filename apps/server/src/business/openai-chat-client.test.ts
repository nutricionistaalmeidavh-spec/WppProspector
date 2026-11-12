import { describe, expect, it, vi } from "vitest";
import { OpenAiChatClient } from "./openai-chat-client.ts";
describe("OpenAiChatClient opcional", () => {
  it("envia a chave somente ao endpoint oficial e contabiliza tokens", async () => {
    const fake=vi.fn(async (_url:string, opts:RequestInit)=> {
      const body=JSON.parse(String(opts.body)) as {messages:{role:string;content:string}[]};
      expect(body.messages[0].content).toContain("Loja Exemplo");
      expect((opts.headers as Record<string,string>).authorization).toBe("Bearer sk-test");
      return new Response(JSON.stringify({model:"gpt-4.1-mini",
        choices:[{message:{content:'{"replyMessages":["Olá"],"endConversation":false}'}}],
        usage:{prompt_tokens:100,completion_tokens:25}}),{status:200});
    });
    const client=new OpenAiChatClient("sk-test",fake as typeof fetch);
    const result=await client.generate({system:"Loja Exemplo",
      messages:[{role:"user",content:"Oi"}],model:"gpt-4.1-mini",maxTokens:300});
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(25);
    expect(fake).toHaveBeenCalledOnce();
    expect(fake.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/chat/completions");
  });
});

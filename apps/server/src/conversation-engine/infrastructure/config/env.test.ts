import { describe, expect, it } from "vitest";
import { loadConversationEngineEnv } from "./env.ts";

describe("loadConversationEngineEnv", () => {
  it("permite configuração offline sem segredos", () => {
    const env = loadConversationEngineEnv({});
    expect(env.LLM_PROVIDER).toBe("rules");
    expect(env.LLM_MODEL).toBe("local-rules");
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.DATABASE_PATH).toBe("./data/app.db");
  });

  it("suporta Anthropic somente como escolha explícita com chave", () => {
    expect(() => loadConversationEngineEnv({ LLM_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    const env = loadConversationEngineEnv({ LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "sk-test", LLM_MODEL: "claude-sonnet-5" });
    expect(env.LLM_PROVIDER).toBe("anthropic");
    expect(env.LLM_MODEL).toBe("claude-sonnet-5");
  });

  it("mantém overrides e o workspace opcional", () => {
    const env = loadConversationEngineEnv({ LLM_USAGE_TRACKING_ENABLED: "false", ANTHROPIC_WORKSPACE_ID: "wrk", RETRIEVAL_TOP_K: "10" });
    expect(env.LLM_USAGE_TRACKING_ENABLED).toBe(false);
    expect(env.RETRIEVAL_TOP_K).toBe(10);
    expect(env.ANTHROPIC_WORKSPACE_ID).toBe("wrk");
  });
});

import { z } from "zod";

const envSchema = z.object({
  LLM_PROVIDER: z.enum(["rules", "anthropic"]).default("rules"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_WORKSPACE_ID: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default("local-rules"),
  EXTRACTION_LLM_MODEL: z.string().min(1).default("local-rules"),
  CONVERSATION_BATCH_WINDOW_MS: z.coerce.number().int().positive().default(8000),
  CONVERSATION_HISTORY_TURNS: z.coerce.number().int().positive().default(20),
  CONVERSATIONS_DIR: z.string().min(1).default("./data/conversations"),
  DATABASE_PATH: z.string().min(1).default("./data/app.db"),
  LLM_USAGE_TRACKING_ENABLED: z.enum(["true", "false"]).default("true").transform(value => value === "true"),
  BOOT_SWEEP_MAX_AGE_MS: z.coerce.number().int().positive().default(3600000),
  KNOWLEDGE_DIR: z.string().min(1).default("./src/conversation-engine/infrastructure/knowledge"),
  RETRIEVAL_TOP_K: z.coerce.number().int().positive().default(6),
  RETRIEVAL_MIN_SCORE: z.coerce.number().min(0).default(0),
}).superRefine((value, ctx) => {
  if (value.LLM_PROVIDER === "anthropic" && !value.ANTHROPIC_API_KEY) {
    ctx.addIssue({ code: "custom", path: ["ANTHROPIC_API_KEY"], message: "ANTHROPIC_API_KEY é obrigatório com LLM_PROVIDER=anthropic" });
  }
});

export type ConversationEngineEnv = z.infer<typeof envSchema>;

export function loadConversationEngineEnv(source: NodeJS.ProcessEnv = process.env): ConversationEngineEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error("Configuração de ambiente inválida:\n" + result.error.issues.map(issue => "- " + issue.path.join(".") + ": " + issue.message).join("\n"));
  }
  return result.data;
}

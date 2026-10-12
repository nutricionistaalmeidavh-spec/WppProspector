import { z } from "zod";

const envSchema = z.object({
  WHATSAPP_PROVIDER: z.enum(["baileys", "meta"]).default("baileys"),
  BAILEYS_AUTH_DIR: z.string().min(1).default("./data/baileys-auth"),
  BAILEYS_SESSION_IDS: z.string().min(1).default("default"),
  META_ACCESS_TOKEN: z.string().min(1).optional(),
  META_APP_SECRET: z.string().min(1).optional(),
  META_PHONE_NUMBER_ID: z.string().min(1).optional(),
  META_WABA_ID: z.string().min(1).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().min(1).optional(),
  WHATSAPP_COST_TRACKING_ENABLED: z.enum(["true", "false"]).default("true").transform(value => value === "true"),
  WHATSAPP_BILLING_COUNTRY: z.string().length(2).default("BR").transform(value => value.toUpperCase()),
}).superRefine((value, ctx) => {
  if (value.WHATSAPP_PROVIDER !== "meta") return;
  for (const key of ["META_ACCESS_TOKEN", "META_APP_SECRET", "META_PHONE_NUMBER_ID", "META_WABA_ID", "META_WEBHOOK_VERIFY_TOKEN"] as const) {
    if (!value[key]) ctx.addIssue({ code: "custom", path: [key], message: key + " é obrigatório quando WHATSAPP_PROVIDER=meta" });
  }
}).transform(value => ({
  ...value,
  HOST: value.HOST ?? (value.WHATSAPP_PROVIDER === "meta" ? "0.0.0.0" : "127.0.0.1"),
}));

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) throw new Error("Configuração de ambiente inválida:\n" + result.error.issues.map(issue => "- " + issue.path.join(".") + ": " + issue.message).join("\n"));
  return result.data;
}

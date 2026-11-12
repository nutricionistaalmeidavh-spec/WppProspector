import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const item = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  price: z.string().trim().max(120).default(""),
});
const faq = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2000),
});
export const businessSchema = z.object({
  name: z.string().trim().max(160).default(""),
  segment: z.string().trim().max(160).default(""),
  description: z.string().trim().max(3000).default(""),
  openingHours: z.string().trim().max(1000).default(""),
  paymentMethods: z.string().trim().max(1000).default(""),
  deliveryPolicy: z.string().trim().max(2000).default(""),
  returnPolicy: z.string().trim().max(2000).default(""),
  additionalInstructions: z.string().trim().max(3000).default(""),
  products: z.array(item).max(100).default([]),
  faq: z.array(faq).max(50).default([]),
}).strict();
export type BusinessProfile = z.infer<typeof businessSchema>;
export const aiInputSchema = z.object({
  provider: z.enum(["rules", "anthropic", "openai"]),
  model: z.string().trim().max(120).default(""),
  apiKey: z.string().trim().max(4096).default(""),
  clearKey: z.boolean().optional(),
}).strict();
export type AiProvider = z.infer<typeof aiInputSchema>["provider"];
type Paid = Exclude<AiProvider, "rules">;
interface AiRow {
  provider: Paid;
  model: string;
  key_cipher: string;
  key_iv: string;
  key_tag: string;
}
const EMPTY = businessSchema.parse({});
const DEFAULT_MODELS: Record<Paid, string> = { anthropic: "claude-sonnet-4-5", openai: "gpt-4.1-mini" };

export class BusinessAiStore {
  constructor(private readonly db: DatabaseSync, private readonly encryptionKey?: string) {
    if (encryptionKey !== undefined && !/^[a-f0-9]{64}$/i.test(encryptionKey)) {
      throw new Error("AI_CREDENTIALS_KEY deve conter 64 caracteres hexadecimais.");
    }
  }

  getBusiness(): BusinessProfile {
    const row = this.db.prepare("SELECT data_json FROM business_profile WHERE id = 1").get() as {data_json:string}|undefined;
    return row ? businessSchema.parse(JSON.parse(row.data_json)) : { ...EMPTY, products: [], faq: [] };
  }

  saveBusiness(raw: unknown): BusinessProfile {
    const value = businessSchema.parse(raw);
    this.db.prepare(`INSERT INTO business_profile(id,data_json,updated_at) VALUES(1,?,?)
      ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at`)
      .run(JSON.stringify(value), new Date().toISOString());
    return value;
  }

  getAi(): { provider: AiProvider; model: string; hasApiKey: boolean; providers: Record<Paid, boolean>; canStoreKeys: boolean } {
    const selected = this.selected();
    const rows = this.db.prepare("SELECT provider,model FROM business_ai_settings").all() as Array<{provider:Paid;model:string}>;
    const current = rows.find(row => row.provider === selected);
    return {
      provider: selected,
      model: selected === "rules" ? "" : current?.model ?? DEFAULT_MODELS[selected],
      hasApiKey: selected !== "rules" && !!current,
      providers: { anthropic: rows.some(x => x.provider === "anthropic"), openai: rows.some(x => x.provider === "openai") },
      canStoreKeys: Boolean(this.encryptionKey),
    };
  }

  getActiveAi(): {provider: AiProvider; model: string; apiKey?: string} {
    const { provider, model } = this.getAi();
    if (provider === "rules") return { provider, model: "local-rules" };
    const row = this.db.prepare("SELECT * FROM business_ai_settings WHERE provider=?").get(provider) as AiRow|undefined;
    if (!row) throw new Error("Configure a chave de API de " + provider + " em Configurações.");
    if (!this.encryptionKey) throw new Error("Chave mestra de IA não configurada neste servidor.");
    return { provider, model, apiKey: this.decrypt(row) };
  }

  saveAi(raw: unknown): ReturnType<BusinessAiStore["getAi"]> {
    const value = aiInputSchema.parse(raw);
    if (value.provider !== "rules") {
      if (value.clearKey) {
        this.db.prepare("DELETE FROM business_ai_settings WHERE provider=?").run(value.provider);
        this.setSelected("rules");
        return this.getAi();
      }
      const existing = this.db.prepare("SELECT * FROM business_ai_settings WHERE provider=?").get(value.provider) as AiRow|undefined;
      const key = value.apiKey || (existing ? this.decrypt(existing) : "");
      if (!key) throw new Error("Informe a chave de API antes de ativar o provedor.");
      if (!this.encryptionKey) throw new Error("Configure AI_CREDENTIALS_KEY no servidor para armazenar chaves de forma cifrada.");
      const encrypted = this.encrypt(key);
      this.db.prepare(`INSERT INTO business_ai_settings(provider,model,key_cipher,key_iv,key_tag,updated_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET
        model=excluded.model,key_cipher=excluded.key_cipher,key_iv=excluded.key_iv,
        key_tag=excluded.key_tag,updated_at=excluded.updated_at`)
        .run(value.provider, value.model || DEFAULT_MODELS[value.provider], encrypted.cipher, encrypted.iv, encrypted.tag, new Date().toISOString());
    }
    this.setSelected(value.provider);
    return this.getAi();
  }

  private selected(): AiProvider {
    const row = this.db.prepare("SELECT provider FROM business_ai_selection WHERE id=1").get() as {provider:AiProvider}|undefined;
    return row?.provider ?? "rules";
  }
  private setSelected(provider: AiProvider): void {
    this.db.prepare(`INSERT INTO business_ai_selection(id,provider,updated_at) VALUES(1,?,?)
      ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,updated_at=excluded.updated_at`)
      .run(provider, new Date().toISOString());
  }
  private encrypt(key: string): {cipher:string;iv:string;tag:string} {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", Buffer.from(this.encryptionKey!, "hex"), iv);
    cipher.setAAD(Buffer.from("wpp-ai-credentials-v1"));
    return { cipher: Buffer.concat([cipher.update(key, "utf8"), cipher.final()]).toString("base64"),
      iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
  }
  private decrypt(row: AiRow): string {
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(this.encryptionKey!, "hex"), Buffer.from(row.key_iv, "base64"));
    decipher.setAAD(Buffer.from("wpp-ai-credentials-v1"));
    decipher.setAuthTag(Buffer.from(row.key_tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(row.key_cipher, "base64")), decipher.final()]).toString("utf8");
  }
}

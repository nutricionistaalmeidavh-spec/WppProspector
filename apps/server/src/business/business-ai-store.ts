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
const semanticSearchSchema=z.object({
  enabled:z.boolean().default(false),
  endpoint:z.string().trim().max(500).default(""),
  model:z.string().trim().max(120).default(""),
}).strict().superRefine((value,context)=>{
  if(!value.enabled)return;
  if(!value.model)context.addIssue({code:"custom",path:["model"],message:"Informe o modelo de embeddings self-hosted."});
  try{validateSemanticEndpoint(value.endpoint);}catch{
    context.addIssue({code:"custom",path:["endpoint"],message:"Informe um endpoint /v1/embeddings válido (HTTPS ou localhost)."});
  }
});
export type SemanticSearchSettings=z.infer<typeof semanticSearchSchema>;

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
  semanticSearch: semanticSearchSchema.default({enabled:false,endpoint:"",model:""}),
}).strict();
export type BusinessProfile = z.infer<typeof businessSchema>;
export const aiInputSchema = z.object({
  provider: z.enum(["rules", "anthropic", "openai", "compatible"]),
  model: z.string().trim().max(120).default(""),
  endpoint: z.string().trim().max(500).default(""),
  apiKey: z.string().trim().max(4096).default(""),
  clearKey: z.boolean().optional(),
}).strict();
export type AiProvider = z.infer<typeof aiInputSchema>["provider"];
type Paid = Exclude<AiProvider, "rules" | "compatible">;
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

  getAi(): { provider: AiProvider; model: string; hasApiKey: boolean; providers: Record<Paid, boolean>; canStoreKeys: boolean; endpoint?: string } {
    const selected = this.selected();
    const rows = this.db.prepare("SELECT provider,model FROM business_ai_settings").all() as Array<{provider:Paid;model:string}>;
    const current = rows.find(row => row.provider === selected);
    const local = this.getLocalModel();
    return {
      provider: selected,
      model: selected === "rules" ? "" : selected === "compatible" ? local.model : current?.model ?? DEFAULT_MODELS[selected],
      hasApiKey: selected !== "rules" && selected !== "compatible" && !!current,
      ...(selected === "compatible" ? { endpoint: local.endpoint } : {}),
      providers: { anthropic: rows.some(x => x.provider === "anthropic"), openai: rows.some(x => x.provider === "openai") },
      canStoreKeys: Boolean(this.encryptionKey),
    };
  }

  getActiveAi(): {provider: AiProvider; model: string; apiKey?: string; endpoint?: string} {
    const { provider, model } = this.getAi();
    if (provider === "rules") return { provider, model: "local-rules" };
    if (provider === "compatible") return { provider, model, endpoint: this.getLocalModel().endpoint };
    const row = this.db.prepare("SELECT * FROM business_ai_settings WHERE provider=?").get(provider) as AiRow|undefined;
    if (!row) throw new Error("Configure a chave de API de " + provider + " em Configurações.");
    if (!this.encryptionKey) throw new Error("Chave mestra de IA não configurada neste servidor.");
    return { provider, model, apiKey: this.decrypt(row) };
  }

  saveAi(raw: unknown, activate = true): ReturnType<BusinessAiStore["getAi"]> {
    const value = aiInputSchema.parse(raw);
    if (value.provider === "compatible") {
      const endpoint = validateCompatibleEndpoint(value.endpoint || this.getLocalModel().endpoint);
      const model = value.model || this.getLocalModel().model;
      if (!model) throw new Error("Informe o modelo disponível no servidor próprio.");
      this.db.prepare("INSERT INTO business_local_llm(id,endpoint,model) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,model=excluded.model").run(endpoint,model);
      if (activate) this.setSelected("compatible");
      return this.getAi();
    }
    if (value.provider !== "rules") {
      if (value.clearKey) {
        this.db.prepare("DELETE FROM business_ai_settings WHERE provider=?").run(value.provider);
        if (activate) this.setSelected("rules");
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
    if (activate) this.setSelected(value.provider);
    return this.getAi();
  }


  /** Registra a escolha sem trocar o provedor usado pelo atendimento real. */
  /** O rascunho é independente do motor e da chave em uso no atendimento real. */
  stageAi(raw: unknown) {
    const value = aiInputSchema.parse(raw);
    if (value.clearKey) throw new Error("Não é possível excluir uma chave ao salvar um rascunho.");
    const model = value.model || (value.provider === "compatible" ? this.getLocalModel().model : value.provider === "rules" ? "" : DEFAULT_MODELS[value.provider]);
    const endpoint = value.endpoint || (value.provider === "compatible" ? this.getLocalModel().endpoint : "");
    if (value.provider === "compatible") {
      validateCompatibleEndpoint(endpoint);
      if (!model) throw new Error("Informe o identificador do modelo self-hosted.");
    }
    if (value.provider === "anthropic" || value.provider === "openai") {
      const existing = this.db.prepare("SELECT 1 FROM business_ai_settings WHERE provider=?").get(value.provider);
      const draft = this.pendingSecretRow();
      if (!value.apiKey && !existing && draft?.provider !== value.provider) {
        throw new Error("Informe a chave do provedor antes de salvar o rascunho.");
      }
      if (value.apiKey && !this.encryptionKey) throw new Error("Armazenamento de credenciais indisponível.");
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (value.provider === "anthropic" || value.provider === "openai") {
        if (value.apiKey) {
          const encrypted=this.encrypt(value.apiKey);
          this.db.prepare("INSERT INTO business_ai_pending_secrets(id,provider,key_cipher,key_iv,key_tag) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,key_cipher=excluded.key_cipher,key_iv=excluded.key_iv,key_tag=excluded.key_tag")
            .run(value.provider,encrypted.cipher,encrypted.iv,encrypted.tag);
        } else if (this.pendingSecretRow()?.provider !== value.provider) {
          this.db.prepare("DELETE FROM business_ai_pending_secrets WHERE id=1").run();
        }
      } else {
        this.db.prepare("DELETE FROM business_ai_pending_secrets WHERE id=1").run();
      }
      this.db.prepare("DELETE FROM business_studio_validation WHERE scope=\'engine\'").run();
      this.db.prepare("INSERT INTO business_ai_pending(id,provider,model,endpoint,updated_at) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider,model=excluded.model,endpoint=excluded.endpoint,updated_at=excluded.updated_at")
        .run(value.provider,model,endpoint,new Date().toISOString());
      this.db.exec("COMMIT");
    } catch(error) {this.db.exec("ROLLBACK");throw error;}
    return this.getPendingAi();
  }

  private pendingSecretRow(): (Pick<AiRow, "key_cipher"|"key_iv"|"key_tag"> & {provider:Paid})|undefined {
    return this.db.prepare("SELECT provider,key_cipher,key_iv,key_tag FROM business_ai_pending_secrets WHERE id=1").get() as
      (Pick<AiRow,"key_cipher"|"key_iv"|"key_tag"> & {provider:Paid})|undefined;
  }

  getPendingAi() {
    const row = this.db.prepare("SELECT provider,model,endpoint FROM business_ai_pending WHERE id=1").get() as {provider:AiProvider;model:string;endpoint:string}|undefined;
    const active = this.getAi();
    const pendingSecret=this.pendingSecretRow();
    return row
      ? { provider: row.provider, model: row.model, endpoint: row.endpoint, published: false,
          hasApiKey: row.provider === "anthropic" || row.provider === "openai" ?
            active.providers[row.provider] || pendingSecret?.provider === row.provider : false }
      : { provider: active.provider, model: active.model, endpoint: active.endpoint ?? "", published: true, hasApiKey: active.hasApiKey };
  }

  getPreviewAi(): {provider:AiProvider;model:string;apiKey?:string;endpoint?:string} {
    const pending = this.getPendingAi();
    if (pending.provider === "rules") return {provider:"rules",model:"local-rules"};
    if (pending.provider === "compatible") return {provider:"compatible",model:pending.model,endpoint:validateCompatibleEndpoint(pending.endpoint)};
    const stagedKey=this.pendingSecretRow();
    const row = stagedKey?.provider === pending.provider ? stagedKey :
      this.db.prepare("SELECT * FROM business_ai_settings WHERE provider=?").get(pending.provider) as AiRow|undefined;
    if (!row || !this.encryptionKey) throw new Error("Cadastre a chave da API antes de testar o provedor.");
    return {provider:pending.provider,model:pending.model,apiKey:this.decrypt(row as AiRow)};
  }

  publishAi() {
    const pending = this.getPendingAi();
    if (pending.published) return this.getAi();
    const stagedSecret=this.pendingSecretRow();
    const apiKey=(pending.provider==="anthropic"||pending.provider==="openai") && stagedSecret?.provider===pending.provider
      ? this.decrypt(stagedSecret as AiRow) : "";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.saveAi({provider:pending.provider,model:pending.model,endpoint:pending.endpoint,apiKey});
      this.db.prepare("DELETE FROM business_ai_pending WHERE id=1").run();
      this.db.prepare("DELETE FROM business_ai_pending_secrets WHERE id=1").run();
      this.db.exec("COMMIT");
    } catch(error) {this.db.exec("ROLLBACK");throw error;}
    return this.getAi();
  }

  getLocalModel(): {endpoint:string;model:string} {
    const row=this.db.prepare("SELECT endpoint,model FROM business_local_llm WHERE id=1").get() as {endpoint:string;model:string}|undefined;
    return row ?? {endpoint:"",model:""};
  }

  /** Nunca retorna o token no endpoint GET de configuração. */
  getShopifyConnection() {
    const row=this.db.prepare("SELECT domain,updated_at FROM business_shopify WHERE id=1").get() as {domain:string;updated_at:string}|undefined;
    return {configured:Boolean(row), domain:row?.domain ?? "", updatedAt:row?.updated_at ?? null};
  }
  saveShopifyConnection(raw:unknown) {
    const value=z.object({
      domain:z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,62}\.myshopify\.com$/),
      token:z.string().min(1).max(4096),
    }).parse(raw);
    if (!this.encryptionKey) throw new Error("Armazenamento de credenciais indisponível.");
    const encrypted=this.encrypt(value.token);
    this.db.prepare("INSERT INTO business_shopify(id,domain,key_cipher,key_iv,key_tag,updated_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET domain=excluded.domain,key_cipher=excluded.key_cipher,key_iv=excluded.key_iv,key_tag=excluded.key_tag,updated_at=excluded.updated_at")
      .run(value.domain,encrypted.cipher,encrypted.iv,encrypted.tag,new Date().toISOString());
    return this.getShopifyConnection();
  }
  getShopifyCredentials(): {domain:string;token:string} {
    const row=this.db.prepare("SELECT * FROM business_shopify WHERE id=1").get() as (AiRow & {domain:string})|undefined;
    if (!row || !this.encryptionKey) throw new Error("Configure domínio e token privado da Shopify.");
    return {domain:row.domain,token:this.decrypt(row)};
  }
  removeShopifyConnection() {
    this.db.prepare("DELETE FROM business_shopify WHERE id=1").run();
    return this.getShopifyConnection();
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

/** Permite self-hosted local ou HTTPS escolhido pelo administrador, sem redirects. */
export function validateCompatibleEndpoint(value:string):string {
  let url:URL;
  try {url=new URL(value);} catch {throw new Error("Informe uma URL válida para o servidor de IA.");}
  const loopback=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if (!(url.protocol==="https:" || (url.protocol==="http:" && loopback)) ||
    url.username || url.password || url.search || url.hash ||
    !url.pathname.endsWith("/chat/completions")) {
    throw new Error("Use HTTPS ou loopback local, com endpoint /v1/chat/completions e sem credenciais na URL.");
  }
  return url.toString();
}

/** Apenas endpoint explicitamente selecionado; nenhum serviço ou chave é obrigatório. */
export function validateSemanticEndpoint(value:string):string {
  let url:URL;
  try{url=new URL(value);}catch{throw new Error("URL de embeddings inválida.");}
  const loopback=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  if(!(url.protocol==="https:"||(url.protocol==="http:"&&loopback)) ||
    url.username || url.password || url.search || url.hash ||
    !url.pathname.endsWith("/v1/embeddings"))
    throw new Error("Use HTTPS ou loopback local e endpoint /v1/embeddings sem credenciais.");
  return url.toString();
}

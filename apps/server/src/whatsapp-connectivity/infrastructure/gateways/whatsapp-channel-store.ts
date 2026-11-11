import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

type Row = Record<string, unknown>;
export interface MetaChannel {
  id: string;
  provider: "meta";
  phoneNumberId: string;
  wabaId: string;
  displayName: string;
  active: boolean;
  createdAt: string;
}
export interface ActiveMetaChannel extends MetaChannel { accessToken: string }

function present(row: Row): MetaChannel {
  return {
    id: String(row.id), provider: "meta", phoneNumberId: String(row.phone_number_id),
    wabaId: String(row.waba_id), displayName: String(row.display_name),
    active: Number(row.active) === 1, createdAt: String(row.created_at),
  };
}

/** Somente o processo do servidor possui a chave. A API nunca devolve tokens. */
export class WhatsAppChannelStore {
  private readonly key: Buffer;
  constructor(private readonly db: DatabaseSync, encryptionKey: string) {
    if (encryptionKey.length < 32) throw new Error("WHATSAPP_CREDENTIALS_KEY deve ter ao menos 32 caracteres.");
    this.key = scryptSync(encryptionKey, "artisys-whatsapp-channel-v1", 32);
  }
  list(): MetaChannel[] {
    return (this.db.prepare("SELECT id,phone_number_id,waba_id,display_name,active,created_at FROM whatsapp_channels ORDER BY created_at").all() as Row[]).map(present);
  }
  active(): ActiveMetaChannel | null {
    const row = this.db.prepare("SELECT * FROM whatsapp_channels WHERE active=1").get() as Row | undefined;
    if (!row) return null;
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(String(row.token_iv), "base64"));
    decipher.setAuthTag(Buffer.from(String(row.token_tag), "base64"));
    const accessToken = Buffer.concat([decipher.update(Buffer.from(String(row.token_cipher), "base64")), decipher.final()]).toString("utf8");
    return { ...present(row), accessToken };
  }
  upsert(input: { phoneNumberId: string; wabaId: string; displayName: string; accessToken: string }): MetaChannel {
    if (!/^\d+$/.test(input.phoneNumberId) || !/^\d+$/.test(input.wabaId) || !input.accessToken) {
      throw new Error("Credenciais Meta inválidas");
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const payload = Buffer.concat([cipher.update(input.accessToken, "utf8"), cipher.final()]);
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db.prepare(`INSERT INTO whatsapp_channels
      (id,phone_number_id,waba_id,display_name,token_cipher,token_iv,token_tag,active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,0,?,?)
      ON CONFLICT(phone_number_id) DO UPDATE SET
      waba_id=excluded.waba_id,display_name=excluded.display_name,
      token_cipher=excluded.token_cipher,token_iv=excluded.token_iv,
      token_tag=excluded.token_tag,updated_at=excluded.updated_at`)
      .run(id,input.phoneNumberId,input.wabaId,input.displayName,payload.toString("base64"),
        iv.toString("base64"),cipher.getAuthTag().toString("base64"),now,now);
    const row = this.db.prepare("SELECT id,phone_number_id,waba_id,display_name,active,created_at FROM whatsapp_channels WHERE phone_number_id=?").get(input.phoneNumberId) as Row;
    return present(row);
  }
  activate(id: string): MetaChannel {
    const match = this.list().find(item => item.id === id);
    if (!match) throw new Error("Canal Meta não encontrado");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE whatsapp_channels SET active=0 WHERE active=1").run();
      this.db.prepare("UPDATE whatsapp_channels SET active=1,updated_at=? WHERE id=?").run(new Date().toISOString(),id);
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return { ...match, active: true };
  }
  deactivate(): void { this.db.prepare("UPDATE whatsapp_channels SET active=0 WHERE active=1").run(); }
  delete(id: string): boolean {
    return Number(this.db.prepare("DELETE FROM whatsapp_channels WHERE id=?").run(id).changes) > 0;
  }
}

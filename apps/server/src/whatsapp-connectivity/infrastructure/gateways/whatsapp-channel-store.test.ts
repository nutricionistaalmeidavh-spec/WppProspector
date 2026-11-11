import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { WhatsAppChannelStore } from "./whatsapp-channel-store.ts";

describe("credenciais dos canais Meta", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE whatsapp_channels (
    id TEXT PRIMARY KEY, phone_number_id TEXT NOT NULL UNIQUE, waba_id TEXT NOT NULL,
    display_name TEXT NOT NULL, token_cipher TEXT NOT NULL, token_iv TEXT NOT NULL,
    token_tag TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ); CREATE UNIQUE INDEX one_active_channel ON whatsapp_channels(active) WHERE active=1;`);
  const store = new WhatsAppChannelStore(db, "secret-only-on-server-with-256-bit-entropy");
  afterEach(() => db.exec("DELETE FROM whatsapp_channels"));

  it("criptografa o token e nunca o inclui na listagem", () => {
    const item = store.upsert({ phoneNumberId: "123", wabaId: "999", displayName: "Atendimento", accessToken: "sensitive-token" });
    expect(JSON.stringify(store.list())).not.toContain("sensitive-token");
    expect(JSON.stringify(db.prepare("SELECT * FROM whatsapp_channels").all())).not.toContain("sensitive-token");
    store.activate(item.id);
    expect(store.active()?.accessToken).toBe("sensitive-token");
  });
  it("mantém apenas um canal ativo e conserva os anteriores", () => {
    const a = store.upsert({ phoneNumberId: "1", wabaId: "99", displayName: "A", accessToken: "a" });
    const b = store.upsert({ phoneNumberId: "2", wabaId: "99", displayName: "B", accessToken: "b" });
    store.activate(a.id);
    store.activate(b.id);
    expect(store.list().filter(x => x.active).map(x => x.id)).toEqual([b.id]);
    expect(store.list()).toHaveLength(2);
  });
  it("não altera registro com ID inexistente", () => {
    expect(() => store.activate("does-not-exist")).toThrow();
  });
});

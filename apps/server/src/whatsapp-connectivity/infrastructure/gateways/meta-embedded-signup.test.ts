import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { MetaEmbeddedSignup } from "./meta-embedded-signup.ts";
import { WhatsAppChannelStore } from "./whatsapp-channel-store.ts";

function setup(fetcher: typeof fetch) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE whatsapp_channels (
    id TEXT PRIMARY KEY, phone_number_id TEXT NOT NULL UNIQUE, waba_id TEXT NOT NULL,
    display_name TEXT NOT NULL, token_cipher TEXT NOT NULL, token_iv TEXT NOT NULL,
    token_tag TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );CREATE UNIQUE INDEX one_active_channel ON whatsapp_channels(active) WHERE active=1;`);
  const store = new WhatsAppChannelStore(db, "large-private-key-only-in-server-123456");
  const signup = new MetaEmbeddedSignup({appId:"123",configId:"456",appSecret:"server-secret"}, store,fetcher);
  return {db,store,signup};
}
describe("Embedded Signup seguro", () => {
  it("valida estado vinculado à sessão e verifica posse do telefone antes de salvar token", async () => {
    const fetcher=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:"private-access-token"}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data:[{id:"333",display_phone_number:"+55 16 9999",verified_name:"Teste"}]}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({success:true}),{status:200}));
    const {db,store,signup}=setup(fetcher);
    const state=signup.createState("valid-cookie");
    await expect(signup.complete({state,sessionCookie:"another-cookie",code:"code",wabaId:"222",phoneNumberId:"333"})).rejects.toThrow();
    const result=await signup.complete({state,sessionCookie:"valid-cookie",code:"code",wabaId:"222",phoneNumberId:"333"});
    expect(result.phoneNumberId).toBe("333");
    expect(JSON.stringify(store.list())).not.toContain("private-access-token");
    expect(JSON.stringify(db.prepare("SELECT * FROM whatsapp_channels").all())).not.toContain("private-access-token");
    expect(fetcher).toHaveBeenCalledTimes(3);
    await expect(signup.complete({state,sessionCookie:"valid-cookie",code:"code",wabaId:"222",phoneNumberId:"333"})).rejects.toThrow();
    db.close();
  });
  it("recusa telefone que não pertence ao WABA autorizado", async () => {
    const fetcher=vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:"private-access-token"}),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data:[{id:"other"}]}),{status:200}));
    const {db,store,signup}=setup(fetcher);
    await expect(signup.complete({state:signup.createState("cookie"),sessionCookie:"cookie",code:"code",wabaId:"222",phoneNumberId:"333"})).rejects.toThrow(/não pertence/);
    expect(store.list()).toHaveLength(0);
    db.close();
  });
});

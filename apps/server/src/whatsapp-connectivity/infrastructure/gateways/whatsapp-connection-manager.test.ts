import { afterEach, describe, expect, it, vi } from "vitest";
import { openDatabase } from "../../../shared/persistence/sqlite/open-database.ts";
import { BaileysSessionManager, type ManagedSession } from "./baileys-session-manager.ts";
import { WhatsAppChannelStore } from "./whatsapp-channel-store.ts";
import { WhatsAppConnectionManager } from "./whatsapp-connection-manager.ts";

describe("alternância de provedores sem contaminação de dados", () => {
  const db=openDatabase(":memory:");
  afterEach(()=>{db.exec("DELETE FROM outbound_jobs;DELETE FROM whatsapp_channels;DELETE FROM whatsapp_connection_preferences;");});
  it("impede trocar o número com mensagens pendentes e depois permite selecionar o local", async()=>{
    const make=():ManagedSession=>({
      start:vi.fn(async()=>{}),stop:vi.fn(async()=>{}),
      diagnostic:()=>({provider:"baileys",status:"connected",qrAvailable:false}),
      sendTextMessage:vi.fn(async()=>({wamid:"local"})),
      sendTemplateMessage:vi.fn(async()=>({wamid:"local"})),
    });
    const local=new BaileysSessionManager("./test-credentials","principal,secundaria",5,()=>make());
    const store=new WhatsAppChannelStore(db,"persistent-private-encryption-key-123456789");
    const manager=new WhatsAppConnectionManager(db,local,store,local);
    await manager.start({execute:()=>{}});
    const meta=store.upsert({phoneNumberId:"123",wabaId:"456",displayName:"Empresa A",accessToken:"token"});
    const at="2026-11-11T12:00:00Z";
    db.prepare("INSERT INTO outbound_jobs(operation_id,kind,payload_json,state,attempts,created_at,updated_at) VALUES (?,?,?,'pending',0,?,?)").run("pending-job","text","{}",at,at);
    await expect(manager.activateMeta(meta.id)).rejects.toThrow(/pendentes/);
    expect(manager.diagnostics().provider).toBe("baileys");
    db.prepare("DELETE FROM outbound_jobs").run();
    await manager.activateMeta(meta.id);
    expect(manager.diagnostics().provider).toBe("meta");
    expect(manager.localSessions().every(s=>s.status==="disconnected")).toBe(true);
    await manager.activateLocal("secundaria");
    expect(manager.diagnostics().provider).toBe("baileys");
    expect(local.getSelectedId()).toBe("secundaria");
    expect(store.active()).toBeNull();
    await local.stop();
  });
});

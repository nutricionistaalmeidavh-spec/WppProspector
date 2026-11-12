import { describe, expect, it, vi } from "vitest";
import { BaileysSessionManager, type ManagedSession } from "./baileys-session-manager.ts";

function fake(): ManagedSession {
  return {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    diagnostic: () => ({ provider: "baileys", status: "connected", qrAvailable: false }),
    sendTextMessage: vi.fn(async () => ({ wamid: "test-message" })),
    sendTemplateMessage: vi.fn(async () => ({ wamid: "test-template" })),
  };
}

describe("BaileysSessionManager", () => {
  it("inicia sessões isoladas e usa somente a principal para enviar", async () => {
    const created = new Map<string, ManagedSession>();
    const manager = new BaileysSessionManager("./auth", "principal,secundaria", 5, id => {
      const session = fake(); created.set(id, session); return session;
    });
    await manager.start({ execute: () => {} });
    expect(manager.listSessions().map(item => item.id)).toEqual(["principal", "secundaria"]);
    const result = await manager.sendTextMessage({ to: "+5516999999999", body: "Olá" });
    expect(result.wamid).toBe("test-message");
    expect(created.get("principal")?.sendTextMessage).toHaveBeenCalledOnce();
    expect(created.get("secundaria")?.sendTextMessage).not.toHaveBeenCalled();
    await manager.removeSession("secundaria");
    expect(manager.listSessions().length).toBe(1);
  });

  it("recusa IDs com traversal e mais de cinco sessões", () => {
    expect(() => new BaileysSessionManager("./auth", "../segredo")).toThrow(/inválido/);
    expect(() => new BaileysSessionManager("./auth", "a,b,c,d,e,f")).toThrow(/inválido/);
  });
  it("sincroniza a agenda somente da sessão selecionada, sem criar leads nem enviar mensagens", async () => {
    const callbacks = new Map<string, Parameters<ManagedSession["start"]>[0]>();
    const received = vi.fn();
    const manager = new BaileysSessionManager("./auth", "principal,secundaria", 5, id => ({
      ...fake(),
      start: vi.fn(async inbound => { callbacks.set(id, inbound); }),
    }));
    await manager.start({execute:()=>{}, contacts:received});
    const batch=[{phone:"+5516999999999",displayName:"Contato QA"}];
    callbacks.get("secundaria")?.contacts?.(batch);
    expect(received).not.toHaveBeenCalled();
    callbacks.get("principal")?.contacts?.(batch);
    expect(received).toHaveBeenCalledOnce();
    manager.selectSession("secundaria");
    callbacks.get("principal")?.contacts?.(batch);
    expect(received).toHaveBeenCalledTimes(1);
    callbacks.get("secundaria")?.contacts?.(batch);
    expect(received).toHaveBeenCalledTimes(2);
    await manager.stop();
  });

});

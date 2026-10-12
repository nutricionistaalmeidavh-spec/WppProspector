import { describe, expect, it, vi } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { SqliteConsentStore } from "../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";
import { AutomationStore } from "./automation-store.ts";
import { FollowupScheduler } from "./followup-scheduler.ts";

const phone = "+5516999999999";
const now = new Date("2026-10-12T12:00:00Z");
describe("FollowupScheduler", () => {
  it("nega agendamento sem consentimento e cancela quando o contato responde", () => {
    const db = openDatabase(":memory:");
    const consent = new SqliteConsentStore(db);
    const store = new AutomationStore(db, () => now);
    expect(() => store.scheduleFollowup({ phone, message: "Olá", dueAt: new Date(now.getTime()+60_000).toISOString() }, consent)).toThrow(/consentimento/i);
    consent.grant(phone, "formulario", now);
    const item = store.scheduleFollowup({ phone, message: "Olá", dueAt: new Date(now.getTime()+60_000).toISOString() }, consent);
    expect(item.state).toBe("pending");
    expect(store.cancelForReply(phone)).toBe(1);
    expect(store.listFollowups()[0]?.state).toBe("cancelled");
    db.close();
  });

  it("envia uma vez na data certa e cancela se autorização for revogada", async () => {
    const db = openDatabase(":memory:");
    const consent = new SqliteConsentStore(db);
    consent.grant(phone, "formulario", now);
    const store = new AutomationStore(db, () => new Date(now.getTime()+120_000));
    const a = store.scheduleFollowup({ phone, message: "Follow-up autorizado", dueAt: new Date(now.getTime()+60_000).toISOString() }, consent);
    const sender = vi.fn(async (_data: {to:string;body:string}) => ({ wamid: "w1" }));
    const scheduler = new FollowupScheduler(store, consent, sender);
    await scheduler.runDue();
    await scheduler.runDue();
    expect(sender).toHaveBeenCalledTimes(1);
    expect(store.listFollowups()[0]?.state).toBe("sent");
    expect(a.id).toBeDefined();
    const second=store.scheduleFollowup({ phone, message: "Outro", dueAt: new Date(now.getTime()+60_000).toISOString() }, consent);
    consent.optOut(phone);
    await scheduler.runDue();
    expect(sender).toHaveBeenCalledTimes(1);
    expect(store.getFollowup(second.id)?.state).toBe("cancelled");
    db.close();
  });
});

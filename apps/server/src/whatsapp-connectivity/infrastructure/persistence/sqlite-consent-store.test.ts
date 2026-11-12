import { describe, expect, it } from "vitest";
import { openDatabase } from "../../../shared/persistence/sqlite/open-database.ts";
import { SqliteConsentStore } from "./sqlite-consent-store.ts";

describe("SqliteConsentStore", () => {
  it("preserva consentimento no pedido de cancelamento de compra e reconhece o STOP isolado", () => {
    const db = openDatabase(":memory:");
    try {
      const store = new SqliteConsentStore(db);
      const phone = "+5516999999999";
      store.grant(phone, "opt-in-formulario");
      expect(store.processInbound(phone, "Quero cancelar minha compra")).toBe(false);
      expect(store.canProspect(phone)).toBe(true);
      expect(store.processInbound(phone, "Cancelar")).toBe(true);
      expect(store.canProspect(phone)).toBe(false);
    } finally { db.close(); }
  });

  it("interpreta cancelamento explícito de mensagens como opt-out, mas não de compra", () => {
    const db = openDatabase(":memory:");
    try {
      const store = new SqliteConsentStore(db);
      const phone = "+5516999999999";
      store.grant(phone, "opt-in-formulario");
      expect(store.processInbound(phone, "Quero cancelar minha compra")).toBe(false);
      expect(store.canProspect(phone)).toBe(true);
      expect(store.processInbound(phone, "Cancele o envio de mensagens")).toBe(true);
      expect(store.canProspect(phone)).toBe(false);
    } finally { db.close(); }
  });

  it("nega prospecção sem autorização registrada", () => {
    const db = openDatabase(":memory:");
    const store = new SqliteConsentStore(db);
    expect(store.canProspect("+5516999999999")).toBe(false);
    store.grant("+5516999999999", "formulario-site");
    expect(store.canProspect("+5516999999999")).toBe(true);
    db.close();
  });

  it("opt-out persiste após nova instância e tem precedência sobre a autorização", () => {
    const db = openDatabase(":memory:");
    const first = new SqliteConsentStore(db);
    first.grant("+5516999999999", "formulario");
    expect(first.processInbound("+5516999999999", "Não quero mais mensagens, pare")).toBe(true);
    expect(new SqliteConsentStore(db).canProspect("+5516999999999")).toBe(false);
    db.close();
  });
});

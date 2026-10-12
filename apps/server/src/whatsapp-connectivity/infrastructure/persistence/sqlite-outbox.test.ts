import { describe, expect, it } from "vitest";
import { openDatabase } from "../../../shared/persistence/sqlite/open-database.ts";
import { SqliteOutbox } from "./sqlite-outbox.ts";

describe("SqliteOutbox", () => {
  it("persiste jobs com mesmo operationId sem duplicar", () => {
    const db = openDatabase(":memory:");
    const queue = new SqliteOutbox(db);
    queue.enqueue("op-1", "text", { to: "+5516999999999", body: "Olá" });
    queue.enqueue("op-1", "text", { to: "+5516999999999", body: "Olá" });
    expect(queue.pending().length).toBe(1);
    db.close();
  });

  it("recupera jobs em progresso após uma interrupção", () => {
    const db = openDatabase(":memory:");
    const queue = new SqliteOutbox(db);
    queue.enqueue("op-2", "text", { to: "+5516999999999", body: "Olá" });
    queue.claim("op-2");
    expect(new SqliteOutbox(db).recoverStale().length).toBe(1);
    db.close();
  });
});

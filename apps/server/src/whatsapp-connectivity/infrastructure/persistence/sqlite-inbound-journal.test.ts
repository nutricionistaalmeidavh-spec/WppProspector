import { describe, expect, it } from "vitest";
import { openDatabase } from "../../../shared/persistence/sqlite/open-database.ts";
import { SqliteInboundJournal } from "./sqlite-inbound-journal.ts";

describe("SqliteInboundJournal", () => {
  it("mantém inbound salvo antes da confirmação e recupera após reinício lógico", () => {
    const db = openDatabase(":memory:");
    const first = new SqliteInboundJournal(db);
    const message = { from: "5516999999999", id: "wamid-1", timestamp: "1790000000", type: "text", text: { body: "Oi" } };
    first.record(message);
    first.record(message);
    expect(new SqliteInboundJournal(db).pending()).toEqual([message]);
    new SqliteInboundJournal(db).markStored("wamid-1");
    expect(new SqliteInboundJournal(db).pending()).toEqual([]);
    db.close();
  });
});

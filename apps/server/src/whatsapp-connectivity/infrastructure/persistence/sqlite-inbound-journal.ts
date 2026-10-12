import type { DatabaseSync } from "node:sqlite";
import type { RawInboundMessage } from "../../application/use-cases/handle-inbound-message.use-case.ts";

export class SqliteInboundJournal {
  constructor(private readonly db: DatabaseSync) {}

  record(message: RawInboundMessage): void {
    this.db.prepare(`INSERT OR IGNORE INTO inbound_journal(message_id,payload_json,received_at)
      VALUES(?,?,?)`).run(message.id, JSON.stringify(message), new Date().toISOString());
  }

  get(messageId: string): RawInboundMessage | null {
    const row = this.db.prepare("SELECT payload_json FROM inbound_journal WHERE message_id=? AND state='pending'")
      .get(messageId) as { payload_json: string } | undefined;
    return row ? JSON.parse(row.payload_json) as RawInboundMessage : null;
  }

  pending(limit = 1000): RawInboundMessage[] {
    return (this.db.prepare(`SELECT payload_json FROM inbound_journal WHERE state='pending'
      ORDER BY received_at LIMIT ?`).all(limit) as Array<{ payload_json: string }>)
      .map(row => JSON.parse(row.payload_json) as RawInboundMessage);
  }

  markStored(messageId: string): void {
    this.db.prepare("UPDATE inbound_journal SET state='stored',stored_at=? WHERE message_id=?")
      .run(new Date().toISOString(), messageId);
  }
}

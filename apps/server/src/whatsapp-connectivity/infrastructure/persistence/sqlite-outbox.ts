import type { DatabaseSync } from "node:sqlite";

export type OutboxKind = "text" | "template";
export interface OutboxJob {
  operationId: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  attempts: number;
  state: "pending" | "sending" | "sent" | "failed";
}

export class SqliteOutbox {
  constructor(private readonly db: DatabaseSync, private readonly clock = () => new Date()) {}

  enqueue(operationId: string, kind: OutboxKind, payload: Record<string, unknown>): void {
    const now = this.clock().toISOString();
    this.db.prepare(`INSERT OR IGNORE INTO outbound_jobs
    (operation_id,kind,payload_json,state,attempts,created_at,updated_at) VALUES (?,?,?,'pending',0,?,?)`)
      .run(operationId, kind, JSON.stringify(payload), now, now);
  }

  pending(): OutboxJob[] {
    const rows = this.db.prepare(`SELECT operation_id,kind,payload_json,attempts,state
      FROM outbound_jobs WHERE state='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
      ORDER BY created_at LIMIT 100`).all(this.clock().toISOString());
    return rows.map(row => this.fromRow(row as Record<string, unknown>));
  }

  claim(operationId: string): boolean {
    const result = this.db.prepare(`UPDATE outbound_jobs SET state='sending',
      attempts=attempts+1,updated_at=? WHERE operation_id=? AND state='pending'`)
      .run(this.clock().toISOString(), operationId);
    return Number(result.changes) === 1;
  }

  sent(operationId: string, wamid: string): void {
    this.db.prepare("UPDATE outbound_jobs SET state='sent',provider_message_id=?,updated_at=?,last_error=NULL WHERE operation_id=?")
      .run(wamid, this.clock().toISOString(), operationId);
  }

  fail(operationId: string, error: unknown): void {
    const row = this.db.prepare("SELECT attempts FROM outbound_jobs WHERE operation_id=?").get(operationId) as { attempts: number } | undefined;
    if (!row) return;
    const terminal = row.attempts >= 5;
    const retryMs = Math.min(60_000 * 2 ** Math.max(0, row.attempts - 1), 60 * 60_000);
    const retryAt = terminal ? null : new Date(this.clock().getTime() + retryMs).toISOString();
    this.db.prepare("UPDATE outbound_jobs SET state=?,next_attempt_at=?,last_error=?,updated_at=? WHERE operation_id=?")
      .run(terminal ? "failed" : "pending", retryAt, String(error instanceof Error ? error.message : error).slice(0, 500), this.clock().toISOString(), operationId);
  }

  cancel(operationId: string, reason: string): void {
    this.db.prepare("UPDATE outbound_jobs SET state='failed',next_attempt_at=NULL,last_error=?,updated_at=? WHERE operation_id=?")
      .run(reason.slice(0,500), this.clock().toISOString(), operationId);
  }

  recoverStale(): OutboxJob[] {
    this.db.prepare("UPDATE outbound_jobs SET state='pending',next_attempt_at=NULL WHERE state='sending'").run();
    return this.pending();
  }

  private fromRow(row: Record<string, unknown>): OutboxJob {
    return {
      operationId: String(row.operation_id),
      kind: row.kind as OutboxKind,
      payload: JSON.parse(String(row.payload_json)) as Record<string, unknown>,
      attempts: Number(row.attempts),
      state: row.state as OutboxJob["state"],
    };
  }
}

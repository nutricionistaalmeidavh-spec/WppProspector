import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CrmStore } from "../crm/crm-store.ts";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { SqliteInboundJournal } from "../whatsapp-connectivity/infrastructure/persistence/sqlite-inbound-journal.ts";
import { SqliteOutbox } from "../whatsapp-connectivity/infrastructure/persistence/sqlite-outbox.ts";

type Profile = "smoke" | "standard" | "exhaustion";
const profile: Profile = process.env.STRESS_PROFILE === "exhaustion" ? "exhaustion"
  : process.env.STRESS_PROFILE === "standard" ? "standard" : "smoke";
const size = (smoke: number, standard: number, exhaustion: number) =>
  ({ smoke, standard, exhaustion })[profile];
const phone = (id: number) => `+55119${String(10_000_000 + id)}`;
const at = "2026-11-12T12:00:00.000Z";

function metric(name: string, count: number, started: number, extra: Record<string, unknown> = {}): void {
  const durationMs = performance.now() - started;
  console.info("STRESS_METRIC " + JSON.stringify({
    profile, name, count, durationMs: Math.round(durationMs * 100) / 100,
    operationsPerSecond: Math.round(count * 1000 / Math.max(durationMs, 1)),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576 * 100) / 100,
    ...extra,
  }));
}

describe(`Stress SQLite e integridade [${profile}]`, () => {
  it("deduplica inbound/outbound, aplica limite de lote e recupera jobs em trânsito", () => {
    const count = size(1_000, 5_000, 25_000);
    const db = openDatabase(":memory:");
    const started = performance.now();
    try {
      const journal = new SqliteInboundJournal(db);
      const outbox = new SqliteOutbox(db, () => new Date(at));
      for (let index = 0; index < count; index++) {
        const message = {
          from: "5511999999999", id: `wamid.synthetic-${index}`,
          timestamp: "1794484800", type: "text", text: { body: "Mensagem fictícia" },
        };
        journal.record(message);
        outbox.enqueue(`op-${index}`, "text", { to: phone(index), body: "Simulado, nunca enviar" });
        if (index % 5 === 0) {
          journal.record(message);
          outbox.enqueue(`op-${index}`, "text", { to: phone(index), body: "Duplicata" });
        }
      }
      const inboundCount = db.prepare("SELECT COUNT(*) AS n FROM inbound_journal").get() as { n: number };
      const outboundCount = db.prepare("SELECT COUNT(*) AS n FROM outbound_jobs").get() as { n: number };
      expect(inboundCount.n).toBe(count);
      expect(outboundCount.n).toBe(count);
      expect(journal.pending(1000)).toHaveLength(Math.min(1000, count));
      expect(outbox.pending()).toHaveLength(Math.min(100, count));
      for (let index = 0; index < count; index += 2) journal.markStored(`wamid.synthetic-${index}`);
      expect(journal.pending(1000)).toHaveLength(Math.min(1000, Math.floor(count / 2)));

      const claims = Math.min(100, count);
      for (let index = 0; index < claims; index++) {
        expect(outbox.claim(`op-${index}`)).toBe(true);
        expect(outbox.claim(`op-${index}`)).toBe(false);
      }
      // Simula crash antes do ACK externo: a outbox deve recuperar, sem perder o job.
      const recovered = new SqliteOutbox(db, () => new Date(at)).recoverStale();
      expect(recovered.length).toBe(Math.min(100, count));
      for (let index = 0; index < claims; index++) {
        expect(outbox.get(`op-${index}`)?.state).toBe("pending");
        expect(outbox.get(`op-${index}`)?.attempts).toBe(1);
      }
      metric("sqlite-journal-outbox-idempotencia-recuperacao", count, started, { duplicateRate: 0.2 });
    } finally {
      db.close();
    }
  });

  it("preserva referências canônicas e transições após volume alto de oportunidades", () => {
    const count = size(120, 500, 2_500);
    const db = openDatabase(":memory:");
    const started = performance.now();
    try {
      const store = new CrmStore(db, () => new Date(at));
      const company = store.createCompany({ name: "Empresa fictícia de carga" });
      const insertLead = db.prepare(
        "INSERT INTO leads(phone,display_name,prospecting_state,created_at,updated_at) VALUES(?,?,'pending',?,?)",
      );
      for (let index = 0; index < count; index++) {
        const leadPhone = phone(index);
        insertLead.run(leadPhone, `Lead fictício ${index}`, at, at);
        const opportunity = store.createOpportunity({
          title: `Proposta ${index}`, companyId: company.id, leadPhone,
          estimatedValue: 12.34,
        });
        if (index % 4 === 0) store.updateOpportunity(opportunity.id, { stage: "won" });
      }
      expect((db.prepare("SELECT COUNT(*) AS n FROM crm_opportunities").get() as { n: number }).n).toBe(count);
      expect((db.prepare("SELECT COUNT(*) AS n FROM crm_stage_events").get() as { n: number }).n)
        .toBe(count + Math.ceil(count / 4));
      const orphans = db.prepare(`SELECT COUNT(*) AS n FROM crm_opportunities o
        LEFT JOIN leads l ON l.phone=o.lead_phone
        LEFT JOIN crm_companies c ON c.id=o.company_id
        WHERE l.phone IS NULL OR c.id IS NULL`).get() as { n: number };
      expect(orphans.n).toBe(0);
      expect(store.listCompanies()[0]?.opportunityCount).toBe(count);
      expect(store.listCompanies()[0]?.pipelineValue).toBeCloseTo((count - Math.ceil(count / 4)) * 12.34, 2);
      // A listagem é limitada a 500; dados adicionais continuam persistidos.
      expect(store.listOpportunities()).toHaveLength(Math.min(500, count));
      metric("sqlite-crm-integridade-canonica", count, started, { won: Math.ceil(count / 4), orphans: 0 });
    } finally {
      db.close();
    }
  });

  it("mantém journal e outbox após fechar e reabrir o banco em WAL", () => {
    const directory = mkdtempSync(join(tmpdir(), "wpp-stress-"));
    const path = join(directory, "crm.sqlite");
    const started = performance.now();
    try {
      const first = openDatabase(path);
      try {
        const journal = new SqliteInboundJournal(first);
        journal.record({ from: "5511999999999", id: "wal-test", timestamp: "1794484800",
          type: "text", text: { body: "Teste persistido" } });
        new SqliteOutbox(first, () => new Date(at)).enqueue("wal-outbox", "text", {
          to: phone(0), body: "Somente teste",
        });
      } finally {
        first.close();
      }
      const reopened = openDatabase(path);
      try {
        expect(new SqliteInboundJournal(reopened).pending(10).map((msg) => msg.id)).toEqual(["wal-test"]);
        expect(new SqliteOutbox(reopened).get("wal-outbox")?.state).toBe("pending");
        expect((reopened.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode)
          .toBe("wal");
      } finally {
        reopened.close();
      }
      metric("sqlite-wal-restart", 2, started);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

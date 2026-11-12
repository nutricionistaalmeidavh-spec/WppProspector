import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { buildAdminTestApp } from "../management/test-support/admin-test-app.ts";
import { buildConversation } from "../management/test-support/conversation-fixtures.ts";

type Profile = "smoke" | "standard" | "exhaustion";
const profile: Profile = process.env.STRESS_PROFILE === "exhaustion" ? "exhaustion"
  : process.env.STRESS_PROFILE === "standard" ? "standard" : "smoke";
const size = (smoke: number, standard: number, exhaustion: number) =>
  ({ smoke, standard, exhaustion })[profile];
const phone = (id: number) => `+55119${String(10_000_000 + id)}`;

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return Math.round(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]! * 100) / 100;
}
function metric(name: string, count: number, started: number, durations: number[], extra: Record<string, unknown> = {}): void {
  const durationMs = performance.now() - started;
  console.info("STRESS_METRIC " + JSON.stringify({
    profile, name, count, durationMs: Math.round(durationMs * 100) / 100,
    rps: Math.round(count * 1000 / Math.max(durationMs, 1)),
    p50Ms: percentile(durations, 0.5), p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576 * 100) / 100,
    ...extra,
  }));
}

describe(`Stress API de gestão e limites [${profile}]`, () => {
  it("pagina volume alto sem duplicar, aplica limites 100/101 e mantém autenticação", async () => {
    const count = size(300, 1_000, 3_000);
    const conversations = Array.from({ length: count }, (_, index) =>
      buildConversation({
        leadPhone: phone(index), at: new Date(Date.UTC(2026, 10, 12, 12, 0, 0) + index * 1000),
      }),
    );
    const harness = await buildAdminTestApp({ conversations });
    const started = performance.now();
    try {
      const cookie = await harness.login();
      const seen = new Set<string>();
      let cursor: string | null = null;
      do {
        const url: string = cursor
          ? `/admin/api/conversations?limit=100&cursor=${encodeURIComponent(cursor)}`
          : "/admin/api/conversations?limit=100";
        const response = await harness.app.inject({ method: "GET", url, headers: { cookie } });
        expect(response.statusCode).toBe(200);
        const body = response.json() as {
          items: Array<{ leadPhone: string }>; nextCursor: string | null; pageSize: number;
        };
        expect(body.items.length).toBeLessThanOrEqual(100);
        expect(body.pageSize).toBe(100);
        for (const row of body.items) {
          expect(seen.has(row.leadPhone)).toBe(false);
          seen.add(row.leadPhone);
        }
        cursor = body.nextCursor;
      } while (cursor);
      expect(seen.size).toBe(count);
      for (const limit of ["0", "-1", "101", "999999", "NaN"]) {
        const res = await harness.app.inject({
          method: "GET", url: `/admin/api/conversations?limit=${limit}`, headers: { cookie },
        });
        expect(res.statusCode).toBe(400);
      }
      expect((await harness.app.inject({ method: "GET", url: "/admin/api/conversations" })).statusCode)
        .toBe(401);
      metric("api-paginacao-limites-auth", count, started, [], { pages: Math.ceil(count / 100) });
    } finally {
      await harness.close();
    }
  });

  it("rejeita payload HTTP acima de 1 MiB sem causar erro interno", async () => {
    const harness = await buildAdminTestApp();
    try {
      const response = await harness.app.inject({
        method: "POST",
        url: "/admin/api/session",
        payload: { secret: "x".repeat(1_100_000) },
      });
      expect(response.statusCode).toBe(413);
      expect((await harness.app.inject({
        method: "GET", url: "/admin/api/conversations",
      })).statusCode).toBe(401);
    } finally {
      await harness.close();
    }
  });

  it("suporta leitores concorrentes sem 500, vazamento de sessão ou inconsistência nas estatísticas", async () => {
    const concurrency = size(60, 250, 900);
    const harness = await buildAdminTestApp({
      conversations: Array.from({ length: 120 }, (_, index) =>
        buildConversation({ leadPhone: phone(index) }),
      ),
    });
    const started = performance.now();
    const latencies: number[] = [];
    try {
      const cookie = await harness.login();
      let completed = 0;
      let unauthorized = 0;
      // Rajadas limitadas de 50 requisições: reproduz concorrência sem saturar o runner do CI.
      for (let offset = 0; offset < concurrency; offset += 50) {
        const responses = await Promise.all(Array.from({
          length: Math.min(50, concurrency - offset),
        }, async (_, index) => {
          const id = offset + index;
          const authenticated = id % 10 !== 0;
          const url = id % 2 === 0 ? "/admin/api/conversations?limit=100" : "/admin/api/stats/overview";
          const began = performance.now();
          const response = await harness.app.inject({
            method: "GET", url, headers: authenticated ? { cookie } : {},
          });
          latencies.push(performance.now() - began);
          return { response, authenticated };
        }));
        for (const { response, authenticated } of responses) {
          expect(response.statusCode).toBe(authenticated ? 200 : 401);
          if (authenticated && response.statusCode === 200) {
            const body = response.json() as { items?: unknown[]; totalLeads?: number };
            if (body.items) expect(body.items.length).toBe(100);
            if (body.totalLeads !== undefined) expect(body.totalLeads).toBe(120);
          } else {
            unauthorized++;
          }
          completed++;
        }
      }
      expect(completed).toBe(concurrency);
      expect(unauthorized).toBe(Math.ceil(concurrency / 10));
      metric("api-concorrencia-leitura", concurrency, started, latencies, { unauthorized, errors5xx: 0 });
    } finally {
      await harness.close();
    }
  });
});

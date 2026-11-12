import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InboundMessageDto } from "../whatsapp-connectivity/application/ports/inbound-message.port.ts";
import type { ConversationRepositoryPort } from "../conversation-engine/application/ports/conversation-repository.port.ts";
import { Conversation } from "../conversation-engine/domain/conversation.ts";
import { InboundBatchCoordinator } from "../conversation-engine/infrastructure/inbound/inbound-batch-coordinator.ts";
import { LeadSerialQueue } from "../conversation-engine/infrastructure/inbound/lead-serial-queue.ts";
import { evaluateRules, type EngineRule } from "../automation/rule-evaluator.ts";

type Profile = "smoke" | "standard" | "exhaustion";
const profile: Profile = process.env.STRESS_PROFILE === "exhaustion" ? "exhaustion"
  : process.env.STRESS_PROFILE === "standard" ? "standard" : "smoke";
const size = (smoke: number, standard: number, exhaustion: number) =>
  ({ smoke, standard, exhaustion })[profile];
const phone = (id: number) => `+55119${String(10_000_000 + id)}`;
const stamp = new Date("2026-11-12T12:00:00.000Z");

function metric(name: string, count: number, started: number, extra: Record<string, unknown> = {}): void {
  const durationMs = performance.now() - started;
  console.info("STRESS_METRIC " + JSON.stringify({
    profile, name, count, durationMs: Math.round(durationMs * 100) / 100,
    operationsPerSecond: Math.round(count * 1000 / Math.max(durationMs, 1)),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1048576 * 100) / 100,
    ...extra,
  }));
}

afterEach(() => vi.useRealTimers());

describe(`Stress de processamento interno [${profile}]`, () => {
  it("serializa cada lead, mantém paralelismo entre leads e se recupera de falhas em rajada", async () => {
    const count = size(2_000, 12_000, 60_000);
    const leadCount = 100;
    const queue = new LeadSerialQueue();
    const running = new Map<number, number>();
    const order = new Map<number, number[]>();
    let globalActive = 0;
    let peakGlobal = 0;
    let peakPerLead = 0;
    const started = performance.now();
    const tasks = Array.from({ length: count }, (_, index) => {
      const lead = index % leadCount;
      return queue.run(phone(lead), async () => {
        const active = (running.get(lead) ?? 0) + 1;
        running.set(lead, active);
        peakPerLead = Math.max(peakPerLead, active);
        globalActive++;
        peakGlobal = Math.max(peakGlobal, globalActive);
        const seen = order.get(lead) ?? [];
        seen.push(index);
        order.set(lead, seen);
        try {
          await Promise.resolve();
          if (index % 113 === 0) throw new Error("falha sintética de processamento");
          return index;
        } finally {
          running.set(lead, (running.get(lead) ?? 1) - 1);
          globalActive--;
        }
      });
    });
    const results = await Promise.allSettled(tasks);
    await queue.whenSettled();
    const rejected = results.filter((result) => result.status === "rejected").length;
    expect(rejected).toBe(Math.ceil(count / 113));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(count - rejected);
    expect(peakPerLead).toBe(1);
    expect(peakGlobal).toBeGreaterThan(1);
    expect(globalActive).toBe(0);
    for (const seen of order.values()) {
      expect(seen).toEqual([...seen].sort((a, b) => a - b));
    }
    expect(order.size).toBe(leadCount);
    await expect(queue.run(phone(0), async () => "recuperado")).resolves.toBe("recuperado");
    metric("fila-serial-concorrencia-recuperacao", count, started, { rejected, peakGlobal, peakPerLead });
  });

  it("absorve rajada de mensagens, descarta reentregas e gera um lote por lead", async () => {
    vi.useFakeTimers();
    const count = size(700, 3_000, 10_000);
    const leadCount = 50;
    const store = new Map<string, Conversation>();
    const repository: ConversationRepositoryPort = {
      async load(leadPhone) { return store.get(leadPhone) ?? null; },
      async save(conversation) { store.set(conversation.leadPhone, conversation); },
      async findConversationsWithPendingInbound() {
        return [...store.values()].filter((conversation) => conversation.pendingInboundTurns.length > 0);
      },
    };
    const batches: Array<{ leadPhone: string; messageIds: string[] }> = [];
    const errors: string[] = [];
    const coordinator = new InboundBatchCoordinator({
      repository,
      logger: { info: () => {}, warn: () => {}, error: (message) => { errors.push(message); } },
      generateReply: {
        async execute(leadPhone, messageIds) { batches.push({ leadPhone, messageIds: [...messageIds] }); },
      },
      batchWindowMs: 5,
      queue: new LeadSerialQueue(),
    });
    const started = performance.now();
    for (let index = 0; index < count; index++) {
      const message: InboundMessageDto = {
        from: phone(index % leadCount), messageId: `synthetic-${index}`,
        timestamp: stamp, text: `Mensagem de teste ${index}`,
      };
      coordinator.receive(message);
      if (index % 4 === 0) coordinator.receive(message); // Meta pode reentregar o mesmo ID.
    }
    await coordinator.whenSettled();
    await vi.advanceTimersByTimeAsync(5);
    await coordinator.whenSettled();
    expect(errors).toEqual([]);
    expect(store.size).toBe(leadCount);
    expect(batches).toHaveLength(leadCount);
    expect(batches.reduce((sum, batch) => sum + batch.messageIds.length, 0)).toBe(count);
    for (const [leadPhone, conversation] of store) {
      expect(conversation.turns).toHaveLength(count / leadCount);
      const ids = batches.find((batch) => batch.leadPhone === leadPhone)?.messageIds ?? [];
      expect(ids).toHaveLength(count / leadCount);
      expect(new Set(ids).size).toBe(ids.length);
    }
    metric("inbound-burst-deduplicacao", count, started, { leads: leadCount, batches: batches.length });
  });

  it("respeita política obrigatória e isolamento de decisões sob muitos disparos de regras", () => {
    const count = size(2_000, 12_000, 60_000);
    const rules: EngineRule[] = Array.from({ length: 120 }, (_, index) => ({
      id: `regra-${index}`, name: `Regra ${index}`, enabled: true,
      priority: index, match: "equals", trigger: `produto-${index}`,
      action: "reply", response: `Resposta ${index}`, options: [],
    }));
    const started = performance.now();
    const input = {
      phone: phone(0), eventType: "message.received" as const,
      businessId: "loja-ficticia", channelId: "baileys:teste",
    };
    for (let index = 0; index < count; index++) {
      const kind = index % 4;
      const message = kind === 0 ? "produto-119"
        : kind === 1 ? "quero falar com atendente"
        : kind === 2 ? "pare de me enviar mensagens" : "outro assunto";
      const result = evaluateRules(rules, { ...input, message }, null);
      if (kind === 0) {
        expect(result.matchedRuleId).toBe("regra-119");
        expect(result.source).toBe("rule");
      } else if (kind === 1) {
        expect(result.source).toBe("policy");
        expect(result.decision?.handoffToHuman).toBe(true);
      } else if (kind === 2) {
        expect(result.source).toBe("policy");
        expect(result.decision?.endConversation).toBe(true);
      } else {
        expect(result.source).toBe("none");
      }
    }
    metric("motor-regras-120-regras", count, started, { rules: rules.length });
  });
});

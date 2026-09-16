import { describe, expect, it } from "vitest";
import { buildAttentionItems, buildRecentConversations } from "./OverviewRoute";

describe("buildAttentionItems", () => {
  it("descreve respostas como mensagens recebidas, sem jargão inbound", () => {
    const items = buildAttentionItems({ awaitingHuman: 0, pendingInbound: 2 });

    expect(items).toEqual([
      { label: "2 mensagens recebidas pendentes", to: "/conversations/inbox" },
    ]);
    expect(items.some((item) => item.label.toLowerCase().includes("inbound"))).toBe(false);
  });
});

describe("buildRecentConversations", () => {
  it("ordena por atividade recente, limita a lista e não altera a entrada", () => {
    const source = [
      { id: "older", lastActivityAt: "2026-09-05T12:00:00Z" },
      { id: "newest", lastActivityAt: "2026-09-05T14:00:00Z" },
      { id: "middle", lastActivityAt: "2026-09-05T13:00:00Z" },
    ];

    const result = buildRecentConversations(source, 2);

    expect(result.map((item) => item.id)).toEqual(["newest", "middle"]);
    expect(source.map((item) => item.id)).toEqual(["older", "newest", "middle"]);
  });
});

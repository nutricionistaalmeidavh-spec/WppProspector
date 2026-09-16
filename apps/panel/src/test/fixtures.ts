import type {
  ConsumptionSeries,
  ConversationDetail,
  ConversationListItem,
  ConversationListPage,
  Overview,
} from "@/api/contracts";

export function listItem(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
  return {
    leadPhone: "5511999990000",
    state: "active",
    leadIntent: "interested",
    leadQualification: "warm",
    turnCount: 3,
    lastActivityAt: "2026-09-02T12:00:00.000Z",
    hasPendingInbound: false,
    quotedPlan: null,
    ...overrides,
  };
}

export function listPage(overrides: Partial<ConversationListPage> = {}): ConversationListPage {
  return {
    items: [listItem()],
    pageSize: 25,
    nextCursor: null,
    ...overrides,
  };
}

export function conversationDetail(
  overrides: Partial<ConversationDetail> = {},
): ConversationDetail {
  return {
    leadPhone: "5511999990000",
    state: "active",
    leadIntent: "needs_more_info",
    leadQualification: null,
    recommendedModules: [],
    interestedModules: [],
    quotedPlan: "essencial",
    hasPendingInbound: false,
    hasAbandonedInbound: false,
    turnCount: 2,
    lastActivityAt: "2026-09-02T12:00:00.000Z",
    turns: [
      {
        direction: "inbound",
        text: "olá, quero saber mais",
        timestamp: "2026-09-02T11:59:00.000Z",
      },
      {
        direction: "outbound",
        text: "claro! posso te explicar",
        timestamp: "2026-09-02T12:00:00.000Z",
        origin: "bot",
      },
    ],
    ...overrides,
  };
}

export function overview(overrides: Partial<Overview> = {}): Overview {
  return {
    conversationsByState: { active: 4, ended: 2, awaitingHuman: 1 },
    totalLeads: 7,
    pendingInbound: 2,
    ...overrides,
  };
}

export function consumptionSeries(overrides: Partial<ConsumptionSeries> = {}): ConsumptionSeries {
  return {
    groupBy: "day",
    range: { from: "2026-08-26T00:00:00.000Z", to: "2026-09-02T00:00:00.000Z" },
    rows: [
      {
        key: "2026-09-01",
        inputTokens: 1000,
        outputTokens: 400,
        cacheReadTokens: 200,
        cacheWriteTokens: 50,
        estimatedCostUsd: 0.12,
        costPartial: false,
      },
      {
        key: "2026-09-02",
        inputTokens: 2000,
        outputTokens: 800,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        estimatedCostUsd: 0.2,
        costPartial: true,
      },
    ],
    total: {
      inputTokens: 3000,
      outputTokens: 1200,
      cacheReadTokens: 200,
      cacheWriteTokens: 50,
      estimatedCostUsd: 0.32,
      costPartial: true,
    },
    ...overrides,
  };
}

export const EMPTY_CONSUMPTION: ConsumptionSeries = {
  groupBy: "day",
  range: { from: "2026-08-26T00:00:00.000Z", to: "2026-09-02T00:00:00.000Z" },
  rows: [],
  total: {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0,
    costPartial: false,
  },
};

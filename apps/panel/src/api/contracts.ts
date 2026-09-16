/**
 * Ponto único de importação dos contratos de resposta da API de gestão. Os
 * schemas zod e a versão vêm do pacote do servidor
 * (`@wpp/contracts`) — não redefina DTOs aqui.
 */
export {
  MANAGEMENT_CONTRACT_VERSION,
  CONVERSATION_STATES,
  conversationStateSchema,
  leadIntentSchema,
  leadQualificationSchema,
  commercialPlanSchema,
  moduleIdSchema,
  isoDateStringSchema,
  conversationListItemSchema,
  conversationListPageSchema,
  conversationDetailTurnSchema,
  conversationDetailSchema,
  prospectingStateSchema,
  PROSPECTING_STATES,
  leadResourceSchema,
  leadListItemSchema,
  leadListPageSchema,
  importLeadsInputSchema,
  importLeadsResultSchema,
  bulkProspectInputSchema,
  bulkProspectOutcomeSchema,
  bulkProspectResultSchema,
  resetLeadResultSchema,
  capabilitiesSchema,
  leadListQuerySchema,
  LEADS_PAGE_DEFAULT,
  LEADS_PAGE_MAX,
  CONSUMPTION_GROUP_BY,
  consumptionGroupBySchema,
  consumptionTotalsSchema,
  consumptionRowSchema,
  consumptionSeriesSchema,
  overviewSchema,
  EMPTY_OVERVIEW,
  CONVERSATIONS_PAGE_DEFAULT,
  CONVERSATIONS_PAGE_MAX,
} from "@wpp/contracts";

export type {
  ConversationListItem,
  ConversationListPage,
  ConversationDetail,
  ConsumptionTotals,
  ConsumptionRow,
  ConsumptionSeries,
  Overview,
  LeadResource,
  LeadListItem,
  LeadListPage,
  ImportLeadsInput,
  ImportLeadsResult,
  ImportRejectedItem,
  BulkProspectInput,
  BulkProspectOutcome,
  BulkProspectResultItem,
  BulkProspectResult,
  ResetLeadResult,
  Capabilities as ManagementCapabilities,
} from "@wpp/contracts";

import type { consumptionGroupBySchema } from "@wpp/contracts";
import type { z } from "zod";

/** `"day" | "lead" | "model" | "category"`. */
export type ConsumptionGroupBy = z.infer<typeof consumptionGroupBySchema>;

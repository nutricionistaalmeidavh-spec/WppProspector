import cookie from "@fastify/cookie";
import { BusinessAiStore } from "../../../business/business-ai-store.ts";
import { registerOnboardingRoutes } from "../../../onboarding/onboarding.routes.ts";
import { registerBusinessSettingsRoutes } from "../../../business/business-settings.routes.ts";
import type { FastifyPluginAsync } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { ConversationRepositoryPort } from "../../../conversation-engine/application/ports/conversation-repository.port.ts";
import type { LeadSerialQueue } from "../../../conversation-engine/infrastructure/inbound/lead-serial-queue.ts";
import type { SendOutboundMessageUseCase } from "../../../whatsapp-connectivity/application/use-cases/send-outbound-message.use-case.ts";
import type { SendTextMessageUseCase } from "../../../whatsapp-connectivity/application/use-cases/send-text-message.use-case.ts";
import { BulkProspectLeadsUseCase } from "../../application/bulk-prospect-leads.use-case.ts";
import { ConversationActionUseCase } from "../../application/conversation-action.use-case.ts";
import { ImportLeadsUseCase } from "../../application/import-leads.use-case.ts";
import { ProspectLeadUseCase } from "../../application/prospect-lead.use-case.ts";
import { RegisterLeadUseCase } from "../../application/register-lead.use-case.ts";
import { ResetLeadProspectingUseCase } from "../../application/reset-lead-prospecting.use-case.ts";
import type { AdminActionAuditPort } from "../../application/ports/admin-action-audit.port.ts";
import type { LeadRepositoryPort } from "../../application/ports/lead-repository.port.ts";
import { ConsumptionStatsService } from "../../application/consumption-stats.service.ts";
import type { Logger } from "../../application/ports/logger.port.ts";
import type { ResolvedAdminConfig } from "../config/env.ts";
import { ConversationIndexQueries } from "../persistence/conversation-index-queries.ts";
import { registerAdminCapabilitiesRoutes } from "./admin-capabilities.routes.ts";
import { registerAdminConversationActionsRoutes } from "./admin-conversation-actions.routes.ts";
import { registerAdminConversationsRoutes } from "./admin-conversations.routes.ts";
import { registerAdminLeadsRoutes } from "./admin-leads.routes.ts";
import { registerAdminSessionRoutes } from "./admin-session.routes.ts";
import { registerAdminStatsRoutes } from "./admin-stats.routes.ts";
import { applyAdminStatic } from "./admin-static.ts";
import { registerConsentRoutes } from "../../../whatsapp-connectivity/infrastructure/http/routes/consent.routes.ts";
import type { SqliteConsentStore } from "../../../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";
import { createAdminSessionGuard } from "./session-guard.ts";
import type { AutomationStore } from "../../../automation/automation-store.ts";
import { registerAutomationRoutes } from "../../../automation/automation.routes.ts";
import { CrmStore } from "../../../crm/crm-store.ts";
import { EngagementStore } from "../../../crm/engagement-store.ts";
import { registerEngagementRoutes } from "../../../crm/engagement-routes.ts";
import {listArtisysCommerceSales} from "../../../integrations/artisys-commerce.routes.ts";
import { registerCrmRoutes } from "../../../crm/crm-routes.ts";
import { TeamStore } from "../../../team/team-store.ts";
import { registerTeamRoutes } from "../../../team/team.routes.ts";
import { registerWhatsAppConnectionsRoutes } from "../../../whatsapp-connectivity/infrastructure/http/routes/whatsapp-connections.routes.ts";
import { registerWhatsAppContactsRoutes } from "../../../whatsapp-connectivity/infrastructure/http/routes/whatsapp-contacts.routes.ts";
import { WhatsappContactsStore } from "../../../whatsapp-connectivity/infrastructure/persistence/whatsapp-contacts-store.ts";
import type { WhatsAppConnectionManager } from "../../../whatsapp-connectivity/infrastructure/gateways/whatsapp-connection-manager.ts";
import type { MetaEmbeddedSignup } from "../../../whatsapp-connectivity/infrastructure/gateways/meta-embedded-signup.ts";

export interface AdminRoutesDeps {
  config: ResolvedAdminConfig;
  db: DatabaseSync;
  /** Repositório de conversas (fonte da verdade) — usado no detalhe e nas ações. */
  repository: ConversationRepositoryPort;
  /** Envio de texto de sessão — delegado pelas ações de operação (mensagem avulsa). */
  sendText: SendTextMessageUseCase;
  /** Envio de template — delegado pelo disparo de prospecção (primeiro contato). */
  sendTemplate: SendOutboundMessageUseCase;
  /** Repositório dos leads de prospecção. */
  leads: LeadRepositoryPort;
  /** Fila serial por lead — compartilhada com o processamento de inbound. */
  queue: LeadSerialQueue;
  /** Trilha de auditoria append-only das ações de operação. */
  audit: AdminActionAuditPort;
  logger: Logger;
  consent?: SqliteConsentStore | undefined;
  diagnostics?: (() => { provider: string; status: string; qrAvailable: boolean }) | undefined;
  prospectingEnabled?: boolean | (() => boolean) | undefined;
  whatsappConnections?: WhatsAppConnectionManager | undefined;
  embeddedMetaSignup?: MetaEmbeddedSignup | undefined;
  automation?: AutomationStore | undefined;
  businessAiStore?: BusinessAiStore | undefined;
  followupsEnabled?: boolean | (() => boolean) | undefined;
  clock?: () => Date;
}

/**
 * Plugin `/admin`: cookie + guarda de sessão + rotas de sessão/conversas/stats
 * + ações de operação sobre conversas + estáticos da SPA. Montado ao lado do
 * plugin de webhook no mesmo processo, isolado dele (encapsulamento do Fastify).
 * Registrado com `prefix: "/admin"`.
 */
export const registerAdminRoutes: FastifyPluginAsync<AdminRoutesDeps> = async (app, deps) => {
  const clock = deps.clock ?? (() => new Date());

  await app.register(cookie);
  const team=new TeamStore(deps.db,clock);
  app.addHook(
    "preHandler",
    createAdminSessionGuard({ sessionSecret: deps.config.sessionSecret, clock,team }),
  );

  const queries = new ConversationIndexQueries(deps.db);
  const consumptionStats = new ConsumptionStatsService(deps.db);
  const conversationActions = new ConversationActionUseCase({
    repository: deps.repository,
    queue: deps.queue,
    sendText: deps.sendText,
    audit: deps.audit,
    logger: deps.logger,
    clock,
  });
  const registerLead = new RegisterLeadUseCase({ leads: deps.leads });
  const prospectLead = new ProspectLeadUseCase({
    isConvertedCustomer:(phone)=>Boolean(deps.db.prepare("SELECT 1 FROM crm_customers WHERE lead_phone=?").get(phone)),
    leads: deps.leads,
    conversations: deps.repository,
    queue: deps.queue,
    sendTemplate: deps.sendTemplate,
    template: deps.config.firstContactTemplate,
    audit: deps.audit,
    logger: deps.logger,
    clock,
  });
  const importLeads = new ImportLeadsUseCase({ leads: deps.leads });
  const bulkProspect = new BulkProspectLeadsUseCase({ prospectLead, leads: deps.leads });
  const resetLead = new ResetLeadProspectingUseCase({
    leads: deps.leads,
    audit: deps.audit,
    logger: deps.logger,
    clock,
  });
  const cookiePath = app.prefix !== "" ? app.prefix : "/";

  await app.register(registerAdminSessionRoutes, {
    accessSecret: deps.config.accessSecret,
    sessionSecret: deps.config.sessionSecret,
    sessionTtlMs: deps.config.sessionTtlMs,
    cookiePath,
    clock,
    team,
  });
  await app.register(registerAdminConversationsRoutes, {
    queries,
    repository: deps.repository,
  });
  await app.register(registerAdminConversationActionsRoutes, { conversationActions });
  const prospectingAllowed=()=>typeof deps.prospectingEnabled==="function"?deps.prospectingEnabled():deps.prospectingEnabled??true;
  await app.register(registerAdminLeadsRoutes, {
    registerLead,
    prospectLead,
    importLeads,
    bulkProspect,
    resetLead,
    leads: deps.leads,
    prospectingEnabled: prospectingAllowed,
  });
  await app.register(registerAdminCapabilitiesRoutes, {
    conversationActions: true,
    prospecting: prospectingAllowed,
    crm: { opportunities: true, companies: true, campaigns: true },
  });
  await app.register(registerAdminStatsRoutes, { consumptionStats, queries });
  await app.register(registerBusinessSettingsRoutes, { db: deps.db, store: deps.businessAiStore ?? new BusinessAiStore(deps.db), sessionSecret: deps.config.sessionSecret, clock });
  const crmStore = new CrmStore(deps.db);
  await app.register(registerCrmRoutes, {
    store:crmStore,prospectLead,prospectingEnabled:prospectingAllowed,
    onOpportunityUpdated: opportunity=>deps.automation?.evaluateEvent({
      phone:opportunity.leadPhone,message:"",eventType:"crm.opportunity_updated",
      businessId:"default",channelId:deps.whatsappConnections?.activeChannelKey()??"default",
      crmStage:opportunity.stage,crmOpportunityId:opportunity.id,
    }),
  });
  await app.register(registerEngagementRoutes, {
    store:new EngagementStore(deps.db,clock),sessionSecret:deps.config.sessionSecret,clock,
    onStageMoved:(id,stage)=>{
      const opportunity=crmStore.getOpportunity(id);
      if(!opportunity||opportunity.stage!==stage)return;
      deps.automation?.evaluateEvent({phone:opportunity.leadPhone,message:"",eventType:"crm.opportunity_updated",
        businessId:"default",channelId:deps.whatsappConnections?.activeChannelKey()??"default",
        crmStage:opportunity.stage,crmOpportunityId:opportunity.id});
    },
  });
  app.get("/api/crm/external-sales",async()=>({items:listArtisysCommerceSales(deps.db)}));
  await app.register(registerOnboardingRoutes, { db: deps.db, sessionSecret: deps.config.sessionSecret, clock });
  await app.register(registerWhatsAppContactsRoutes, {
    store: new WhatsappContactsStore(deps.db, clock), leads: deps.leads,
  });
  await app.register(registerTeamRoutes,{store:team});
  if (deps.consent) await app.register(registerConsentRoutes, { consent: deps.consent });
  if (deps.automation && deps.consent) await app.register(registerAutomationRoutes, {
    automation: deps.automation, consent: deps.consent, followupsEnabled: deps.followupsEnabled ?? false,
  });
  if (deps.diagnostics) app.get("/api/connection", async () => deps.diagnostics!());
  if (deps.whatsappConnections) await app.register(registerWhatsAppConnectionsRoutes, {
    manager: deps.whatsappConnections, signup: deps.embeddedMetaSignup,
  });

  await applyAdminStatic(app, { webDistDir: deps.config.webDistDir, logger: deps.logger });
};

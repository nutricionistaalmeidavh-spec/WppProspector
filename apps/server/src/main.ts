import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ConversationRepositoryPort } from "./conversation-engine/application/ports/conversation-repository.port.ts";
import { GenerateReplyUseCase } from "./conversation-engine/application/use-cases/generate-reply.use-case.ts";
import { loadConversationEngineEnv } from "./conversation-engine/infrastructure/config/env.ts";
import { PendingInboundSweeper } from "./conversation-engine/infrastructure/boot/pending-inbound-sweeper.ts";
import { InboundBatchCoordinator } from "./conversation-engine/infrastructure/inbound/inbound-batch-coordinator.ts";
import { LeadSerialQueue } from "./conversation-engine/infrastructure/inbound/lead-serial-queue.ts";
import { loadKnowledge } from "./conversation-engine/infrastructure/knowledge/knowledge-loader.ts";
import { LexicalRetrievalBusinessContext } from "./conversation-engine/infrastructure/knowledge/lexical-retrieval.business-context.ts";
import { AnthropicLlmClient } from "./conversation-engine/infrastructure/llm/anthropic-llm-client.ts";
import { LocalRulesLlmClient } from "./conversation-engine/infrastructure/llm/local-rules-llm-client.ts";
import { FileConversationRepository } from "./conversation-engine/infrastructure/persistence/file-conversation-repository.ts";
import { NoopUsageRecorder } from "./conversation-engine/infrastructure/persistence/noop-usage-recorder.ts";
import { SqliteUsageRecorder } from "./conversation-engine/infrastructure/persistence/sqlite-usage-recorder.ts";
import { ReplySenderAdapter } from "./conversation-engine/infrastructure/sending/reply-sender.adapter.ts";
import { ReplyStrategy } from "./conversation-engine/domain/reply-strategy.ts";
import { loadManagementEnv, resolveAdminConfig } from "./management/infrastructure/config/env.ts";
import { ConversationIndexProjection } from "./management/infrastructure/persistence/conversation-index-projection.ts";
import { IndexingConversationRepository } from "./management/infrastructure/persistence/indexing-conversation-repository.ts";
import { ProspectingReplyTracker } from "./management/infrastructure/persistence/prospecting-reply-tracker.ts";
import { SqliteAdminActionAudit } from "./management/infrastructure/persistence/sqlite-admin-action-audit.ts";
import { SqliteLeadRepository } from "./management/infrastructure/persistence/sqlite-lead-repository.ts";
import { openDatabase } from "./shared/persistence/sqlite/open-database.ts";
import { HandleInboundMessageUseCase } from "./whatsapp-connectivity/application/use-cases/handle-inbound-message.use-case.ts";
import { HandleMessageStatusUpdateUseCase } from "./whatsapp-connectivity/application/use-cases/handle-message-status-update.use-case.ts";
import { SendOutboundMessageUseCase } from "./whatsapp-connectivity/application/use-cases/send-outbound-message.use-case.ts";
import { SendTextMessageUseCase } from "./whatsapp-connectivity/application/use-cases/send-text-message.use-case.ts";
import { loadEnv } from "./whatsapp-connectivity/infrastructure/config/env.ts";
import { MetaCloudApiGateway } from "./whatsapp-connectivity/infrastructure/gateways/meta-cloud-api.gateway.ts";
import { BaileysGateway } from "./whatsapp-connectivity/infrastructure/gateways/baileys.gateway.ts";
import { DurableWhatsappGateway } from "./whatsapp-connectivity/infrastructure/gateways/durable-whatsapp.gateway.ts";
import { SqliteConsentStore } from "./whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";
import { SqliteOutbox } from "./whatsapp-connectivity/infrastructure/persistence/sqlite-outbox.ts";
import { SqliteInboundJournal } from "./whatsapp-connectivity/infrastructure/persistence/sqlite-inbound-journal.ts";
import { optOutRequested } from "./whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";
import { NoopMessagingCostRecorder } from "./whatsapp-connectivity/infrastructure/persistence/noop-messaging-cost-recorder.ts";
import { SqliteMessagingCostRecorder } from "./whatsapp-connectivity/infrastructure/persistence/sqlite-messaging-cost-recorder.ts";
import { buildFastifyServer } from "./whatsapp-connectivity/infrastructure/http/fastify-server.ts";
import { ConsoleLogger } from "./whatsapp-connectivity/infrastructure/logging/console-logger.ts";

const env = loadEnv();
const conversationEnv = loadConversationEngineEnv();
const logger = new ConsoleLogger();



// --- Motor de conversas (conversation-engine) ---
const promptText = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "conversation-engine/domain/reply-strategy.prompt.md",
  ),
  "utf8",
);

const replyStrategy = new ReplyStrategy({
  promptText,
  model: conversationEnv.LLM_MODEL,
  historyTurns: conversationEnv.CONVERSATION_HISTORY_TURNS,
});
const llmClient = conversationEnv.LLM_PROVIDER === "anthropic"
  ? new AnthropicLlmClient({ apiKey: conversationEnv.ANTHROPIC_API_KEY!, workspaceId: conversationEnv.ANTHROPIC_WORKSPACE_ID })
  : new LocalRulesLlmClient();

// Base de conhecimento comercial: preparada no boot. Fail-fast — se a base não
// construir (arquivo ausente, `.md` malformado, metadado faltando, zero
// trechos), o processo não sobe.
let knowledge: ReturnType<typeof loadKnowledge>;
try {
  knowledge = loadKnowledge(conversationEnv.KNOWLEDGE_DIR);
  logger.info("Base de conhecimento comercial preparada", {
    chunks: knowledge.chunks.length,
    pinned: knowledge.chunks.filter((c) => c.pinned).length,
  });
} catch (error) {
  console.error(
    "Falha ao preparar a base de conhecimento comercial — abortando a inicialização",
    error,
  );
  process.exit(1);
}

// Armazenamento SQL embutido (node:sqlite): preparado no boot, antes de montar
// os use-cases e antes do `app.listen`. Fail-fast — se abrir o banco ou aplicar
// uma migration falhar, o processo não sobe. A conexão fica disponível para
// injeção nos adapters das próximas changes; nenhuma consome nesta change.
let database: ReturnType<typeof openDatabase>;
try {
  database = openDatabase(conversationEnv.DATABASE_PATH);
  logger.info("Armazenamento SQL embutido preparado", {
    path: conversationEnv.DATABASE_PATH,
  });
} catch (error) {
  console.error(
    "Falha ao preparar o armazenamento SQL embutido — abortando a inicialização",
    error,
  );
  process.exit(1);
}

// O núcleo funciona sem Meta/Anthropic; ambos permanecem como opt-ins.
const consentStore = new SqliteConsentStore(database);
const outbox = new SqliteOutbox(database);
const inboundJournal = new SqliteInboundJournal(database);
const rawGateway = env.WHATSAPP_PROVIDER === "meta"
  ? new MetaCloudApiGateway({ accessToken: env.META_ACCESS_TOKEN!, phoneNumberId: env.META_PHONE_NUMBER_ID! })
  : new BaileysGateway(env.BAILEYS_AUTH_DIR);
const gateway = new DurableWhatsappGateway(rawGateway, outbox, consentStore,
  () => !(rawGateway instanceof BaileysGateway) || rawGateway.diagnostic().status === "connected");
export const sendOutboundMessage = new SendOutboundMessageUseCase(gateway);
export const sendTextMessage = new SendTextMessageUseCase(gateway);

// Registro append-only de consumo de tokens de cada chamada ao LLM. Desligado
// por config, usa o recorder no-op e o fluxo opera como sem a feature.
const usageRecorder = conversationEnv.LLM_USAGE_TRACKING_ENABLED
  ? new SqliteUsageRecorder(database, logger)
  : new NoopUsageRecorder();

const businessContextProvider = new LexicalRetrievalBusinessContext({
  llmClient,
  index: knowledge.index,
  pinnedContext: knowledge.pinnedContext,
  extractionModel: conversationEnv.EXTRACTION_LLM_MODEL,
  topK: conversationEnv.RETRIEVAL_TOP_K,
  minScore: conversationEnv.RETRIEVAL_MIN_SCORE,
  usageRecorder,
  logger,
});

// API de gestão (/admin): quando ligada, o repositório de conversas é embrulhado
// por um decorator que mantém a projeção de leitura (`conversation_index`) em
// sincronia a cada `save()`. O motor recebe um `ConversationRepositoryPort` e não
// sabe da projeção. Desligada, usa o `FileConversationRepository` puro.
const managementEnv = loadManagementEnv();
const adminConfig = resolveAdminConfig(managementEnv);

let conversationIndexProjection: ConversationIndexProjection | undefined;
let leadRepository: SqliteLeadRepository | undefined;
let conversationRepository: ConversationRepositoryPort = new FileConversationRepository(
  conversationEnv.CONVERSATIONS_DIR,
);
if (adminConfig) {
  conversationIndexProjection = new ConversationIndexProjection(database);
  leadRepository = new SqliteLeadRepository(database, logger);
  // Cadeia de decorators: o `IndexingConversationRepository` mantém a projeção de
  // leitura a cada `save()`; o `ProspectingReplyTracker` roda por fora dele e liga
  // o primeiro inbound de um lead prospectado ao estado `replied` (best-effort).
  conversationRepository = new ProspectingReplyTracker(
    new IndexingConversationRepository(
      conversationRepository,
      conversationIndexProjection,
      logger,
    ),
    leadRepository,
    logger,
  );
}

const replySender = new ReplySenderAdapter({ sendTextMessage, logger });

// Conexão única do armazenamento SQL embutido. Consumida pelo `SqliteUsageRecorder`
// (consumo de LLM) e exposta para os adapters das próximas changes (consumo de
// WhatsApp, projeção de leitura de conversas).
export { database };

const generateReply = new GenerateReplyUseCase({
  repository: conversationRepository,
  replyStrategy,
  llmClient,
  replySender,
  businessContextProvider,
  usageRecorder,
  logger,
});

// Fila serial por lead, compartilhada entre o processamento de mensagens
// recebidas e as ações de operação do painel (/admin) — uma ação nunca colide
// com uma geração de resposta em andamento para o mesmo lead.
const leadSerialQueue = new LeadSerialQueue();

const inboundBatchCoordinator = new InboundBatchCoordinator({
  repository: conversationRepository,
  generateReply,
  logger,
  batchWindowMs: conversationEnv.CONVERSATION_BATCH_WINDOW_MS,
  queue: leadSerialQueue,
});

const pendingInboundSweeper = new PendingInboundSweeper({
  repository: conversationRepository,
  coordinator: inboundBatchCoordinator,
  logger,
  maxAgeMs: conversationEnv.BOOT_SWEEP_MAX_AGE_MS,
});

const handleInboundMessage = new HandleInboundMessageUseCase(logger, inboundBatchCoordinator, consentStore);

async function acknowledgeInbound(id: string): Promise<void> {
  await leadSerialQueue.whenSettled();
  const saved = inboundJournal.pending().find(message => message.id === id);
  if (!saved) return;
  const phone = `+${saved.from.replace(/\D/g, "")}`;
  const persisted = (await conversationRepository.load(phone))?.hasProcessed(id) ?? false;
  if (persisted || (optOutRequested(saved.text?.body ?? "") && consentStore.isOptedOut(phone))) {
    inboundJournal.markStored(id);
  }
}

// Registro append-only das janelas de conversa de 24 h faturáveis (fonte
// WhatsApp da capability `consumption-metrics`). Best-effort; desligado por
// config, usa o recorder no-op e o tratamento de status opera como sem a feature.
const messagingCostRecorder = env.WHATSAPP_PROVIDER === "meta" && env.WHATSAPP_COST_TRACKING_ENABLED
  ? new SqliteMessagingCostRecorder(database, logger, env.WHATSAPP_BILLING_COUNTRY)
  : new NoopMessagingCostRecorder();
const handleMessageStatusUpdate = new HandleMessageStatusUpdateUseCase(
  logger,
  messagingCostRecorder,
);

export const app = buildFastifyServer({
  webhook: env.WHATSAPP_PROVIDER === "meta" ? {
    handleInboundMessage,
    handleMessageStatusUpdate,
    logger,
    webhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN!,
    appSecret: env.META_APP_SECRET!,
    inboundJournal,
    acknowledgeInbound,
  } : undefined,
  admin: adminConfig
    ? {
        config: adminConfig,
        db: database,
        repository: conversationRepository,
        sendText: sendTextMessage,
        sendTemplate: sendOutboundMessage,
        leads: leadRepository!,
        queue: leadSerialQueue,
        audit: new SqliteAdminActionAudit(database, logger),
        consent: consentStore,
        prospectingEnabled: env.WHATSAPP_PROVIDER === "meta",
        diagnostics: () => rawGateway instanceof BaileysGateway ? rawGateway.diagnostic() : { provider: "meta", status: "configured", qrAvailable: false },
        logger,
      }
    : undefined,
});

const isMainModule = process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  const boot = async (): Promise<void> => {
    if (conversationIndexProjection && conversationIndexProjection.isEmptyOrStale()) {
      const indexed = await conversationIndexProjection.rebuildFromDir(
        conversationEnv.CONVERSATIONS_DIR,
      );
      logger.info("Projeção de conversas (/admin) reconstruída no boot", { conversations: indexed });
    }

    await pendingInboundSweeper.run().catch((error: unknown) =>
      logger.error("Falha na varredura de mensagens inbound pendentes no boot", {
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    if (rawGateway instanceof BaileysGateway) await rawGateway.start({
      execute(message) {
        inboundJournal.record(message);
        handleInboundMessage.execute(message);
        void acknowledgeInbound(message.id).catch((error: unknown) =>
          logger.error("Falha ao confirmar evento Baileys", { error: String(error) }));
      },
    });
    for (const message of inboundJournal.pending()) {
      handleInboundMessage.execute(message);
      await acknowledgeInbound(message.id);
    }
    outbox.recoverStale();
    await gateway.retryPending();
    const retryTimer = setInterval(() => {
      void gateway.retryPending().catch((e: unknown) => logger.error("Falha na outbox", { error: String(e) }));
    }, 30_000);
    retryTimer.unref?.();
  };

  boot()
    .then(() => {
      app
        .listen({ port: env.PORT, host: env.HOST })
        .then(() => logger.info("Servidor iniciado", { port: env.PORT }))
        .catch((error: unknown) => {
          console.error("Falha ao iniciar o servidor", error);
          process.exit(1);
        });
    })
    .catch((error: unknown) => {
      logger.error("Falha ao preparar o boot", { error: error instanceof Error ? error.message : String(error) });
      process.exitCode = 1;
    });
}

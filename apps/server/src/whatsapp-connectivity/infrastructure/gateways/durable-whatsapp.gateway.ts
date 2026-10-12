import { randomUUID } from "node:crypto";
import type { WhatsAppGatewayPort, SentMessage } from "../../application/ports/whatsapp-gateway.port.ts";
import { OutboundMessage } from "../../domain/outbound-message.ts";
import { OutboundTextMessage } from "../../domain/outbound-text-message.ts";
import type { SqliteConsentStore } from "../persistence/sqlite-consent-store.ts";
import { SqliteOutbox, type OutboxJob } from "../persistence/sqlite-outbox.ts";

/** Persistência antes de enviar. Reexecução é at-least-once, não exactly-once. */
export class DurableWhatsappGateway implements WhatsAppGatewayPort {
  constructor(
    private readonly provider: WhatsAppGatewayPort,
    private readonly outbox: SqliteOutbox,
    private readonly consent: SqliteConsentStore,
  ) {}

  async sendTextMessage(message: OutboundTextMessage): Promise<SentMessage> {
    if (this.consent.isOptedOut(message.to)) throw new Error("Contato descadastrado; envio bloqueado.");
    return this.submit("text", { to: message.to, body: message.body });
  }

  async sendTemplateMessage(message: OutboundMessage): Promise<SentMessage> {
    if (!this.consent.canProspect(message.to)) throw new Error("Consentimento de prospecção ausente ou revogado.");
    return this.submit("template", { to: message.to, templateName: message.templateName,
      languageCode: message.languageCode, parameters: [...message.parameters] });
  }

  async retryPending(): Promise<void> {
    for (const job of this.outbox.pending()) {
      try { await this.deliver(job); }
      catch (err) { console.error("Job de saída falhou (será retomado se houver tentativas):", err instanceof Error ? err.message : "erro"); }
    }
  }

  private async submit(kind: "text" | "template", payload: Record<string, unknown>): Promise<SentMessage> {
    const operationId = randomUUID();
    this.outbox.enqueue(operationId, kind, payload);
    return this.deliver({ operationId, kind, payload, attempts: 0, state: "pending" });
  }

  private async deliver(job: OutboxJob): Promise<SentMessage> {
    const phone = String(job.payload.to);
    if (job.kind === "template" && !this.consent.canProspect(phone)) {
      this.outbox.fail(job.operationId, "Consentimento ausente/revogado.");
      throw new Error("Consentimento ausente/revogado.");
    }
    if (this.consent.isOptedOut(phone)) {
      this.outbox.fail(job.operationId, "Contato descadastrado.");
      throw new Error("Contato descadastrado.");
    }
    if (!this.outbox.claim(job.operationId)) throw new Error("Job já está sendo processado.");
    try {
      const sent = job.kind === "text"
        ? await this.provider.sendTextMessage(OutboundTextMessage.create({ to: phone, body: String(job.payload.body) }))
        : await this.provider.sendTemplateMessage(OutboundMessage.create({
            to: phone, templateName: String(job.payload.templateName),
            languageCode: String(job.payload.languageCode),
            parameters: job.payload.parameters as string[] | undefined,
          }));
      this.outbox.sent(job.operationId, sent.wamid);
      return sent;
    } catch (error) {
      this.outbox.fail(job.operationId, error);
      throw error;
    }
  }
}

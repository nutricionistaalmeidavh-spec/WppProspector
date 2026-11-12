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
    private readonly canSend: () => boolean = () => true,
  ) {}

  async sendTextMessage(message: OutboundTextMessage): Promise<SentMessage> {
    if (this.consent.isOptedOut(message.to)) throw new Error("Contato descadastrado; envio bloqueado.");
    return this.submit("text", { to: message.to, body: message.body });
  }

  /** Uma tarefa agendada conserva o mesmo operationId entre falhas e reinícios. */
  async sendTextWithOperationId(message: OutboundTextMessage, operationId: string): Promise<SentMessage> {
    if (!/^[a-zA-Z0-9:_-]{8,120}$/.test(operationId)) throw new Error("Identificador de operação inválido.");
    if (this.consent.isOptedOut(message.to)) throw new Error("Contato descadastrado; envio bloqueado.");
    const payload = {to:message.to,body:message.body};
    const existing=this.outbox.get(operationId);
    if(existing){
      if(existing.kind!=="text" || JSON.stringify(existing.payload)!==JSON.stringify(payload))
        throw new Error("Identificador já associado a outra operação.");
      if(existing.state==="sent"&&existing.providerMessageId)return {wamid:existing.providerMessageId};
      if(existing.state==="failed")throw new Error("Operação encerrada na fila de saída.");
    }
    this.outbox.enqueue(operationId,"text",payload);
    return this.deliver({operationId,kind:"text",payload,attempts:existing?.attempts??0,state:"pending"});
  }

  async sendTemplateMessage(message: OutboundMessage): Promise<SentMessage> {
    if (!this.consent.canProspect(message.to)) throw new Error("Consentimento de prospecção ausente ou revogado.");
    return this.submit("template", { to: message.to, templateName: message.templateName,
      languageCode: message.languageCode, parameters: [...message.parameters] });
  }

  async retryPending(): Promise<void> {
    if (!this.canSend()) return;
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
      this.outbox.cancel(job.operationId, "Consentimento ausente/revogado.");
      throw new Error("Consentimento ausente/revogado.");
    }
    if (this.consent.isOptedOut(phone)) {
      this.outbox.cancel(job.operationId, "Contato descadastrado.");
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

import { InboundMessage } from "../../domain/inbound-message.ts";
import type { InboundMessagePort } from "../ports/inbound-message.port.ts";
import type { Logger } from "../ports/logger.port.ts";

export interface RawInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  button?: { text: string; payload?: string };
}

export class HandleInboundMessageUseCase {
  constructor(
    private readonly logger: Logger,
    private readonly inboundMessagePort: InboundMessagePort,
    private readonly consent?: { processInbound(phone: string, text: string): boolean },
    private readonly onInbound?: (phone: string) => void,
  ) {}

  execute(raw: RawInboundMessage): void {
    const text = this.resolveText(raw);
    if (text === undefined) {
      this.logger.warn("Mensagem inbound de tipo não suportado ignorada", {
        messageId: raw.id,
        type: raw.type,
      });
      return;
    }

    const message = InboundMessage.create({
      from: raw.from,
      messageId: raw.id,
      text,
      timestamp: new Date(Number(raw.timestamp) * 1000),
    });

    this.logger.info("Mensagem inbound recebida", {
      messageId: message.messageId,
      timestamp: message.timestamp.toISOString(),
    });
    const normalizedPhone = `+${message.from.replace(/\D/g, "")}`;
    this.onInbound?.(normalizedPhone);
    if (this.consent?.processInbound(normalizedPhone, message.text)) return;

    try {
      this.inboundMessagePort.receive({
        from: message.from,
        messageId: message.messageId,
        text: message.text,
        timestamp: message.timestamp,
      });
    } catch (error) {
      this.logger.error("Falha ao encaminhar mensagem inbound ao processador downstream", {
        messageId: message.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private resolveText(raw: RawInboundMessage): string | undefined {
    if (raw.type === "text" && raw.text) return raw.text.body;
    if (raw.type === "button" && raw.button) return raw.button.text;
    return undefined;
  }
}

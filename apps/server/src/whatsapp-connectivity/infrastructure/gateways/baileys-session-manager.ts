import { join } from "node:path";
import type { WhatsAppGatewayPort, SentMessage } from "../../application/ports/whatsapp-gateway.port.ts";
import type { OutboundMessage } from "../../domain/outbound-message.ts";
import type { OutboundTextMessage } from "../../domain/outbound-text-message.ts";
import { BaileysGateway, type LocalInbound } from "./baileys.gateway.ts";

export interface ManagedSession extends WhatsAppGatewayPort {
  start(inbound: LocalInbound): Promise<void>;
  stop(): Promise<void>;
  diagnostic(): { provider: string; status: string; qrAvailable: boolean };
}
export type SessionFactory = (id: string, authPath: string) => ManagedSession;
const ID = /^[a-z0-9_-]{1,48}$/i;

export class BaileysSessionManager implements WhatsAppGatewayPort {
  private readonly sessions = new Map<string, ManagedSession>();
  private inbound?: LocalInbound;
  private readonly ids: string[];

  constructor(
    private readonly baseAuthDir: string,
    sessionIds = "default",
    private readonly maxSessions = 5,
    private readonly factory: SessionFactory = (_id, authPath) => new BaileysGateway(authPath),
  ) {
    this.ids = [...new Set(sessionIds.split(",").map(item => item.trim()).filter(Boolean))];
    if (this.ids.length === 0 || this.ids.length > maxSessions || this.ids.some(id => !ID.test(id))) {
      throw new Error("BAILEYS_SESSION_IDS inválido: informe de 1 a 5 IDs alfanuméricos separados por vírgula.");
    }
  }

  async start(inbound: LocalInbound): Promise<void> {
    this.inbound = inbound;
    for (const id of this.ids) await this.addSession(id);
  }

  async addSession(id: string): Promise<void> {
    if (!ID.test(id)) throw new Error("ID da sessão inválido.");
    if (this.sessions.has(id)) return;
    if (this.sessions.size >= this.maxSessions) throw new Error("Limite de sessões WhatsApp atingido.");
    if (!this.inbound) throw new Error("O gerenciador precisa ser inicializado antes de adicionar sessões.");
    const session = this.factory(id, join(this.baseAuthDir, id));
    // Somente colocar no mapa depois do start: falha não deve ocupar vaga.
    await session.start(this.inbound);
    this.sessions.set(id, session);
  }

  async removeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    await session.stop();
    this.sessions.delete(id);
  }

  listSessions(): Array<{ id: string; status: string; qrAvailable: boolean }> {
    return [...this.sessions].map(([id, session]) => ({
      id, status: session.diagnostic().status, qrAvailable: session.diagnostic().qrAvailable,
    }));
  }

  diagnostic(): { provider: string; status: string; qrAvailable: boolean; sessions: ReturnType<BaileysSessionManager["listSessions"]> } {
    const primary = this.sessions.get(this.ids[0]!);
    return {
      provider: "baileys",
      status: primary?.diagnostic().status ?? "disconnected",
      qrAvailable: this.listSessions().some(item => item.qrAvailable),
      sessions: this.listSessions(),
    };
  }

  async sendTextMessage(message: OutboundTextMessage): Promise<SentMessage> {
    const primary = this.sessions.get(this.ids[0]!);
    if (!primary) throw new Error("Sessão principal do WhatsApp não inicializada.");
    return primary.sendTextMessage(message);
  }

  async sendTemplateMessage(_message: OutboundMessage): Promise<SentMessage> {
    throw new Error("Templates aprovados só estão disponíveis com o conector Meta.");
  }
}

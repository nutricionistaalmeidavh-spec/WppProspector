import type { DatabaseSync } from "node:sqlite";
import type { WhatsAppGatewayPort, SentMessage } from "../../application/ports/whatsapp-gateway.port.ts";
import type { OutboundTextMessage } from "../../domain/outbound-text-message.ts";
import type { OutboundMessage } from "../../domain/outbound-message.ts";
import { BaileysSessionManager } from "./baileys-session-manager.ts";
import { MetaCloudApiGateway } from "./meta-cloud-api.gateway.ts";
import { WhatsAppChannelStore } from "./whatsapp-channel-store.ts";
import type { LocalInbound } from "./baileys.gateway.ts";

export interface LocalConnection { id: string; status: string; qrAvailable: boolean; active: boolean }
export class WhatsAppConnectionManager implements WhatsAppGatewayPort {
  readonly local: BaileysSessionManager | null;
  private inbound: LocalInbound | null = null;
  private readonly legacy: WhatsAppGatewayPort;
  constructor(
    private readonly db: DatabaseSync,
    legacy: WhatsAppGatewayPort,
    readonly metaStore: WhatsAppChannelStore | null,
    local: BaileysSessionManager | null,
  ) {
    this.legacy = legacy;
    this.local = local;
    const preferred = db.prepare("SELECT value FROM whatsapp_connection_preferences WHERE key='local_session'").get() as {value:string}|undefined;
    if (preferred && local) {
      try { local.selectSession(preferred.value); } catch { /* configuração antiga não deve interromper o boot */ }
    }
  }
  async start(inbound: LocalInbound): Promise<void> {
    this.inbound = inbound;
    if (this.local && !this.metaStore?.active()) await this.local.start(inbound);
  }
  isMetaActive(): boolean { return !!this.metaStore?.active() || !this.local; }
  private gateway(): WhatsAppGatewayPort {
    const meta = this.metaStore?.active();
    return meta
      ? new MetaCloudApiGateway({accessToken:meta.accessToken,phoneNumberId:meta.phoneNumberId})
      : this.legacy;
  }
  async sendTextMessage(message: OutboundTextMessage): Promise<SentMessage> {
    return this.gateway().sendTextMessage(message);
  }
  async sendTemplateMessage(message: OutboundMessage): Promise<SentMessage> {
    return this.gateway().sendTemplateMessage(message);
  }
  diagnostics(): {provider:string;status:string;qrAvailable:boolean} {
    if (this.metaStore?.active()) return {provider:"meta",status:"connected",qrAvailable:false};
    return this.local?.diagnostic() ?? {provider:"meta",status:"configured",qrAvailable:false};
  }
  localSessions(): LocalConnection[] {
    if (!this.local) return [];
    const existing = new Map(this.local.listSessions().map(s=>[s.id,s]));
    const metaActive = !!this.metaStore?.active();
    return this.local.getSessionIds().map(id=>({
      id,
      status: existing.get(id)?.status ?? "disconnected",
      qrAvailable: existing.get(id)?.qrAvailable ?? false,
      active: !metaActive && this.local!.getSelectedId()===id,
    }));
  }
  qrFor(id: string): string | null {
    if (!this.local || this.metaStore?.active()) return null;
    return this.local.getQr(id);
  }
  async reconnectLocal(id: string): Promise<void> {
    if (!this.local || this.metaStore?.active()) throw new Error("Ative a conexão local antes de parear.");
    await this.local.restartSession(id);
  }
  async activateLocal(id: string): Promise<void> {
    if (!this.local || !this.inbound) throw new Error("O conector local não foi instalado neste servidor.");
    if (!this.local.getSessionIds().includes(id)) throw new Error("Sessão local não configurada.");
    const wasMeta = !!this.metaStore?.active();
    if (wasMeta) await this.local.start(this.inbound);
    this.local.selectSession(id);
    this.metaStore?.deactivate();
    this.db.prepare("INSERT INTO whatsapp_connection_preferences(key,value) VALUES ('local_session',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(id);
  }
  async activateMeta(id: string): Promise<void> {
    if (!this.metaStore) throw new Error("A integração oficial não está configurada.");
    if (!this.metaStore.list().some(c=>c.id===id)) throw new Error("Canal Meta não encontrado.");
    const shouldStop = !!this.local && !this.metaStore.active();
    if (shouldStop) await this.local!.stop();
    try { this.metaStore.activate(id); }
    catch (error) {
      if (shouldStop && this.inbound) await this.local!.start(this.inbound);
      throw error;
    }
  }
  async removeMeta(id: string): Promise<boolean> {
    if (!this.metaStore) throw new Error("A integração oficial não está configurada.");
    const wasActive = this.metaStore.list().some(c=>c.id===id && c.active);
    if (wasActive) {
      this.metaStore.deactivate();
      if (this.local && this.inbound) {
        try { await this.local.start(this.inbound); }
        catch (error) { this.metaStore.activate(id); throw error; }
      }
    }
    return this.metaStore.delete(id);
  }
  isMetaConfigured(): boolean { return this.metaStore !== null; }
}

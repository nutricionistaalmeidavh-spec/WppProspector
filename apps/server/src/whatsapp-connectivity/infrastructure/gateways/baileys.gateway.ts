import { mkdir, chmod } from "node:fs/promises";
import { resolve } from "node:path";
import type { WhatsAppGatewayPort, SentMessage } from "../../application/ports/whatsapp-gateway.port.ts";
import type { OutboundMessage } from "../../domain/outbound-message.ts";
import type { OutboundTextMessage } from "../../domain/outbound-text-message.ts";

type Msg = { key?: { id?: string; remoteJid?: string; fromMe?: boolean }; message?: { conversation?: string; extendedTextMessage?: { text?: string } }; messageTimestamp?: number | string | { toNumber(): number } };
type Socket = {
  ev: { on(event: string, callback: (arg: unknown) => void): void };
  onWhatsApp(phone: string): Promise<Array<{ exists?: boolean; jid?: string }> | undefined>;
  sendMessage(jid: string, message: { text: string }): Promise<{ key?: { id?: string } } | undefined>;
  end(error?: Error): void;
};
type BaileysModule = {
  default: (config: Record<string, unknown>) => Socket;
  useMultiFileAuthState: (path: string) => Promise<{ state: unknown; saveCreds: () => Promise<void> }>;
  fetchLatestBaileysVersion: () => Promise<{ version: number[] }>;
  DisconnectReason: { loggedOut: number };
};
type QrcodeModule = { generate(text: string, opts: { small: boolean }): void };

export interface LocalInbound {
  execute(message: { from: string; id: string; timestamp: string; type: "text"; text: { body: string } }): void;
}

/**
 * Adaptador isolado: sem Meta/Anthropic, sem Chromium; dependências opcionais instaladas
 * explicitamente pelo operador. Não utiliza nem copia código dos projetos legados.
 */
export class BaileysGateway implements WhatsAppGatewayPort {
  private sock: Socket | undefined;
  private inbound: LocalInbound | undefined;
  private connected = false;
  private shouldReconnect = true;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private qr: string | null = null;
  private status: "disconnected" | "qr" | "connected" = "disconnected";
  private readonly authDir: string;
  private retries = 0;

  constructor(authDir: string) { this.authDir = resolve(authDir); }
  diagnostic(): { status: string; qrAvailable: boolean; provider: string } {
    return { status: this.status, qrAvailable: this.qr !== null, provider: "baileys" };
  }

  async start(inbound: LocalInbound): Promise<void> {
    this.inbound = inbound;
    this.shouldReconnect = true;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.shouldReconnect = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.sock?.end();
    this.sock = undefined;
    this.connected = false;
    this.status = "disconnected";
  }

  private async connect(): Promise<void> {
    // Imports dinâmicos para não impor um gateway de terceiros ao core/offline tests.
    const packageName = "baileys";
    let lib: BaileysModule;
    try { lib = await import(packageName) as unknown as BaileysModule; }
    catch { throw new Error("Baileys não instalado. Veja docs/p0-selfhosted-implementation.md (instalação local gratuita)."); }
    await mkdir(this.authDir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") await chmod(this.authDir, 0o700);

    const { state, saveCreds } = await lib.useMultiFileAuthState(this.authDir);
    const { version } = await lib.fetchLatestBaileysVersion();
    const pinoPackage = "pino";
    const pino = (await import(pinoPackage) as { default: (options: { level: string }) => unknown }).default;
    const sock = lib.default({ auth: state, version, printQRInTerminal: false, logger: pino({ level: "silent" }) });
    this.sock = sock;
    sock.ev.on("creds.update", () => { void saveCreds().catch((e: unknown) => console.error("Não foi possível salvar credenciais da sessão", e)); });
    sock.ev.on("connection.update", (raw: unknown) => {
      const update = raw as { connection?: string; qr?: string; lastDisconnect?: { error?: { output?: { statusCode?: number } } } };
      if (this.sock !== sock) return;
      if (update.qr) {
        this.qr = update.qr;
        this.status = "qr";
        const qrPackage = "qrcode-terminal";
        void import(qrPackage).then((m: unknown) => (m as { default: QrcodeModule }).default.generate(update.qr!, { small: true }))
          .catch(() => console.info("QR disponível; instale o pacote opcional qrcode-terminal para exibí-lo no terminal."));
      }
      if (update.connection === "open") {
        this.connected = true; this.qr = null; this.retries = 0; this.status = "connected";
      }
      if (update.connection === "close") {
        this.connected = false; this.status = "disconnected";
        const loggedOut = update.lastDisconnect?.error?.output?.statusCode === lib.DisconnectReason.loggedOut;
        if (!loggedOut && this.shouldReconnect) this.reconnect();
      }
    });
    sock.ev.on("messages.upsert", (raw: unknown) => {
      const batch = raw as { type?: string; messages?: Msg[] };
      if (this.sock !== sock || batch.type !== "notify") return;
      for (const message of batch.messages ?? []) {
        if (message.key?.fromMe || !message.key?.id) continue;
        const jid = message.key.remoteJid ?? "";
        if (!/^\d+@s\.whatsapp\.net$/.test(jid)) continue; // Ignora grupos, broadcasts e IDs LID até suporte correto.
        const body = message.message?.conversation ?? message.message?.extendedTextMessage?.text;
        if (!body) continue;
        const n = message.messageTimestamp;
        const unixTime = typeof n === "object" ? n.toNumber() : Number(n ?? Date.now() / 1000);
        this.inbound?.execute({ from: jid.split("@")[0]!, id: message.key.id, timestamp: String(unixTime), type: "text", text: { body } });
      }
    });
  }

  private reconnect(): void {
    const ms = Math.min(5_000 * 2 ** Math.min(this.retries++, 6), 300_000);
    this.retryTimer = setTimeout(() => { void this.connect().catch((err: unknown) => { console.error("Falha de reconexão", err); if (this.shouldReconnect) this.reconnect(); }); }, ms);
    this.retryTimer.unref?.();
  }

  async sendTextMessage(message: OutboundTextMessage): Promise<SentMessage> {
    if (!this.connected || !this.sock) throw new Error("Sessão Baileys não conectada.");
    const phone = message.to.replace(/\D/g, "");
    const found = (await this.sock.onWhatsApp(phone))?.[0];
    if (!found?.exists || !found.jid) throw new Error("Número não disponível no WhatsApp.");
    const response = await this.sock.sendMessage(found.jid, { text: message.body });
    if (!response?.key?.id) throw new Error("WhatsApp não confirmou o identificador da mensagem.");
    return { wamid: response.key.id };
  }

  async sendTemplateMessage(_message: OutboundMessage): Promise<SentMessage> {
    throw new Error("Templates aprovados são exclusivos da Meta. No modo Baileys, configure fluxos de atendimento para contatos autorizados.");
  }
}

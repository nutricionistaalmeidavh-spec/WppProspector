import type { DatabaseSync } from "node:sqlite";

export function optOutRequested(text: string): boolean {
  const n = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return /^(sair|stop|parar|pare|remover|remova|descadastrar|cancelar)([!.\s]|$)/.test(n) ||
    /\b(nao quero mais mensagens|nao tenho interesse|nao me mande mensagens|pare de me enviar|parem de me enviar|retire meu numero)\b/.test(n);
}

export class SqliteConsentStore {
  constructor(private readonly db: DatabaseSync) {}

  grant(phone: string, source: string, now = new Date()): void {
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) throw new Error("Telefone inválido");
    if (source.trim().length < 3) throw new Error("Fonte de autorização deve ser informada");
    const iso = now.toISOString();
    this.db.prepare(`INSERT INTO contact_consent(phone, granted_at, consent_source, opted_out_at, updated_at)
      VALUES (?, ?, ?, NULL, ?) ON CONFLICT(phone) DO UPDATE SET
      granted_at=excluded.granted_at, consent_source=excluded.consent_source,
      opted_out_at=NULL, updated_at=excluded.updated_at`).run(phone, iso, source, iso);
  }

  optOut(phone: string, now = new Date()): void {
    const iso = now.toISOString();
    this.db.prepare(`INSERT INTO contact_consent(phone, opted_out_at, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET opted_out_at=excluded.opted_out_at, updated_at=excluded.updated_at`)
      .run(phone, iso, iso);
  }

  processInbound(phone: string, text: string): boolean {
    if (!optOutRequested(text)) return false;
    this.optOut(phone);
    return true;
  }

  canProspect(phone: string): boolean {
    const row = this.db.prepare("SELECT granted_at, opted_out_at FROM contact_consent WHERE phone=?")
      .get(phone) as { granted_at: string | null; opted_out_at: string | null } | undefined;
    return !!row?.granted_at && !row.opted_out_at;
  }

  isOptedOut(phone: string): boolean {
    const row = this.db.prepare("SELECT opted_out_at FROM contact_consent WHERE phone=?")
      .get(phone) as { opted_out_at: string | null } | undefined;
    return !!row?.opted_out_at;
  }

  status(phone: string): { authorized: boolean; optedOut: boolean } {
    return { authorized: this.canProspect(phone), optedOut: this.isOptedOut(phone) };
  }
}

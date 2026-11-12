import type { DatabaseSync } from "node:sqlite";

export interface SyncedContact { phone: string; displayName?: string }
export type ContactSource = "baileys" | "file";
const PHONE = /^\+[1-9]\d{7,14}$/;

/** Catálogo de contatos distinto do CRM: sincronizar nunca cadastra leads nem inicia envios. */
export class WhatsappContactsStore {
  constructor(private readonly db: DatabaseSync, private readonly clock: () => Date = () => new Date()) {}

  upsertMany(contacts: SyncedContact[], source: ContactSource): { synced: number; rejected: number } {
    if (contacts.length > 2000) throw new Error("Limite de 2000 contatos por lote.");
    let synced = 0, rejected = 0;
    const stmt = this.db.prepare(`
      INSERT INTO whatsapp_contacts(phone,display_name,source,synced_at) VALUES(?,?,?,?)
      ON CONFLICT(phone) DO UPDATE SET
        display_name = CASE
          WHEN whatsapp_contacts.source = 'file' AND excluded.source = 'baileys' THEN whatsapp_contacts.display_name
          WHEN excluded.display_name = '' THEN whatsapp_contacts.display_name
          ELSE excluded.display_name END,
        source = CASE WHEN whatsapp_contacts.source = 'file' THEN 'file' ELSE excluded.source END,
        synced_at = excluded.synced_at`);
    const seen = new Set<string>();
    this.db.exec("BEGIN");
    try {
      for (const contact of contacts) {
        const phone = contact.phone.trim();
        if (!PHONE.test(phone)) { rejected++; continue; }
        if (seen.has(phone)) continue;
        seen.add(phone);
        stmt.run(phone, (contact.displayName ?? "").trim().slice(0, 160), source, this.clock().toISOString());
        synced++;
      }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return { synced, rejected };
  }

  list(search = ""): Array<{ phone: string; displayName: string; source: ContactSource; syncedAt: string; isLead: boolean }> {
    return this.db.prepare(`SELECT c.phone,c.display_name AS displayName,c.source,c.synced_at AS syncedAt,
      CASE WHEN l.phone IS NULL THEN 0 ELSE 1 END AS isLead
      FROM whatsapp_contacts c LEFT JOIN leads l ON l.phone=c.phone
      WHERE c.phone LIKE ? OR c.display_name LIKE ? ORDER BY c.display_name COLLATE NOCASE,c.phone LIMIT 500`)
      .all(`%${search.slice(0, 100)}%`,`%${search.slice(0, 100)}%`)
      .map(row => { const r = row as Record<string, unknown>; return {
        phone: String(r.phone), displayName: String(r.displayName), source: r.source as ContactSource,
        syncedAt: String(r.syncedAt), isLead: Boolean(r.isLead),
      }; });
  }
  get(phone: string): { phone: string; displayName: string } | null {
    const row = this.db.prepare("SELECT phone,display_name AS displayName FROM whatsapp_contacts WHERE phone=?").get(phone);
    return (row as {phone:string;displayName:string}|undefined) ?? null;
  }
}

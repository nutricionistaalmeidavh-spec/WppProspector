import type { DatabaseSync } from "node:sqlite";

/**
 * O WhatsApp recebe mensagens mesmo com respostas automáticas desligadas.
 * Instalações que já operavam antes do assistente conservam o comportamento.
 */
export function automaticRepliesEnabled(db: DatabaseSync): boolean {
  const row = db.prepare("SELECT status FROM onboarding_setup_steps WHERE step='rules'")
    .get() as {status:string}|undefined;
  if (row) return row.status === "completed";
  // Uma instalação recém-inicializada não deve responder sem aceite.
  const started = db.prepare("SELECT 1 FROM onboarding_setup_steps LIMIT 1").get();
  if (started) return false;
  // Compatibilidade com dados já existentes: a migração não desativa bots em operação.
  const existing = db.prepare("SELECT 1 FROM leads LIMIT 1").get()
    ?? db.prepare("SELECT 1 FROM business_profile LIMIT 1").get()
    ?? db.prepare("SELECT 1 FROM automation_rules LIMIT 1").get();
  return Boolean(existing);
}

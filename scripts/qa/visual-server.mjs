import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Servidor REAL compilado + SQLite EFÊMERO, somente no loopback.
// Nunca usa segredos de clientes, envia mensagens ou acessa APIs comerciais.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temp = mkdtempSync(join(tmpdir(), "wpp-visual-qa-"));
const environment = {
  ...process.env,
  PORT: "3202",
  HOST: "127.0.0.1",
  ADMIN_ENABLED: "true",
  ADMIN_ACCESS_SECRET: "qa-visual-only-not-production",
  ADMIN_SESSION_SECRET: "qa-visual-session-only-not-production",
  ADMIN_WEB_DIST_DIR: join(root, "apps/panel/dist"),
  DATABASE_PATH: join(temp, "crm.db"),
  CONVERSATIONS_DIR: join(temp, "conversations"),
  KNOWLEDGE_DIR: join(root, "apps/server/dist/conversation-engine/infrastructure/knowledge"),
  WHATSAPP_PROVIDER: "meta",
  LLM_PROVIDER: "rules",
  META_ACCESS_TOKEN: "qa-disabled-no-external-calls",
  META_APP_SECRET: "qa-disabled-no-external-calls",
  META_PHONE_NUMBER_ID: "qa-disabled-no-external-calls",
  META_WABA_ID: "qa-disabled-no-external-calls",
  META_WEBHOOK_VERIFY_TOKEN: "qa-disabled-no-external-calls",
  ANTHROPIC_API_KEY: "",
  OPENAI_API_KEY: "",
  PROSPECTING_TEMPLATE_NAME: "qa-do-not-send",
};
const child = spawn(process.execPath, ["scripts/run.mjs", "start"], {
  cwd: root, env: environment, stdio: "inherit",
});
let stopping = false;
const shutdown = (signal = "SIGTERM") => {
  if (stopping) return;
  stopping = true;
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
};
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown("SIGINT"));
child.on("error", error => {
  console.error("Visual QA: falha iniciando servidor:", error.message);
  shutdown();
});
child.on("exit", (code, signal) => {
  rmSync(temp, { recursive: true, force: true });
  if (signal && !stopping) console.error("Visual QA: servidor encerrou inesperadamente:", signal);
  process.exitCode = code ?? (stopping ? 0 : 1);
});

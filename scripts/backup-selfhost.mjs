import { cpSync, copyFileSync, existsSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (!args.includes("--server-stopped") || !args.includes("--dest")) {
  throw new Error("Uso: node scripts/backup-selfhost.mjs --server-stopped --dest /caminho/seguro [--include-keys]");
}
const destArg = args[args.indexOf("--dest") + 1];
if (!destArg) throw new Error("--dest exige um diretório");
const dest = resolve(destArg, "wppauto-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 8));
const dataDir = join(root, "apps", "server", "data");
const source = (envName, folder) => process.env[envName] ? resolve(root, "apps/server", process.env[envName]) : join(dataDir, folder);
const database = source("DATABASE_PATH", "app.db");
const conversations = source("CONVERSATIONS_DIR", "conversations");
const auth = source("BAILEYS_AUTH_DIR", "baileys-auth");
if (!existsSync(database)) throw new Error("Banco não encontrado. Encerre o serviço e confirme o caminho antes do backup.");
mkdirSync(dest, { recursive: true, mode: 0o700 });
if (process.platform !== "win32") chmodSync(dest, 0o700);
copyFileSync(database, join(dest, "app.db"));
if (existsSync(conversations)) cpSync(conversations, join(dest, "conversations"), { recursive: true });
if (args.includes("--include-keys") && existsSync(auth)) cpSync(auth, join(dest, "baileys-auth"), { recursive: true });
writeFileSync(join(dest, "manifest.json"), JSON.stringify({
  createdAt: new Date().toISOString(),
  requiresOfflineRestore: true,
  includesSessionKeys: args.includes("--include-keys"),
}, null, 2));
console.info("Backup offline concluído:", dest);

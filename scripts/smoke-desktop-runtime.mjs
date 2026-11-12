// Testa o processo Node distribuído, a partir da cópia exata que vai para o NSIS.
// Sem Meta, Anthropic, serviços pagos ou dados de clientes.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve('desktop-build/app-runtime');
const executable = join(root, 'node.exe');
const serverDir = join(root, 'apps/server');
const entrypoint = join(serverDir, 'dist/main.js');
const panel = join(root, 'apps/panel/dist');
const genericPrompt = join(serverDir, 'dist/conversation-engine/domain/merchant-reply.prompt.md');
const dir = mkdtempSync(join(tmpdir(), 'wpp-runtime-qa-'));
const messages = [];
let child;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function reservePort() {
  const s = createServer();
  await new Promise((resolveReady, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', resolveReady);
  });
  const port = s.address().port;
  await new Promise(resolveClose => s.close(resolveClose));
  return port;
}
try {
  if (process.platform !== 'win32') throw new Error('O smoke do pacote usa o executável Windows e deve rodar no windows-latest.');
  for (const path of [executable, entrypoint, join(serverDir, 'package.json'), join(panel, 'index.html'),
    genericPrompt]) {
    if (!existsSync(path)) throw new Error('Artefato não contém: ' + path);
  }
  for (const legacy of ['sales-knowledge.md','pricing.md']) {
    if (existsSync(join(serverDir, 'dist/conversation-engine/infrastructure/knowledge', legacy)))
      throw new Error('Conteúdo comercial legado vazou para o instalador: ' + legacy);
  }
  const port = await reservePort();
  const access = randomBytes(32).toString('hex');
  const env = {
    ...process.env,
    PORT: String(port), HOST: '127.0.0.1',
    ADMIN_ENABLED: 'true', ADMIN_ACCESS_SECRET: access,
    ADMIN_SESSION_SECRET: randomBytes(32).toString('hex'),
    PROSPECTING_TEMPLATE_NAME: 'abertura_lead_obras',
    WHATSAPP_PROVIDER: 'baileys', LLM_PROVIDER: 'rules',
    DATABASE_PATH: join(dir, 'crm.db'), CONVERSATIONS_DIR: join(dir, 'conversations'),
    BAILEYS_AUTH_DIR: join(dir, 'baileys-auth'),
    ADMIN_WEB_DIST_DIR: panel,
    META_ACCESS_TOKEN: '', META_APP_SECRET: '', META_PHONE_NUMBER_ID: '',
    META_WABA_ID: '', META_WEBHOOK_VERIFY_TOKEN: '', ANTHROPIC_API_KEY: '',
  };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(executable, [entrypoint], {
    cwd: serverDir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let exited = false;
  let exitDetail = '';
  child.once('exit', (code, signal) => { exited = true; exitDetail = 'code=' + code + ' signal=' + signal; });
  child.once('error', e => { exited = true; exitDetail = e.message; });
  for (const stream of ['stdout', 'stderr']) {
    child[stream].on('data', data => {
      messages.push('[' + stream + '] ' + String(data));
      if (messages.length > 40) messages.shift();
    });
  }
  const origin = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 45_000;
  let ready = false;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(origin + '/admin/', { signal: AbortSignal.timeout(1500) });
      if (response.ok) { ready = true; break; }
    } catch { /* aguardando */ }
    await sleep(500);
  }
  if (!ready) throw new Error('Servidor empacotado não iniciou: ' + (exited ? exitDetail : 'timeout'));
  const login = await fetch(origin + '/admin/api/session', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: access }),
  });
  if (!login.ok || !login.headers.get('set-cookie')?.includes('admin_session=')) {
    throw new Error('Servidor empacotado abriu, mas não autenticou o painel: ' + login.status);
  }
  if (!existsSync(join(dir, 'crm.db')) || statSync(join(dir, 'crm.db')).size === 0) {
    throw new Error('SQLite não criou o banco de teste isolado.');
  }
  console.log('PASS: runtime distribuído iniciou, respondeu /admin/, autenticou e criou SQLite isolado.');
} catch (error) {
  console.error(String(error));
  console.error(messages.join('\n').slice(-9000));
  process.exitCode = 1;
} finally {
  child?.kill();
  await sleep(500);
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
}

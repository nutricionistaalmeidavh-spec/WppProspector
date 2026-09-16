import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Exercita o build real com dados efêmeros; não chama endpoints de envio ou IA.
const root = fileURLToPath(new URL('../', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'wpp-smoke-'));
const reserve = createServer();
reserve.listen(0, '127.0.0.1');
await once(reserve, 'listening');
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${port}`;
let child;
let output = '';
const env = {
  ...process.env,
  META_ACCESS_TOKEN: 'qa-no-external-calls',
  META_APP_SECRET: 'qa-no-external-calls',
  META_PHONE_NUMBER_ID: 'qa-no-external-calls',
  META_WABA_ID: 'qa-no-external-calls',
  META_WEBHOOK_VERIFY_TOKEN: 'qa-no-external-calls',
  ANTHROPIC_API_KEY: 'qa-no-external-calls',
  ADMIN_ENABLED: 'true',
  ADMIN_ACCESS_SECRET: 'qa-local-only',
  ADMIN_SESSION_SECRET: 'qa-local-session-only',
  PROSPECTING_TEMPLATE_NAME: 'qa-never-sent',
  ADMIN_WEB_DIST_DIR: join(root, 'apps/panel/dist'),
  KNOWLEDGE_DIR: join(root, 'apps/server/dist/conversation-engine/infrastructure/knowledge'),
  DATABASE_PATH: join(data, 'app.db'),
  CONVERSATIONS_DIR: join(data, 'conversations'),
  PORT: String(port),
  HOST: '127.0.0.1',
};

async function start() {
  output = '';
  child = spawn(process.execPath, ['scripts/run.mjs', 'start'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(`Servidor encerrou no boot: ${output}`);
    try {
      const response = await fetch(`${origin}/admin/`, { signal: AbortSignal.timeout(500) });
      if (response.status === 200) return;
    } catch { /* Aguardar a porta durante o boot. */ }
    await delay(100);
  }
  throw new Error(`Timeout iniciando o build: ${output}`);
}

async function stop() {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

try {
  await start();
  const html = await (await fetch(`${origin}/admin/`)).text();
  assert.match(html, /<div id="root">/);
  const asset = html.match(/src="(\/admin\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(asset, 'index.html deve referenciar o JS compilado');
  assert.equal((await fetch(origin + asset)).status, 200);
  assert.equal((await fetch(`${origin}/admin/conversations/history`)).status, 200);
  assert.equal((await fetch(`${origin}/admin/api/leads`)).status, 401);
  const login = (secret) => fetch(`${origin}/admin/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret }),
  });
  assert.equal((await login('wrong')).status, 401);
  const session = await login(env.ADMIN_ACCESS_SECRET);
  assert.equal(session.status, 200);
  const setCookie = session.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const headers = { cookie: setCookie.split(';')[0] };
  const api = (path, options = {}) => fetch(`${origin}/admin/api${path}`, {
    ...options,
    headers: { ...headers, ...(options.body ? { 'content-type': 'application/json' } : {}) },
  });
  assert.equal((await api('/capabilities')).status, 200);
  assert.equal((await api('/conversations')).status, 200);
  assert.equal((await api('/stats/overview')).status, 200);
  assert.equal((await api('/stats/consumption?from=2026-01-01&to=2026-12-31&groupBy=day')).status, 200);
  const imported = await api('/leads/import', {
    method: 'POST', body: JSON.stringify({ leads: [{ phone: '+5516990000001', displayName: 'Teste de integração', company: 'Empresa de teste' }] }),
  });
  assert.equal(imported.status, 200);
  assert.equal((await imported.json()).imported, 1);
  assert.equal((await (await api('/leads')).json()).items.length, 1);
  assert.equal((await api('/not-a-route')).status, 404);
  await stop();
  await start();
  assert.equal((await (await api('/leads')).json()).items[0].displayName, 'Teste de integração');
  const logout = await api('/session', { method: 'DELETE' });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Expires=/i);
  console.log('PASS: build, assets, SPA, autenticação, contratos HTTP, importação e persistência após reinício. Nenhum envio externo.');
} finally {
  await stop();
  rmSync(data, { recursive: true, force: true });
}

// Navegacao real do build, dados ficticios e nenhuma chamada de envio externo.
// Executado apenas em CI, usando servidor local e banco efemero.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

const root = resolve('.');
const out = join(root, 'artifacts/qa-visual');
mkdirSync(out, { recursive: true });
const report = { generatedAt: new Date().toISOString(), sha: process.env.GITHUB_SHA ?? 'local', source: 'real Chromium / build local', fixture: '100% ficticia', screens: [], failures: [] };
const dataDir = mkdtempSync(join(tmpdir(), 'wpp-visual-'));
const reserve = createServer();
reserve.listen(0, '127.0.0.1');
await once(reserve, 'listening');
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const url = 'http://localhost:' + port;
const password = 'qa-local-only';
const env = {
  ...process.env,
  HOST: '127.0.0.1',
  PORT: String(port),
  WHATSAPP_PROVIDER: 'meta',
  LLM_PROVIDER: 'anthropic',
  META_ACCESS_TOKEN: 'qa-never-used',
  META_APP_SECRET: 'qa-never-used',
  META_PHONE_NUMBER_ID: 'qa-never-used',
  META_WABA_ID: 'qa-never-used',
  META_WEBHOOK_VERIFY_TOKEN: 'qa-never-used',
  ANTHROPIC_API_KEY: 'qa-never-used',
  PROSPECTING_TEMPLATE_NAME: 'qa-no-send',
  ADMIN_ENABLED: 'true',
  ADMIN_ACCESS_SECRET: password,
  ADMIN_SESSION_SECRET: 'qa-local-session-only',
  ADMIN_WEB_DIST_DIR: join(root, 'apps/panel/dist'),
  KNOWLEDGE_DIR: join(root, 'apps/server/dist/conversation-engine/infrastructure/knowledge'),
  DATABASE_PATH: join(dataDir, 'app.db'),
  CONVERSATIONS_DIR: join(dataDir, 'conversations'),
};
let server;
let log = '';
let browser;
async function start() {
  server = spawn(process.execPath, ['scripts/run.mjs', 'start'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { log += chunk.toString(); });
  server.stderr.on('data', chunk => { log += chunk.toString(); });
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error('Servidor encerrou: ' + log.slice(-4000));
    try {
      const response = await fetch(url + '/admin/', { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {}
    await pause(150);
  }
  throw new Error('Servidor nao iniciou: ' + log.slice(-4000));
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const exit = once(server, 'exit');
  server.kill('SIGTERM');
  await Promise.race([exit, pause(5000)]);
  if (server.exitCode === null) server.kill('SIGKILL');
}
async function login(page) {
  await page.goto(url + '/admin/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#secret').fill(password);
  await page.getByRole('button', { name: /^Entrar$/ }).click();
  await page.waitForURL('**/admin/overview', { timeout: 15000 });
  await page.locator('main').waitFor({ timeout: 12000 });
}
async function api(page, method, route, json) {
  const response = await page.request.fetch(url + '/admin/api' + route, {
    method, data: json, timeout: 12000,
  });
  if (!response.ok()) throw new Error(method + ' ' + route + ': ' + response.status() + ' ' + (await response.text()).slice(0, 300));
  return response.json();
}
async function seed(page) {
  const leads = [
    { phone: '+5516000000001', displayName: 'Ana Martins (ficticio)', company: 'Horizonte Tecnologia', segment: 'Tecnologia' },
    { phone: '+5516000000002', displayName: 'Bruno Lima (ficticio)', company: 'Verde Studio', segment: 'Servicos' },
    { phone: '+5516000000003', displayName: 'Carla Souza (ficticio)', company: 'Mosaico Comercio', segment: 'Comercio' },
  ];
  await api(page, 'POST', '/leads/import', { leads });
  const company = await api(page, 'POST', '/crm/companies', {
    name: 'Horizonte Tecnologia', city: 'Cidade de Exemplo', segment: 'Tecnologia',
  });
  const second = await api(page, 'POST', '/crm/companies', {
    name: 'Verde Studio', city: 'Cidade de Exemplo', segment: 'Servicos',
  });
  const campaign = await api(page, 'POST', '/crm/campaigns', {
    name: 'Campanha demonstrativa (sem envios)', status: 'draft',
  });
  const first = await api(page, 'POST', '/crm/opportunities', {
    title: 'Plataforma comercial de exemplo', companyId: company.id,
    leadPhone: leads[0].phone, stage: 'proposal', estimatedValue: 7200,
    owner: 'Equipe demonstracao', nextAction: 'Revisar proposta',
    nextActionAt: '2026-12-01', campaignId: campaign.id, source: 'Exemplo interno',
    qualification: 'Interesse confirmado', probabilityPercent: 60,
  });
  await api(page, 'POST', '/crm/opportunities', {
    title: 'Consultoria de implantacao', companyId: second.id,
    leadPhone: leads[1].phone, stage: 'qualified', estimatedValue: 3600,
    owner: 'Equipe comercial', nextAction: 'Agendar apresentacao',
    nextActionAt: '2026-12-05', source: 'Indicacao ficticia',
  });
  await api(page, 'POST', '/crm/campaigns/' + campaign.id + '/members', { phones: leads.map(lead => lead.phone) });
  // Recursos que estao na branch comercial. Se nao existirem, a QA detecta a regressao.
  await api(page, 'POST', '/crm/customers/convert', { leadPhone: leads[0].phone });
  await api(page, 'POST', '/crm/quotes', {
    opportunityId: first.id, notes: 'Orcamento de demonstracao; nao enviar.',
    items: [
      { description: 'Implantacao ilustrativa', quantity: 1, unitPrice: 5900 },
      { description: 'Treinamento interno', quantity: 2, unitPrice: 650 },
    ],
  });
  await api(page, 'POST', '/crm/activities', {
    opportunityId: first.id, kind: 'MEETING', subject: 'Apresentacao de demonstracao',
    dueAt: '2026-12-01', owner: 'Equipe demonstracao',
  });
  return first.id;
}
async function capture(page, label, route, folder) {
  const target = join(out, folder);
  mkdirSync(target, { recursive: true });
  try {
    await page.goto(url + '/admin' + route, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.locator('main').waitFor({ timeout: 15000 });
    if (new URL(page.url()).pathname.startsWith('/admin/login')) throw new Error('Redirecionado para login');
    await pause(650);
    const heading = (await page.locator('main h1').first().textContent().catch(() => ''))?.trim() ?? '';
    const file = join(target, label + '.png');
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    report.screens.push({ file: folder + '/' + label + '.png', route, heading, viewport: page.viewportSize() });
    if (!heading) throw new Error('Pagina sem titulo h1; captura mantida para diagnostico');
    console.log('CAPTURED ' + folder + '/' + label + '.png — ' + heading);
  } catch (err) {
    report.failures.push({ route, error: String(err) });
    try { await page.screenshot({ path: join(target, label + '-falha.png'), fullPage: true, timeout: 5000 }); } catch {}
    console.error('FAIL ' + route + ': ' + err);
  }
}
try {
  const filename = process.env.QA_PLAYWRIGHT_MODULE;
  if (!filename) throw new Error('QA_PLAYWRIGHT_MODULE nao configurado.');
  const { chromium } = await import(pathToFileURL(filename).href);
  await start();
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const desktops = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', reducedMotion: 'reduce' });
  const page = await desktops.newPage();
  page.on('pageerror', error => report.failures.push({ route: 'desktop JS', error: String(error) }));
  await page.goto(url + '/admin/login', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: join(out, '01-login-desktop.png'), fullPage: true });
  report.screens.push({ file: '01-login-desktop.png', route: '/login' });
  await login(page);
  const opportunityId = await seed(page);
  const desktopRoutes = [
    ['02-visao-geral', '/overview'],
    ['03-leads', '/crm/leads'],
    ['04-pipeline', '/crm/pipeline'],
    ['05-oportunidades', '/crm/opportunities'],
    ['06-oportunidade-detalhe', '/crm/opportunities/' + opportunityId],
    ['07-empresas', '/crm/companies'],
    ['08-crm-comercial', '/crm/commercial'],
    ['09-campanhas', '/prospecting/campaigns'],
    ['10-importacoes', '/prospecting/imports'],
    ['11-caixa-entrada', '/conversations/inbox'],
    ['12-funil', '/analytics/funnel'],
    ['13-conversoes', '/analytics/conversions'],
    ['14-automacoes', '/automations'],
    ['15-configuracoes', '/settings'],
  ];
  for (const [label, route] of desktopRoutes) await capture(page, label, route, 'desktop');
  const mobiles = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', reducedMotion: 'reduce' });
  const mobile = await mobiles.newPage();
  mobile.on('pageerror', error => report.failures.push({ route: 'mobile JS', error: String(error) }));
  await mobile.goto(url + '/admin/login', { waitUntil: 'domcontentloaded' });
  await mobile.screenshot({ path: join(out, '01-login-mobile.png'), fullPage: true });
  report.screens.push({ file: '01-login-mobile.png', route: '/login' });
  await login(mobile);
  for (const [label, route] of [
    ['02-visao-geral', '/overview'],
    ['03-pipeline', '/crm/pipeline'],
    ['04-leads', '/crm/leads'],
    ['05-crm-comercial', '/crm/commercial'],
    ['06-campanhas', '/prospecting/campaigns'],
    ['07-caixa-entrada', '/conversations/inbox'],
  ]) await capture(mobile, label, route, 'mobile');
  await mobile.goto(url + '/admin/overview', { waitUntil: 'domcontentloaded' });
  await mobile.getByRole('button', { name: 'Abrir navegação' }).click();
  await mobile.getByRole('dialog', { name: 'Menu de navegação' }).waitFor();
  await mobile.screenshot({ path: join(out, '08-menu-mobile.png'), fullPage: true });
  report.screens.push({ file: '08-menu-mobile.png', route: '/overview + menu' });
} catch (error) {
  report.failures.push({ route: 'setup/seed/login', error: String(error), serverLog: log.slice(-3000) });
  console.error(error);
} finally {
  if (browser) await browser.close();
  await stop();
  rmSync(dataDir, { recursive: true, force: true });
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
}
console.log('Imagens reais: ' + report.screens.length + ' | falhas: ' + report.failures.length);
if (report.failures.length) process.exitCode = 1;

'use strict';
const { app, BrowserWindow, ipcMain, session, Menu, clipboard, dialog, shell } = require('electron');
const { randomBytes } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
require('node:dns').setDefaultResultOrder('ipv4first');
const { licenseStatus } = require('./license.cjs');
const { createBootDiagnostics, verifyBundledRuntime, formatBackendFailure } = require('./boot-support.cjs');

let windowRef;
let backend;
let credential;
let booting = false;
const runtimeRoot = () => app.isPackaged ? join(process.resourcesPath, 'app-runtime') : join(__dirname, '..');
const dataRoot = () => join(app.getPath('userData'), 'storage');
const licenseFile = () => join(app.getPath('userData'), 'license.json');
const secretFile = () => join(app.getPath('userData'), 'local-access.json');

function readJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}
function saveJson(file, object) {
  writeFileSync(file, JSON.stringify(object, null, 2), { mode: 0o600 });
}
function localCredentials() {
  const previous = readJson(secretFile());
  if (typeof previous?.access === 'string' && previous.access.length >= 32 && typeof previous?.session === 'string' && previous.session.length >= 32) return previous;
  const next = { access: randomBytes(32).toString('hex'), session: randomBytes(32).toString('hex') };
  saveJson(secretFile(), next);
  return next;
}
function getPort() {
  return new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1190, height: 800, minWidth: 740, minHeight: 540, show: false,
    backgroundColor: '#10111e', autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true,
      preload: join(__dirname, 'preload.cjs') },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    const target = new URL(url);
    if (target.protocol !== 'file:' && !(target.hostname === 'localhost' && target.protocol === 'http:')) event.preventDefault();
  });
  return win;
}
function showActivation(message = '') {
  if (backend) { backend.kill(); backend = undefined; }
  windowRef = windowRef && !windowRef.isDestroyed() ? windowRef : createWindow();
  windowRef.loadFile(join(__dirname, 'activation.html'), { query: { message } });
}
function ensureLicense() {
  const record = readJson(licenseFile());
  return licenseStatus(record?.code);
}
function setMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'WppProspector', submenu: [
    { label: 'Copiar senha local do CRM', click: () => {
      if (credential?.access) clipboard.writeText(credential.access);
    } },
    { label: 'Trocar licença', click: () => showActivation('Insira a nova licença de acesso.') },
    { role: 'quit', label: 'Sair' },
  ] }]));
}
async function waitUntilReady(origin, child, state, diagnostics, timeoutMs = 45_000) {
  const stop = Date.now() + timeoutMs;
  while (Date.now() < stop) {
    if (state.error) throw new Error(formatBackendFailure({ error: state.error }, diagnostics.path));
    if (state.exited || child.exitCode !== null) {
      throw new Error(formatBackendFailure({ code: state.code ?? child.exitCode, signal: state.signal }, diagnostics.path));
    }
    try {
      const response = await fetch(origin + '/admin/', { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch { /* servidor ainda inicializando */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('O servidor local não respondeu em 45 segundos. Diagnóstico: ' + diagnostics.path);
}
async function authenticate(origin, access) {
  // O login é feito pelo processo principal, sem colocar a senha no JavaScript do painel.
  const res = await fetch(origin + '/admin/api/session', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: access }),
  });
  if (!res.ok) throw new Error('Não foi possível autenticar o CRM local.');
  const cookie = res.headers.get('set-cookie')?.match(/(?:^|\s)admin_session=([^;]+)/);
  if (!cookie) throw new Error('Sessão local não retornada.');
  await session.defaultSession.cookies.set({
    url: origin + '/admin/', name: 'admin_session', value: cookie[1],
    path: '/admin', httpOnly: true, secure: true, sameSite: 'strict',
  });
}
async function startCRM() {
  if (booting) return;
  booting = true;
  try {
    const status = ensureLicense();
    if (!status.ok) { showActivation(status.reason === 'expired' ? 'Sua licença expirou. Solicite uma renovação.' : 'Insira a licença fornecida pela ArtiSys.'); return; }
    if (!windowRef || windowRef.isDestroyed()) {
      windowRef = createWindow();
      await windowRef.loadFile(join(__dirname, 'activation.html'), { query: { message: 'Inicializando o CRM local...' } });
    }
    const root = runtimeRoot();
    const serverDir = join(root, 'apps', 'server');
    const nodeExecutable = app.isPackaged ? join(root, 'node.exe') : process.execPath;
    const main = join(serverDir, 'dist', 'main.js');
    mkdirSync(dataRoot(), { recursive: true });
    credential = localCredentials();
    const diagnostics = createBootDiagnostics(app.getPath('userData'), [credential.access, credential.session]);
    try {
      if (app.isPackaged) verifyBundledRuntime(root);
      else if (!existsSync(main)) throw new Error('Compile o servidor antes de executar a versão desktop.');
    } catch (error) {
      diagnostics.append('desktop', error.message);
      throw new Error(formatBackendFailure({ error }, diagnostics.path));
    }
    const port = await getPort();
    const origin = `http://localhost:${port}`;
    const env = {
      ...process.env, PORT: String(port), HOST: '127.0.0.1',
      ADMIN_ENABLED: 'true', ADMIN_ACCESS_SECRET: credential.access, ADMIN_SESSION_SECRET: credential.session,
      PROSPECTING_TEMPLATE_NAME: 'abertura_lead_obras',
      WHATSAPP_PROVIDER: 'baileys', LLM_PROVIDER: 'rules',
      DATABASE_PATH: join(dataRoot(), 'crm.db'),
      CONVERSATIONS_DIR: join(dataRoot(), 'conversations'),
      BAILEYS_AUTH_DIR: join(dataRoot(), 'baileys-auth'),
      KNOWLEDGE_DIR: join(serverDir, 'dist', 'conversation-engine', 'infrastructure', 'knowledge'),
      ADMIN_WEB_DIST_DIR: join(root, 'apps', 'panel', 'dist'),
      META_ACCESS_TOKEN: '', META_APP_SECRET: '', META_PHONE_NUMBER_ID: '',
      META_WABA_ID: '', META_WEBHOOK_VERIFY_TOKEN: '', ANTHROPIC_API_KEY: '',
    };
    // Flags Node herdadas do sistema podem impedir o subprocesso de abrir no PC do cliente.
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    delete env.ELECTRON_RUN_AS_NODE;
    backend = spawn(nodeExecutable, [main], { cwd: serverDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const state = { exited: false, code: null, signal: null, error: null };
    backend.stdout.on('data', buf => { if (booting) diagnostics.append('stdout', buf); });
    backend.stderr.on('data', buf => { if (booting) diagnostics.append('stderr', buf); });
    backend.on('error', error => {
      state.error = error;
      diagnostics.append('desktop', 'Falha ao executar servidor: ' + error.message);
    });
    backend.on('exit', (code, signal) => {
      state.exited = true;
      state.code = code;
      state.signal = signal;
      if (booting) diagnostics.append('desktop', 'Servidor encerrado: code=' + code + ', signal=' + signal);
    });
    await waitUntilReady(origin, backend, state, diagnostics);
    try { await authenticate(origin, credential.access); }
    catch (error) {
      dialog.showMessageBoxSync(windowRef, { type: 'warning', title: 'Login local',
        message: 'A sessão automática não foi possível. No menu WppProspector, use Copiar senha local do CRM para entrar.',
        detail: String(error.message) });
    }
    windowRef = windowRef && !windowRef.isDestroyed() ? windowRef : createWindow();
    await windowRef.loadURL(origin + '/admin/');
    setMenu();
  } catch (error) {
    showActivation(`Falha ao abrir CRM: ${error.message}`);
  } finally { booting = false; }
}
app.whenReady().then(() => {
  app.setAppUserModelId('dev.artisys.wppprospector');
  ipcMain.handle('license:activate', async (event, code) => {
    if (!windowRef || event.sender !== windowRef.webContents || !windowRef.webContents.getURL().startsWith('file:')) return { ok: false, message: 'Tela inválida.' };
    const status = licenseStatus(code);
    if (!status.ok) return { ok: false, message: status.reason === 'expired' ? 'Licença expirada.' : 'Licença inválida ou fora da validade.' };
    saveJson(licenseFile(), { code: code.trim() });
    setImmediate(() => { void startCRM(); });
    return { ok: true, expiresAt: status.expiresAt };
  });
  setInterval(() => {
    if (backend && !ensureLicense().ok) showActivation('Sua avaliação terminou. Insira uma nova licença.');
  }, 60_000).unref();
  if (ensureLicense().ok) void startCRM();
  else showActivation('Insira seu código de avaliação para continuar.');
});
app.on('before-quit', () => { if (backend) backend.kill(); });
app.on('window-all-closed', () => app.quit());
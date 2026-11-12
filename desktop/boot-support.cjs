'use strict';
const { existsSync, mkdirSync, readFileSync, statSync, renameSync, appendFileSync } = require('node:fs');
const { join } = require('node:path');

function verifyBundledRuntime(root) {
  const required = [
    'node.exe',
    join('apps', 'server', 'dist', 'main.js'),
    join('apps', 'server', 'package.json'),
    join('apps', 'panel', 'dist', 'index.html'),
    join('apps', 'server', 'dist', 'conversation-engine', 'domain', 'merchant-reply.prompt.md'),
  ];
  for (const file of required) {
    if (!existsSync(join(root, file))) throw new Error('Instalador incompleto: arquivo ausente ' + file);
  }
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, 'apps', 'server', 'package.json'), 'utf8')); }
  catch { throw new Error('Instalador incompleto: manifesto do servidor inválido.'); }
  if (manifest.type !== 'module') throw new Error('Instalador incompleto: package.json precisa de type module.');
}

function createBootDiagnostics(userDataPath, secrets = []) {
  const dir = join(userDataPath, 'logs');
  const path = join(dir, 'desktop-boot.log');
  try {
    mkdirSync(dir, { recursive: true });
    if (existsSync(path) && statSync(path).size > 512 * 1024) renameSync(path, path + '.previous');
    appendFileSync(path, '\n' + new Date().toISOString() + ' [desktop] Inicialização do CRM\n', 'utf8');
  } catch { /* Não impedir o boot por falha no diagnóstico. */ }
  const hidden = secrets.filter(v => typeof v === 'string' && v.length >= 8);
  const sanitize = value => {
    let line = String(value).replace(/\x1b\[[0-9;]*m/g, '').replace(/\0/g, '');
    for (const secret of hidden) line = line.split(secret).join('[oculto]');
    return line.replace(/(Bearer\s+)[A-Za-z0-9._~-]+/gi, '$1[oculto]');
  };
  return {
    path,
    append(source, chunk) {
      const safe = sanitize(String(chunk)).slice(0, 16 * 1024);
      try { appendFileSync(path, new Date().toISOString() + ' [' + source + '] ' + safe + '\n', 'utf8'); }
      catch { /* O erro original de inicialização tem prioridade. */ }
    },
  };
}

function formatBackendFailure(reason, path) {
  const detail = reason?.error ? reason.error.message
    : reason?.code !== undefined && reason.code !== null ? 'código ' + reason.code
    : reason?.signal ? 'sinal ' + reason.signal : 'motivo desconhecido';
  return 'O servidor local não iniciou (' + detail + '). Veja o diagnóstico em ' + path;
}

module.exports = { createBootDiagnostics, verifyBundledRuntime, formatBackendFailure };

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { createBootDiagnostics, verifyBundledRuntime, formatBackendFailure } = require('./boot-support.cjs');

test('registra motivo do encerramento sem expor segredos de inicialização', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wpp-boot-log-'));
  try {
    const diagnostic = createBootDiagnostics(dir, ['test-secret-very-long']);
    diagnostic.append('stderr', 'Error: token=test-secret-very-long\\nMODULE_NOT_FOUND\\n');
    const log = readFileSync(diagnostic.path, 'utf8');
    assert.match(log, /MODULE_NOT_FOUND/);
    assert.doesNotMatch(log, /test-secret-very-long/);
    assert.match(log, /\[oculto\]/);
    assert.match(formatBackendFailure({ code: 1 }, diagnostic.path), /código 1/);
    assert.match(formatBackendFailure({ code: 1 }, diagnostic.path), /desktop-boot\.log/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('identifica dependências e manifesto ausentes ANTES de iniciar o backend', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wpp-boot-runtime-'));
  try {
    assert.throws(() => verifyBundledRuntime(dir), /node\.exe/);
    const required = [
      'node.exe', 'apps/server/dist/main.js', 'apps/server/package.json',
      'apps/panel/dist/index.html',
      'apps/server/dist/conversation-engine/domain/reply-strategy.prompt.md',
      'apps/server/dist/conversation-engine/infrastructure/knowledge/sales-knowledge.md',
      'apps/server/dist/conversation-engine/infrastructure/knowledge/pricing.md',
    ];
    for (const relative of required) {
      const file = join(dir, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, relative === 'apps/server/package.json' ? '{"type":"module"}' : 'ok');
    }
    assert.doesNotThrow(() => verifyBundledRuntime(dir));
    writeFileSync(join(dir, 'apps/server/package.json'), '{}');
    assert.throws(() => verifyBundledRuntime(dir), /type.*module/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('mensagem de falha cobre erro de spawn e sinal de encerramento', () => {
  assert.match(formatBackendFailure({ error: new Error('EACCES') }, 'C:\\logs\\desktop-boot.log'), /EACCES/);
  assert.match(formatBackendFailure({ signal: 'SIGTERM' }, 'C:\\logs\\desktop-boot.log'), /SIGTERM/);
});
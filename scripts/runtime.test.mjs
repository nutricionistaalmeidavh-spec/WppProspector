import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyServerAssets } from './copy-server-assets.mjs';
import { serverLaunch } from './run.mjs';

test('build inclui conteúdo intacto de prompts, conhecimento e migrations, sem fontes TS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wpp-assets-'));
  try {
    const source = join(dir, 'src');
    const target = join(dir, 'dist');
    mkdirSync(join(source, 'nested'), { recursive: true });
    writeFileSync(join(source, 'prompt.md'), 'Conhecimento: ação e preço.\n');
    writeFileSync(join(source, 'nested', '0001.sql'), 'CREATE TABLE example(id INTEGER);\n');
    writeFileSync(join(source, 'module.ts'), 'export const x = 1;');
    assert.equal(copyServerAssets(source, target), 2);
    assert.equal(readFileSync(join(target, 'prompt.md'), 'utf8'), 'Conhecimento: ação e preço.\n');
    assert.equal(readFileSync(join(target, 'nested', '0001.sql'), 'utf8'), 'CREATE TABLE example(id INTEGER);\n');
    assert.equal(existsSync(join(target, 'module.ts')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('inicialização carrega .env raiz e mantém caminhos relativos ao servidor', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wpp runtime com espacos-'));
  try {
    const cwd = join(dir, 'apps/server');
    mkdirSync(join(cwd, 'dist'), { recursive: true });
    writeFileSync(join(cwd, '.env'), 'WPP_RUNTIME_PROBE=server\nWPP_RUNTIME_LEGACY=preserved\n');
    writeFileSync(join(dir, '.env'), 'WPP_RUNTIME_PROBE=root\n');
    writeFileSync(join(cwd, 'dist/main.js'), 'console.log(JSON.stringify({value:process.env.WPP_RUNTIME_PROBE,legacy:process.env.WPP_RUNTIME_LEGACY,cwd:process.cwd()}));');
    const launch = serverLaunch('start', dir);
    const env = { ...process.env };
    delete env.WPP_RUNTIME_PROBE;
    delete env.WPP_RUNTIME_LEGACY;
    const result = spawnSync(process.execPath, launch.args, { cwd: launch.cwd, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { value: 'root', legacy: 'preserved', cwd });
    rmSync(join(dir, '.env'));
    const legacy = spawnSync(process.execPath, launch.args, { cwd: launch.cwd, env, encoding: 'utf8' });
    assert.equal(legacy.status, 0, legacy.stderr);
    assert.equal(JSON.parse(legacy.stdout).value, 'server');
    assert.ok(serverLaunch('dev', dir).args.includes('--watch'));
    assert.throws(() => serverLaunch('invalid', dir));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

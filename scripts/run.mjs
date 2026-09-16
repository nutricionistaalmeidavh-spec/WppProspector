import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function serverLaunch(mode, projectRoot = root) {
  if (!['start', 'dev'].includes(mode)) throw new Error(`Modo desconhecido: ${mode}`);
  const cwd = join(projectRoot, 'apps/server');
  return {
    cwd,
    args: [
      `--env-file-if-exists=${join(cwd, '.env')}`,
      `--env-file-if-exists=${join(projectRoot, '.env')}`,
      ...(mode === 'dev' ? ['--watch', '--experimental-transform-types'] : []),
      mode === 'dev' ? 'src/main.ts' : 'dist/main.js',
    ],
  };
}

export function run(mode) {
  let launch;
  if (mode === 'panel') {
    const cwd = join(root, 'apps/panel');
    const require = createRequire(join(cwd, 'package.json'));
    launch = {
      cwd,
      args: [
        `--env-file-if-exists=${join(root, 'apps/server/.env')}`,
        `--env-file-if-exists=${join(root, '.env')}`,
        join(dirname(require.resolve('vite/package.json')), 'bin/vite.js'),
      ],
    };
  } else {
    launch = serverLaunch(mode);
    if (mode === 'start' && !existsSync(join(launch.cwd, 'dist/main.js'))) {
      throw new Error('Build ausente. Execute npm run build antes de npm start.');
    }
  }
  const child = spawn(process.execPath, launch.args, { cwd: launch.cwd, stdio: 'inherit' });
  const forward = (signal) => { if (!child.killed) child.kill(signal); };
  process.on('SIGINT', forward);
  process.on('SIGTERM', forward);
  const cleanup = () => {
    process.off('SIGINT', forward);
    process.off('SIGTERM', forward);
  };
  child.on('error', (error) => {
    cleanup();
    console.error(`Não foi possível iniciar: ${error.message}`);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => {
    cleanup();
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
  });
  return child;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { run(process.argv[2] ?? 'start'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

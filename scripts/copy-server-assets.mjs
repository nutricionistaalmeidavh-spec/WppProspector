import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// tsc compila TS; prompts, conhecimento e migrations precisam acompanhar o JS.
export function copyServerAssets(source, target) {
  let copied = 0;
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      copied += copyServerAssets(from, to);
    } else if (['.md', '.sql'].includes(extname(entry.name))) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      copied++;
    }
  }
  return copied;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const count = copyServerAssets(join(root, 'apps/server/src'), join(root, 'apps/server/dist'));
  console.log(`${count} arquivos de prompt, conhecimento e SQL copiados para o build.`);
}

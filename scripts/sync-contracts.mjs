import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

const source = new URL('../apps/server/src/management/interface/dto/', import.meta.url);
const packageRoot = new URL('../packages/contracts/src/', import.meta.url);
const target = new URL('../packages/contracts/src/management/interface/dto/', import.meta.url);
const domainSource = new URL('../apps/server/src/conversation-engine/domain/', import.meta.url);
const domainTarget = new URL('../packages/contracts/src/conversation-engine/domain/', import.meta.url);

await rm(packageRoot, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await mkdir(domainTarget, { recursive: true });

const entries = (await readdir(source, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
  .sort((a, b) => a.name.localeCompare(b.name));

for (const entry of entries) {
  await cp(new URL(entry.name, source), new URL(entry.name, target));
}

const domainFiles = ['lead-intent.ts', 'lead-qualification.ts', 'product-catalog.ts'];
for (const name of domainFiles) {
  await cp(new URL(name, domainSource), new URL(name, domainTarget));
}

console.log(`Synced ${entries.length} management contract files and ${domainFiles.length} shared domain files.`);

// CLI da ArtiSys: a chave privada nunca entra no Git, no instalador ou em Actions.
import { readFileSync } from 'node:fs';
import { sign, randomUUID } from 'node:crypto';
const args = Object.fromEntries(process.argv.slice(2).filter(x => x.startsWith('--') && x.includes('=')).map(x => x.slice(2).split(/=(.*)/s).slice(0,2)));
if (!args.key || !args.days || !/^\d+$/.test(args.days) || Number(args.days) < 1 || Number(args.days) > 366) {
  console.error('Uso: node desktop/issue-license.mjs --key=/caminho/privada.pem --days=14 [--kind=trial]');
  process.exit(1);
}
const now = new Date();
const end = new Date(now.getTime() + Number(args.days) * 86400_000);
const payload = { v: 1, product: 'artisys-wppprospector', id: randomUUID(), kind: args.kind === 'commercial' ? 'commercial' : 'trial', issuedAt: now.toISOString(), expiresAt: end.toISOString() };
const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
const signature = sign(null, Buffer.from(encoded), readFileSync(args.key)).toString('base64url');
console.log('WPP1.' + encoded + '.' + signature);
console.error('Expira em:', payload.expiresAt, 'ID:', payload.id);
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { exportCommercial } from './export-commercial.mjs';

const files = {
  'package.json':'{"name":"demo","private":true}',
  'package-lock.json':'{}',
  'LICENSE':'MIT',
  'NOTICE.md':'Avisos',
  '.env.example':'META_ACCESS_TOKEN=\nADMIN_ACCESS_SECRET=\nPROSPECTING_TEMPLATE_NAME=abertura_lead_obras\n',
  'apps/server/src/conversation-engine/domain/product-catalog.ts':'export const module = "gestao-obras"; const name = "Obra na Mão / FluxoDRE";',
  'apps/server/src/conversation-engine/infrastructure/knowledge/sales-knowledge.md':'CLIENT DATA / Obra na Mão',
  'apps/server/src/conversation-engine/infrastructure/knowledge/pricing.md':'Obra na Mão, R$ 350/mês',
  'apps/server/src/conversation-engine/domain/reply-strategy.prompt.md':'Fazer venda de Obra na Mão',
  'apps/server/src/management/auth.ts':'export const ok = true;',
  'apps/panel/src/features/crm/mock-data.ts':'const owner = "Victor"; const name = "Obra na Mão";',
  '.env':'SECRET_TESTE=NUNCA_INCLUIR',
  'apps/server/data/app.db':'dados de cliente',
  'apps/server/docs/payloads/plano.xlsx':'documento privado',
  '.github/workflows/deploy.yml':'secrets.PROD',
  'docs/internal.md':'interno',
  'openspec/internal.md':'interno',
};

function fixture(overrides={}) {
  const root=mkdtempSync(join(tmpdir(),'wpp-export-qa-'));
  execFileSync('git',['init','-q',root]);
  execFileSync('git',['-C',root,'config','user.email','qa@example.invalid']);
  execFileSync('git',['-C',root,'config','user.name','QA']);
  for(const [path,content] of Object.entries({...files,...overrides})){
    mkdirSync(dirname(join(root,path)),{recursive:true});
    writeFileSync(join(root,path),content);
  }
  execFileSync('git',['-C',root,'add','.']);
  execFileSync('git',['-C',root,'commit','-qm','fixture']);
  return root;
}
test('sanitizes product materials and excludes real env, database, artifacts and history',()=>{
  const root=fixture();
  try {
    const result=exportCommercial({root,outside:join(root,'out'),writeZip:false});
    const stage=result.stage;
    assert.equal(existsSync(join(stage,'.env')),false);
    assert.equal(existsSync(join(stage,'apps/server/data/app.db')),false);
    assert.equal(existsSync(join(stage,'apps/server/docs/payloads/plano.xlsx')),false);
    assert.equal(existsSync(join(stage,'docs/internal.md')),false);
    assert.equal(existsSync(join(stage,'openspec/internal.md')),false);
    assert.equal(existsSync(join(stage,'.github/workflows/deploy.yml')),false);
    assert.equal(existsSync(join(stage,'.git')),false);
    const kb=readFileSync(join(stage,'apps/server/src/conversation-engine/infrastructure/knowledge/sales-knowledge.md'),'utf8');
    assert.ok((kb.match(/^====$/gm)||[]).length>=20);
    assert.doesNotMatch(kb,/Obra na Mão|CLIENT DATA/);
    assert.doesNotMatch(readFileSync(join(stage,'apps/server/src/conversation-engine/infrastructure/knowledge/pricing.md'),'utf8'),/350|Obra na Mão/);
    assert.doesNotMatch(readFileSync(join(stage,'apps/server/src/conversation-engine/domain/product-catalog.ts'),'utf8'),/gestao-obras|Obra na Mão|FluxoDRE/);
    assert.match(readFileSync(join(stage,'README.md'),'utf8'),/setup:selfhost/);
    rmSync(stage,{recursive:true,force:true});
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('does not package local uncommitted changes',()=>{
  const root=fixture();
  try {
    writeFileSync(join(root,'apps/server/src/management/auth.ts'),'const secret = "ghp_PRIVATEUNCOMMITTEDVALUE01234567890";');
    const result=exportCommercial({root,writeZip:false});
    assert.equal(readFileSync(join(result.stage,'apps/server/src/management/auth.ts'),'utf8'),'export const ok = true;');
    rmSync(result.stage,{recursive:true,force:true});
  } finally { rmSync(root,{recursive:true,force:true}); }
});
test('blocks secrets and unknown proprietary references in tracked files',()=>{
  const a=fixture({'apps/server/src/management/auth.ts':'const token = "sk-ant-api03-secretvalueislongenough1234567890";'});
  const b=fixture({'apps/server/src/management/auth.ts':'// MH Hidráulica — material reservado'});
  try {
    assert.throws(()=>exportCommercial({root:a,writeZip:false}),/credencial/i);
    assert.throws(()=>exportCommercial({root:b,writeZip:false}),/restrito/i);
  } finally {rmSync(a,{recursive:true,force:true});rmSync(b,{recursive:true,force:true});}
});
test('creates an actual clean zip archive',()=>{
  const root=fixture();
  const zip=join(root,'deliverables','buyer.zip');
  try {
    exportCommercial({root,outside:zip,writeZip:true});
    const listing=execFileSync('unzip',['-Z','-1',zip],{encoding:'utf8'});
    assert.match(listing,/apps\/server\/src\/management\/auth.ts/);
    assert.doesNotMatch(listing,/\.git\/|\.env$|docs\/payloads|apps\/server\/data\//);
    const readme=execFileSync('unzip',['-p',zip,'README.md'],{encoding:'utf8'});
    assert.match(readme,/self-hosted/);
  } finally {rmSync(root,{recursive:true,force:true});}
});
test('refuses populated example credentials',()=>{
  const root=fixture({'.env.example':'META_ACCESS_TOKEN=token_real\n'});
  try {assert.throws(()=>exportCommercial({root,writeZip:false}),/Segredo\/identificador/);}
  finally {rmSync(root,{recursive:true,force:true});}
});

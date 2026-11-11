import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Lê APENAS objetos versionados em HEAD; jamais lê .env, data/ ou alterações locais.
const rootDefault = fileURLToPath(new URL('../', import.meta.url));
const exact = new Set([
  'package.json','package-lock.json','LICENSE','NOTICE.md','.env.example','.gitignore',
  '.dockerignore','Dockerfile','compose.yml',
  'apps/server/package.json','apps/server/tsconfig.json','apps/server/eslint.config.js',
  'apps/server/vitest.config.ts','apps/server/.env.example','apps/server/.gitignore',
  'apps/server/.prettierignore','apps/server/.prettierrc.json',
  'apps/panel/package.json','apps/panel/index.html','apps/panel/tsconfig.json',
  'apps/panel/tsconfig.node.json','apps/panel/tailwind.config.js',
  'apps/panel/postcss.config.js','apps/panel/vite.config.ts','apps/panel/vitest.setup.ts',
  'apps/panel/eslint.config.js','apps/panel/components.json','apps/panel/.env.example',
  'apps/panel/.gitignore','apps/panel/.prettierignore','apps/panel/.prettierrc.json',
  'packages/contracts/package.json','packages/contracts/tsconfig.json',
]);
const scripts = new Set([
  'scripts/run.mjs','scripts/backup-selfhost.mjs','scripts/copy-server-assets.mjs',
  'scripts/setup-selfhost.mjs','scripts/smoke-built.mjs','scripts/sync-contracts.mjs',
  'scripts/runtime.test.mjs','scripts/selfhost-config.test.mjs',
  'apps/server/scripts/clear-conversations.ts',
  'apps/server/scripts/send-hello-world.ts','apps/server/scripts/validate-knowledge.ts',
]);
const ext = /\.(?:[cm]?js|[cm]?ts|tsx|jsx|json|md|sql|css|html|svg|yaml|yml)$/i;
const secret = /(?:sk-ant-api03-[a-z0-9_-]{12,}|sk-proj-[a-z0-9_-]{12,}|ghp_[a-z0-9_]{20,}|github_pat_[a-z0-9_]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,}|xox[baprs]-[A-Za-z0-9-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/i;
const reserved = /(?:Obra\s+na\s+M[aã]o|FluxoDRE|Artisys\s+Finance|abertura_lead_obras|MH\s+Hidr[aá]ulica|artisys\.dev|obranamao|obra_na_mao|R\$\s*(?:200|350)\s*\/\s*m[eê]s)/i;
const ids = [
  ['gestao-obras','gestao-operacional','Gestão Operacional','base'],
  ['obra360','visao360','Visão Operacional 360','base'],
  ['equipes-presenca','equipes-presenca','Equipes e Presença','base'],
  ['planejamento-frentes','planejamento-tarefas','Planejamento de Tarefas','base'],
  ['checklists','checklists','Checklists','base'],
  ['fluxodre-desktop','gestao-administrativa','Gestão Administrativa','base'],
  ['colaboradores-documentos','colaboradores-documentos','Pessoas e Documentos','base'],
  ['vales-pagamentos','pagamentos','Pagamentos','base'],
  ['dre-custos','custos-indicadores','Custos e Indicadores','base'],
  ['hub','hub','Hub de Gestão','base'],
  ['artisys-finance','financeiro','Financeiro','extra'],
  ['universidade','treinamentos','Treinamentos','extra'],
  ['jogos','gamificacao','Gamificação','extra'],
  ['assistente','assistente','Assistente Digital','extra'],
];
const pricing = '# Política comercial demonstrativa\n\nNenhum preço ou plano está configurado neste exemplo. Personalize esta base antes de atender clientes reais. Na ausência de tabela aprovada, encaminhe o contato a um humano. Nunca invente valores.\n';
const prompt = [
  'Você é um assistente comercial de uma empresa fictícia. Personalize a oferta antes de atender clientes.',
  'Não invente preço, produto, prazo, garantia, condição nem funcionalidades. Consulte a base de conhecimento e encaminhe a um humano se a informação não estiver confirmada.',
  'Respeite consentimento e opt-out; não envie propostas não autorizadas.',
  'Responda sempre com JSON válido contendo replyMessages (string[]), endConversation (boolean), leadIntent (interested|not_interested|needs_more_info|opt_out|off_topic|unknown), leadQualification (hot|warm|cold|null), handoffToHuman (boolean), reasoning (string|null), recommendedModules (string[]), interestedModules (string[]) e quotedPlan (essencial|personalizado|null).',
  'Sem texto fora do JSON. Em opt-out, confirme encerramento e pare de enviar mensagens.',
].join('\n')+'\n';
const readme = [
  '# WppProspector CRM — código-fonte comercial',
  '',
  'Distribuição sem histórico Git, credenciais, sessões, bancos, clientes reais ou materiais de produtos do fornecedor. Dados da base comercial são exclusivamente demonstrativos.',
  '',
  '## Instalação (self-hosted, núcleo R$ 0)',
  '',
  'Requisitos: Node.js 24+, npm, computador/servidor próprio.',
  '',
  '1. Na raiz do projeto, execute npm run setup:selfhost. Isso cria o .env local com segredos novos e compila o sistema.',
  '2. Execute npm start e acesse http://localhost:3000/admin/ usando seu ADMIN_ACCESS_SECRET local.',
  '3. Como alternativa, após o setup, use docker compose up --build -d.',
  '',
  '## Antes de atender clientes',
  '',
  'Personalize a base de conhecimento, o catálogo, o prompt e pricing.md em apps/server/src/conversation-engine/.',
  'O template de prospecção e as credenciais da Meta são opcionais e devem ser configurados com dados do comprador. Anthropic é opcional e pode ter custo.',
  'Baileys é um conector não oficial; respeite termos da plataforma e consentimento dos contatos.',
  'Nunca publique /admin sem HTTPS e uma rede privada.',
  '',
  '## Testes',
  '',
  'npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run test:smoke',
  '',
  'Mantenha as atribuições e avisos em LICENSE e NOTICE.md.',
].join('\n')+'\n';

function git(root,args) { return execFileSync('git',['-C',root,...args],{maxBuffer:32*1024*1024}); }
function included(path) {
  if (path.includes('..') || path.includes('\\') || path.startsWith('/') || path.includes('\0')) return false;
  if (exact.has(path) || scripts.has(path)) return true;
  const allowed = path.startsWith('apps/server/src/') || path.startsWith('apps/panel/src/') || path.startsWith('packages/contracts/');
  return allowed && ext.test(path) && !/(^|\/)(?:data|private|secrets|credentials)(\/|$)/i.test(path);
}
function generalize(text) {
  let s = text;
  for (const [from,to] of ids) if (from !== to) s = s.replaceAll(from,to);
  for (const [regex,replace] of [
    [/Gestão de Obras\s*\/\s*Obra na Mão Campo/gi,'Gestão Operacional'],
    [/Hub Obra na Mão/gi,'Hub de Gestão'],
    [/Obra\s+na\s+M[aã]o\s*\/\s*FluxoDRE/gi,'Plataforma Demonstrativa'],
    [/Obra\s+na\s+M[aã]o/gi,'Plataforma Demonstrativa'],
    [/FluxoDRE/gi,'Gestão Administrativa'],
    [/ArtiSys\s+Finance/gi,'Financeiro'],
    [/\bArtiSys\b/gi,'Marca Exemplo'],
    [/abertura_lead_obras/gi,'template_aprovado_exemplo'],
    [/\bVictor\b/g,'Operador Demo'],
    [/Ribeirão Preto|Sertãozinho|Franca/gi,'Cidade Exemplo'],
    [/artisys\.dev/gi,'example.invalid'],
    [/\b([A-Z0-9._%+-]+)@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,(_,name)=>name+'@example.invalid'],
  ]) s = s.replace(regex,replace);
  return s;
}
function genericKnowledge() {
  const parts = [
    ['posicionamento','geral','geral','visao','Sobre a demonstração','Esta é uma base fictícia. Configure nome, catálogo e condições antes de uso real.'],
    ['guardrails','geral','geral','guardrail','Informações verificáveis','Não inventar recursos, preços, descontos, garantias, prazos ou condições. Encaminhar dúvidas sem resposta a um humano.'],
    ['consentimento','geral','geral','guardrail','Privacidade','Não contatar sem consentimento e respeitar imediatamente qualquer pedido de descadastro.'],
    ['discovery','geral','geral','discovery','Descoberta de necessidades','Pergunte sobre a necessidade do contato antes de recomendar serviços.'],
  ];
  for (const [,id,name,tier] of ids) {
    parts.push([id+'-visao',id,tier,'visao','Exemplo de '+name,'Demonstração fictícia de '+name+'. Configure a oferta real da sua empresa.']);
    parts.push([id+'-sondagem',id,tier,'discovery','Sondagem para '+name,'Pergunte quais processos precisam de '+name+'. A descrição não representa uma oferta comercial.']);
  }
  return '# Base comercial de demonstração\n\n'+parts.map(([id,module,tier,kind,title,body])=>
    '====\nid: '+id+'\nmodule: '+module+'\ntier: '+tier+'\nkind: '+kind+'\ntitle: '+title+'\n\n'+body).join('\n\n')+'\n';
}
function transformed(path,text) {
  if (path.endsWith('/knowledge/sales-knowledge.md')) return genericKnowledge();
  if (path.endsWith('/knowledge/pricing.md')) return pricing;
  if (path.endsWith('/domain/reply-strategy.prompt.md')) return prompt;
  if (path.endsWith('/.env.example') || path === '.env.example') {
    for (const m of text.matchAll(/^([A-Z_][A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|PASSWORD|WABA_ID|PHONE_NUMBER_ID))[ \t]*=[ \t]*(.*)$/gm)) {
      if (m[2].trim()) throw new Error('Segredo/identificador preenchido em '+path+': '+m[1]);
    }
  }
  return generalize(text);
}
function verify(stage,paths) {
  for (const path of paths) {
    if (!included(path) && path!=='README.md') throw new Error('Arquivo não permitido: '+path);
    const s=readFileSync(join(stage,path),'utf8');
    if (secret.test(s)) throw new Error('Possível credencial em '+path+'; ZIP bloqueado.');
    if (!['LICENSE','NOTICE.md'].includes(path) && reserved.test(s)) throw new Error('Conteúdo comercial restrito em '+path+'; ZIP bloqueado.');
  }
  const kb=readFileSync(join(stage,'apps/server/src/conversation-engine/infrastructure/knowledge/sales-knowledge.md'),'utf8');
  if ((kb.match(/^====$/gm)||[]).length < 20) throw new Error('Base de conhecimento com menos de 20 trechos.');
}
export function exportCommercial({root=rootDefault,outside=resolve(root,'dist-commercial'),writeZip=true}={}) {
  const tree=git(root,['ls-tree','-r','-z','HEAD']).toString('utf8').split('\0').filter(Boolean);
  const entries=tree.map(s=>/^(\d+) blob ([a-f0-9]{40})\t(.+)$/.exec(s)).filter(Boolean);
  const selected=entries.filter(m=>included(m[3]));
  const stage=mkdtempSync(join(tmpdir(),'wpp-commercial-'));
  const paths=[];
  try {
    for (const m of selected) {
      const path=m[3];
      if (m[1]!=='100644' && m[1]!=='100755') throw new Error('Tipo de arquivo não permitido: '+path);
      const b=git(root,['show','HEAD:'+path]);
      if (b.includes(0)) throw new Error('Arquivo binário não autorizado: '+path);
      const destination=join(stage,path);
      mkdirSync(dirname(destination),{recursive:true});
      writeFileSync(destination,transformed(path,b.toString('utf8')));
      paths.push(path);
    }
    writeFileSync(join(stage,'README.md'),readme); paths.push('README.md');
    verify(stage,paths);
    if (!writeZip) return {stage,files:paths.length};
    const absolute=resolve(outside);
    const zip=absolute.endsWith('.zip')?absolute:join(absolute,'WppProspector-CRM-codigo-fonte.zip');
    mkdirSync(dirname(zip),{recursive:true});
    execFileSync('zip',['-q','-X','-r',zip,'.'],{cwd:stage,maxBuffer:4*1024*1024});
    return {archive:zip,files:paths.length};
  } finally { if(writeZip) rmSync(stage,{recursive:true,force:true}); }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const i=process.argv.indexOf('--out');
    if(i!==-1 && !process.argv[i+1]) throw new Error('Falta caminho após --out');
    const result=exportCommercial({outside:i<0?undefined:resolve(process.argv[i+1])});
    console.log('ZIP preparado e validado: '+result.archive+' ('+result.files+' arquivos)');
  } catch(e) { console.error('EXPORTAÇÃO BLOQUEADA: '+e.message); process.exitCode=1; }
}

# Empacotamento comercial do WppProspector

Não compacte diretamente a pasta do repositório. Use o exportador comercial, que lê apenas os objetos versionados do commit HEAD e cria um ZIP separado, sem alterar dados ou configurações locais.

## Comando

    node --test scripts/export-commercial.test.mjs
    node scripts/export-commercial.mjs

Saída: dist-commercial/WppProspector-CRM-codigo-fonte.zip

Para outra saída: node scripts/export-commercial.mjs --out ../WppProspector-CRM-venda.zip

## O que entra no ZIP

Código-fonte do CRM, painel React, backend, conectores, contratos, migrações SQLite, lockfile, Docker/Compose, arquivo .env.example sem credenciais, licenças/avisos e README de instalação independente.

## O que fica fora

Histórico e configuração .git, .github/workflows, docs internos, openspec, apps/server/docs (inclusive planilhas e materiais de produtos próprios), .env real, bancos SQLite, dados de clientes, logs, backups, sessões de WhatsApp, node_modules, builds e arquivos fora da allowlist.

## Generalização

Na cópia vendável, o exportador substitui o conhecimento carregado no boot por dados fictícios e fornece uma base compatível com o mínimo de 20 trechos. Os prompts e catálogo de produtos são generalizados; não acompanham preços ou condições comerciais de clientes/produtos próprios.

## Verificação antes de vender

Extraia o ZIP em pasta isolada e rode: npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run test:smoke

Execute também Gitleaks no diretório extraído e faça inspeção manual. O gate do exportador bloqueia padrões conhecidos de tokens, exemplos com credenciais preenchidas e referências proprietárias, mas não prova ausência absoluta de dados sensíveis.

O núcleo é gratuito e self-hosted; Baileys e regras locais não exigem API paga. Meta Cloud API e Anthropic são opcionais, com custos e credenciais do comprador. Não compartilhe sessões, .env ou bancos de produção.

Respeite LICENSE/NOTICE, direitos de terceiros, opt-out e consentimento para WhatsApp.

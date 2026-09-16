# WppProspector

Repositório final do painel e servidor de prospecção por WhatsApp. Integrações existentes com Meta Cloud API e Anthropic preservadas.

## Estrutura

- `apps/server` — servidor, motor conversacional, conectividade WhatsApp, persistência e API de gestão.
- `apps/panel` — painel React/Vite atual. O visual foi preservado nesta migração.
- `packages/contracts` — contratos Zod/TypeScript compartilhados entre API e painel.
- `openspec` — especificação canônica e histórico de mudanças do produto.
- `docs` — baseline, arquitetura, mapa de telas e auditoria UX.

## Requisitos

- Node.js 24+
- npm

## Instalar e iniciar

```bash
git clone https://github.com/nutricionistaalmeidavh-spec/WppProspector.git
cd WppProspector
npm ci
npm run build
```

Coloque seu `.env` na raiz de `WppProspector` (ao lado deste README), usando `.env.example` como referência. Depois:

```bash
npm start
```

O servidor disponibiliza o painel em `http://localhost:3000/admin/` (ou na porta `PORT` configurada). A chave da tela de login é o valor de `ADMIN_ACCESS_SECRET`; não é a chave da Meta nem da Anthropic.

Configurações obrigatórias já usadas pelo servidor:

- `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `META_WEBHOOK_VERIFY_TOKEN`.
- `ANTHROPIC_API_KEY` e, quando aplicável, `ANTHROPIC_WORKSPACE_ID`.
- `ADMIN_ACCESS_SECRET`, `ADMIN_SESSION_SECRET` e `PROSPECTING_TEMPLATE_NAME` (template aprovado na sua conta).
- Se o `.env` antigo definir `ADMIN_WEB_DIST_DIR`, ajuste para `../panel/dist` ou remova a variável para usar esse padrão.

O `.env` legado em `apps/server/.env` também é aceito. Valores na raiz prevalecem sobre o arquivo legado; variáveis definidas pelo ambiente prevalecem sobre ambos. Não coloque segredos em variáveis `VITE_*`, na UI ou no Git.

Dados permanecem em `apps/server/data` por padrão. Para migrar uma instalação existente, com o serviço antigo parado, copie o banco SQLite consistente e a pasta de conversas (ou aponte `DATABASE_PATH` e `CONVERSATIONS_DIR` para os dados existentes). Não sobrescreva dados reais com fixtures de teste.

Em produção mantenha HTTPS e a proteção de rede de `/admin` previstas pelo servidor original. Cookies continuam `HttpOnly`, `Secure` e `SameSite=Strict`. HTTP em um IP de rede local não equivale a localhost para cookies seguros. O webhook da Meta deve continuar apontando para o endereço HTTPS do servidor final.

## Desenvolvimento e validação

```sh
npm run dev
# Em outro terminal, para hot reload do painel:
npm run dev:panel
```

O painel de desenvolvimento abre em `http://localhost:5173/admin/`. `BOT_ORIGIN` permite indicar um servidor diferente; sem ele, o proxy usa `PORT` ou 3000.

```sh
npm run check
npm run test:smoke
```

`check` executa sincronização de contratos, lint, typecheck, testes e build. `test:smoke` exige o build e valida HTTP/persistência com dados temporários, sem mensagens ou chamadas externas. GitHub Actions está disponível apenas por acionamento manual.

Veja [origens, ajustes e validação](docs/integration-delivery.md). As telas que já dependiam de capabilities continuam respeitando o suporte do servidor; esta entrega não cria módulos novos nem remove integrações. As chamadas reais Meta/Anthropic só podem ser confirmadas com suas credenciais no ambiente final.

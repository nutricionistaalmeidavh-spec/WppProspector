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

Modos de operação (P0 self-hosted):

- `WHATSAPP_PROVIDER=baileys` e `LLM_PROVIDER=rules` são os padrões, sem dependência comercial.
- Após `npm ci`, instale o conector local open-source explicitamente com `cd apps/server && npm install --no-save --package-lock=false --workspaces=false baileys@6.7.24 pino@9.14.0 qrcode-terminal@0.12.0` e volte à raiz antes de `npm start`.
- Para usar a API oficial, configure `WHATSAPP_PROVIDER=meta` e os segredos `META_*`; para Anthropic, configure `LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` e o modelo desejado. Esses serviços podem gerar cobranças.
- O modo local permite conversas iniciadas pelo contato; o endpoint de prospecção por template aprovado pertence à Meta. Campanhas exigem consentimento registrado e sem opt-out.
- Consulte `docs/p0-selfhosted-implementation.md` para estado do P0, limitações e procedimentos de QA.

Configurações do modo Meta/Anthropic **opcionais**:

- `META_ACCESS_TOKEN`, `META_APP_SECRET`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `META_WEBHOOK_VERIFY_TOKEN` (somente com `WHATSAPP_PROVIDER=meta`).
- `ANTHROPIC_API_KEY` e, quando aplicável, `ANTHROPIC_WORKSPACE_ID` (somente com `LLM_PROVIDER=anthropic`).
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


## CRM comercial (local, sem serviços pagos)

O painel em \`/admin/crm/commercial\` permite converter leads em clientes comerciais
sem alterar a base de prospecção, criar propostas locais com itens, registrar e concluir
tarefas e visualizar indicadores por origem e responsável. O pipeline possui
drag-and-drop no desktop e seletor acessível no celular. O banco aplica migrations
aditivas automaticamente; não substitui nem apaga conversas, histórico ou oportunidades.

Orçamentos são apenas propostas internas; não geram cobranças, notas fiscais
nem mensagens automáticas. Serviços pagos só são habilitados por configuração explícita.

### Instalação do core R$ 0

Com Node.js 24+ instalado:

\`\`\`bash
npm run setup:selfhost
npm start
\`\`\`

O setup cria \`.env\` com dois segredos aleatórios somente se não houver um
arquivo existente, instala dependências locais e compila o painel. Não exibe as
senhas geradas no terminal; guarde o conteúdo localmente em local seguro.
Acesse \`http://localhost:3000/admin/\`, usando o valor local de
\`ADMIN_ACCESS_SECRET\`. O conector Baileys é não oficial e requer pareamento
manual via QR. O modo de envio proativo usando templates pertence à API Meta,
que é **opcional e pode ser cobrada**.

Alternativamente, depois de gerar o \`.env\`:

\`\`\`bash
docker compose up --build -d
\`\`\`

O Compose expõe o painel apenas no loopback \`127.0.0.1\` e persiste o banco,
conversas e sessões em volume separado. Para acesso remoto, use HTTPS e rede
privada; não publique o painel administrativo diretamente na internet.

Consulte [gate de comercialização](docs/COMMERCIAL-RELEASE.md), [licença](LICENSE)
e [avisos de proveniência](NOTICE.md). Não distribua \`.env\`, banco, sessões ou
dados de clientes reais em pacotes de código-fonte.

## Central de conexões WhatsApp

No painel autenticado como **administrador**, abra **Configurações > Conexões WhatsApp**.

- **Local (R$ 0):** o conector Baileys gera QR em SVG localmente, visível apenas para a sessão administrativa. No celular, vá a WhatsApp > Aparelhos conectados > Conectar aparelho. Configure até cinco IDs em `BAILEYS_SESSION_IDS`; apenas a sessão selecionada recebe/processa conversas e envia mensagens (não misture contas).
- **Meta (opcional):** configure `META_APP_ID`, `META_CONFIG_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` e `WHATSAPP_CREDENTIALS_KEY` exclusivamente no ambiente privado. Cadastre Embedded Signup v4 na Meta e habilite as permissões, domínios JS SDK, URL HTTPS e revisão/aprovação exigidas. A tela oferece "Conectar com a Meta". O servidor troca o código e verifica a posse do WABA/número, assina o webhook, cifra o token no SQLite e ativa o canal.
- O core funciona sem Meta, IA comercial ou serviços pagos. Não publique `.env`, credenciais Baileys, o banco SQLite nem backups. Proteja `/admin` com HTTPS e rede privada. Guarde a chave de cifragem: perder `WHATSAPP_CREDENTIALS_KEY` impede descriptografar os tokens existentes.
- **Limite arquitetural:** uma instalação opera um canal ativo por vez. Os registros Meta podem ser preservados para alternância, mas operação multiempresa simultânea exige workspaces com isolamento integral de conversas, leads, outbox e webhook. Não vender como multi-tenant.
- A Meta pode cobrar mensagens/templates e exige conformidade de uso. Baileys é não oficial e sujeito a bloqueios. O QR não é login do CRM: primeiro autentique o painel, depois vincule o WhatsApp.

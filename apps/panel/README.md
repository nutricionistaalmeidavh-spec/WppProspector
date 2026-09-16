# wpp_prospector_bot_panel

SPA React (Vite) da **interface de gestão** do bot de prospecção. Consome a `management-api`
exposta pelo servidor sob `/admin/api` e é servida como estático pelo próprio servidor sob
`/admin` em produção.

- Repositório **irmão** de `wpp_prospector_bot_server/` (Git próprio). Depende dele via
  `file:../wpp_prospector_bot_server` apenas para importar os contratos de resposta
  (`wpp_prospector_bot_server/contracts`).
- Stack: React 18 + TypeScript, Vite, React Router 7, TanStack Query (polling), Tailwind +
  shadcn/ui, Recharts.

## Requisitos

- Node.js >= 24
- O servidor (`wpp_prospector_bot_server/`) buildado ao menos uma vez quando o **build de
  produção** da SPA vai rodar — o subcaminho `wpp_prospector_bot_server/contracts` resolve
  para `dist/` no modo `build` (para `src/` em dev/typecheck). Ver "Ordem de build" abaixo.

## Desenvolvimento

```bash
# 1. Suba o bot com a superfície /admin ligada (na pasta do servidor)
cd ../wpp_prospector_bot_server
ADMIN_ENABLED=true ADMIN_ACCESS_SECRET=dev ADMIN_SESSION_SECRET=dev npm run dev   # :3000

# 2. Suba o dev server da SPA (nesta pasta)
cd ../wpp_prospector_bot_panel
npm install
npm run dev            # http://localhost:5173/admin/
```

O dev server serve a app sob `/admin/` e faz proxy de `/admin/api/*` para o bot
(`http://localhost:3000` por padrão; ajuste com `BOT_ORIGIN` ou `PORT`). Não é preciso gerar
build para desenvolver.

Login: informe o valor de `ADMIN_ACCESS_SECRET` do servidor na tela de login.

## Scripts

- `npm run dev` — Vite dev server (porta 5173, base `/admin/`)
- `npm run build` — `tsc --noEmit` + `vite build` → `dist/` (assets com base `/admin/`)
- `npm run preview` — serve o `dist/` localmente (porta 4173) com o mesmo proxy
- `npm run lint` / `npm run typecheck` / `npm run test` / `npm run format`

## Build e deploy

1. **Ordem de build**: quando os contratos mudam, buildar o **servidor primeiro**
   (`cd ../wpp_prospector_bot_server && npm run build`) para que
   `wpp_prospector_bot_server/contracts` resolva para o `dist/` compilado.
2. `npm run build` nesta pasta gera `dist/`.
3. O pipeline posiciona esse `dist/` no caminho apontado por `ADMIN_WEB_DIST_DIR` do
   servidor (default `../wpp_prospector_bot_panel/dist` — já ao lado, se os dois repos ficam
   lado a lado no artefato). Com o diretório presente, o servidor serve a interface sob
   `/admin` (fallback SPA para rotas de navegação); ausente, o servidor sobe só com a API.
4. Nunca exponha `/admin` publicamente sem rede fechada (Tailscale / allowlist) na frente —
   o cookie de sessão é o mínimo, não uma fronteira de rede.

## Telas

Entregues conforme a API as suporta:

1. **Login** + shell autenticado — `POST`/`DELETE /admin/api/session`.
2. **Conversas** — lista com filtros (estado, intent, telefone, faixa de data) e paginação
   por cursor; detalhe com a linha do tempo dos turnos, intent/qualificação, módulos, plano
   citado e flags de pendência/abandono.
3. **Consumo** — série por período (hoje / 7 d / 30 d / custom) de tokens e custo de LLM +
   custo de WhatsApp por categoria; contadores do "agora".
4. **Ações sobre a conversa** (assumir / retomar / mensagem avulsa) — os controles só
   aparecem quando o deploy expõe os endpoints correspondentes
   (`add-management-conversation-actions`). Enquanto não, ficam ocultos/desabilitados.
5. **Prospecção** (cadastro de lead + disparo de template) — idem, condicionada a
   `add-outbound-prospecting-trigger`.

## Contrato com a API

Os tipos do cliente HTTP vêm de `wpp_prospector_bot_server/contracts` (schemas zod
versionados). Cada resposta de leitura é validada contra o schema; uma divergência mostra um
aviso de incompatibilidade com a versão de contrato esperada
(`MANAGEMENT_CONTRACT_VERSION`), em vez de renderizar dados possivelmente incorretos.

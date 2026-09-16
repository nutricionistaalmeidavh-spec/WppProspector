# DesignUIWPPBoot

Monorepo de evolução do produto de prospecção por WhatsApp.

## Estrutura

- `apps/server` — servidor, motor conversacional, conectividade WhatsApp, persistência e API de gestão.
- `apps/panel` — painel React/Vite atual. O visual foi preservado nesta migração.
- `packages/contracts` — contratos Zod/TypeScript compartilhados entre API e painel.
- `openspec` — especificação canônica e histórico de mudanças do produto.
- `docs` — baseline, arquitetura, mapa de telas e auditoria UX.

## Requisitos

- Node.js 24+
- npm

## Desenvolvimento

```bash
npm install
npm run check
```

Para iniciar os componentes separadamente:

```bash
npm run dev -w wpp_prospector_bot_server
npm run dev -w wpp_prospector_bot_panel
```

## Processo de mudança

Mudanças relevantes usam OpenSpec:

`explore → propose → apply → archive`

A migração das fases 0–8 não altera o design visual do painel. O próximo checkpoint é a proposta OpenSpec específica do redesign de UX/UI.

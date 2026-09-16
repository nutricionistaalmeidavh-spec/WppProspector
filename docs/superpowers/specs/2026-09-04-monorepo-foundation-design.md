# WPP Prospector Monorepo Foundation — Design

## Goal

Consolidate the currently functional WhatsApp product into `DesignUIWPPBoot` without redesigning the UI yet, preserving the server/bot behavior and the current panel while creating a stable base for the next UX/UI phase.

## Baselines

- Server + bot runtime: `Marcoslima016/wpp_prospector_bot`, branch `feature/refinamento_bot`, commit `464e5dcb1cef198721e1db3c46cc48500ae02d0d`.
- Panel: `Marcoslima016/wpp_prospector_bot_panel`, branch `feature/leads_import_and_start_chat`, commit `03ac11773d9bc2c2d541dbdda8cf33d0db6bad76`.
- Destination baseline: `nutricionistaalmeidavh-spec/DesignUIWPPBoot`, `main`, commit `7e41b1ba5f6af07bf841b994718b4c6497ad1517`.

The `feature/refinamento_bot` branch is the correct server baseline because it contains the management API, conversation engine, WhatsApp Cloud API connectivity, persistence, consumption metrics, lead import/prospecting and the OpenSpec history. Older `main`/`develop` branches are not used as the migration source.

The panel uses `feature/leads_import_and_start_chat` because it is aligned with the current server contract surface and includes the functional Leads/prospecting experience that is not present on the older panel `main` baseline.

## Architecture

```text
DesignUIWPPBoot/
├── apps/
│   ├── server/          # server + bot runtime preserved from the current functional branch
│   └── panel/           # current React/Vite management panel
├── packages/
│   └── contracts/       # versioned management API DTO/Zod contracts consumed by the panel
├── openspec/            # canonical product specs and archived changes from the server baseline
├── docs/
│   ├── baseline.md
│   ├── architecture.md
│   ├── screen-map.md
│   ├── ux-audit.md
│   └── legacy/
├── scripts/
├── .github/workflows/
└── package.json
```

### Important preservation decision

The functional bot is already integrated into the current server codebase through `conversation-engine`, `whatsapp-connectivity`, `management` and shared persistence. It will **not** be physically split into a new `bot-core` package during this checkpoint because doing so would introduce unnecessary behavioral risk before the UI work. The first migration preserves that runtime intact under `apps/server`.

`packages/contracts` is the only shared package extracted now. It contains a synchronized copy of the public DTO/Zod contract surface from `apps/server/src/management/interface/dto`, including the small conversation-domain dependencies those DTOs import. The panel depends on `@wpp/contracts` instead of a sibling repository path.

## Data and request flow

```text
WhatsApp Cloud API
        ↓
apps/server/whatsapp-connectivity
        ↓
apps/server/conversation-engine
        ↓
apps/server/management API  (/admin/api)
        ↓
packages/contracts
        ↓
apps/panel
```

SQLite and the existing persistence adapters stay inside `apps/server` for this phase. No database migration or product behavior change is introduced.

## OpenSpec

The server branch's current `openspec/` tree becomes the canonical root OpenSpec tree in the new repository. The panel's separate OpenSpec material is retained under `docs/legacy/panel-openspec/` for traceability rather than creating two competing canonical spec trees.

Future material changes, including the dashboard redesign, must follow:

```text
explore → propose → apply → archive
```

## Build model

The repository uses npm workspaces with Node.js 24+.

Root validation commands:

```bash
npm run sync:contracts
npm run lint
npm run typecheck
npm test
npm run build
```

`sync:contracts` refreshes the shared contract snapshot from the server DTO source. CI verifies that the generated shared contracts remain synchronized.

## UI boundary for this checkpoint

No visual redesign is permitted in phases 0–8. The panel is migrated as-is except for the package import required to consume shared contracts. The current route set includes Login, Conversas, Detalhe da conversa, Leads/Prospecção, Consumo and fallback. Phase 7 maps these screens and API dependencies. Phase 8 documents UX problems and priorities. Actual visual/interaction changes begin only in a subsequent OpenSpec change.

## Success criteria

1. Source repositories remain unchanged.
2. Destination branch contains the server and panel source snapshots pinned above.
3. Panel no longer depends on `file:../wpp_prospector_bot_server`.
4. Shared API contracts live under `packages/contracts` and are synchronized from the server source.
5. Root install, lint/typecheck, tests and build are automated in CI.
6. Canonical OpenSpec history is preserved at repository root.
7. Existing routes and user flows are documented before redesign.
8. UX audit is documented without changing visual UI behavior.

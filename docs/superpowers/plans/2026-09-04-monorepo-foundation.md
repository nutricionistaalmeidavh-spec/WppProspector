# WPP Prospector Monorepo Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the current functional server/bot and panel into a stable npm-workspace monorepo, preserve OpenSpec, validate the integrated build, and document the current UI/UX before any redesign.

**Architecture:** Keep the current server+bot runtime intact under `apps/server`, migrate the React panel under `apps/panel`, and introduce `packages/contracts` as the shared management API contract surface. The server OpenSpec tree becomes canonical at repository root; visual UI remains unchanged in this checkpoint.

**Tech Stack:** Node.js 24+, TypeScript, Fastify, Zod, Vitest, React 18, Vite, TanStack Query, React Router, npm workspaces, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-monorepo-foundation-design.md`

## Global Constraints

- Do not modify the two source repositories.
- Server source is pinned to `464e5dcb1cef198721e1db3c46cc48500ae02d0d` from `feature/refinamento_bot`.
- Panel source is pinned to `03ac11773d9bc2c2d541dbdda8cf33d0db6bad76` from `feature/leads_import_and_start_chat`.
- Node.js minimum is 24.
- No visual UI redesign in phases 0–8.
- Preserve the server's canonical OpenSpec history.
- Remove local/cache/generated artifacts from the migrated snapshot.

---

### Task 1: Baseline and isolated migration branch

**Files:**
- Create: `docs/baseline.md`
- Existing branch: `integration/phases-0-8`

**Produces:** Exact source SHAs and migration provenance.

- [x] Record source repo, branch and commit SHAs.
- [x] Record destination baseline SHA.
- [x] Confirm source repositories receive no writes.
- [x] Commit baseline documentation.

### Task 2: Migrate server and panel snapshots

**Files:**
- Create: `apps/server/**`
- Create: `apps/panel/**`
- Create: `docs/legacy/panel-openspec/**`
- Create/replace: `openspec/**`

**Produces:** Pinned source snapshots inside the destination repository.

- [x] Clone server source at the pinned SHA in CI migration tooling.
- [x] Clone panel source at the pinned SHA.
- [x] Copy server runtime while excluding `.git`, `.DS_Store`, `.agents`, `.claude`, `.vscode`, `node_modules`, `dist` and nested `.github` workflows.
- [x] Move the server OpenSpec tree to repository root.
- [x] Copy panel runtime with the same local/generated exclusions.
- [x] Preserve panel OpenSpec separately under `docs/legacy/panel-openspec`.
- [x] Verify the expected package names and source entry points exist.

### Task 3: Create workspace and shared contracts

**Files:**
- Create: `package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/**`
- Create: `scripts/sync-contracts.mjs`
- Modify: `apps/panel/package.json`
- Modify: `apps/panel/src/api/contracts.ts`

**Consumes:** `apps/server/src/management/interface/dto/*.ts` and their small conversation-domain type dependencies.

**Produces:** `@wpp/contracts` workspace package.

- [x] Add npm workspaces for server, panel and contracts.
- [x] Write `sync-contracts.mjs` to copy the server management contract surface deterministically while preserving its relative import layout.
- [x] Run the sync once and commit the generated contract snapshot.
- [x] Replace the panel's sibling-repository dependency with `@wpp/contracts`.
- [x] Replace imports from `wpp_prospector_bot_server/contracts` with `@wpp/contracts`.
- [x] Remove nested lockfiles and generate one root `package-lock.json`.

### Task 4: Repository-level validation scripts

**Files:**
- Modify: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

**Produces:** Stable root commands.

- [x] Add `sync:contracts`, `lint`, `typecheck`, `test`, `build` and `check` scripts.
- [x] Keep server environment variables documented in the root reference file without secrets.
- [x] Add ignores for dependencies, builds, local databases, logs, credentials and editor/cache artifacts.
- [x] Run `npm install` on Node 24.

### Task 5: Verify equivalent server/panel behavior

**Files:** No product behavior changes except one stale migrated test assertion aligned with the canonical pricing data (`R$ 200` instead of its previous `R$ 300` expectation).

**Produces:** Evidence that the migrated code remains build/test compatible.

- [x] Run `npm run sync:contracts`.
- [x] Run `npm run lint`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Verify 503 server tests and 42 panel tests pass.

### Task 6: CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Produces:** Pull-request and branch validation for the monorepo.

- [x] Configure Node 24 and `npm ci`.
- [x] Verify contracts are synchronized and fail CI on drift.
- [x] Run lint, typecheck, tests and build.
- [x] Upload no secrets or runtime databases.

### Task 7: OpenSpec consolidation and architecture docs

**Files:**
- Preserve: `openspec/**`
- Create: `docs/architecture.md`
- Create: `README.md`

**Produces:** One canonical product specification and architecture reference.

- [x] Keep server OpenSpec specs and archived changes at root.
- [x] Document component ownership and data flow.
- [x] Document that bot-core physical extraction is intentionally deferred to avoid pre-UI regressions.
- [x] Document the mandatory `explore → propose → apply → archive` workflow for future material changes.

### Task 8: Current screen map and UX audit

**Files:**
- Create: `docs/screen-map.md`
- Create: `docs/ux-audit.md`

**Produces:** The checkpoint immediately before redesign.

- [x] Map Login, Conversas, Detalhe da conversa, Leads/Prospecção, Consumo and fallback from the actual router.
- [x] Map API dependencies and actions for each screen.
- [x] Map the existing lead import, filtering, bulk prospecting and reset flow.
- [x] Audit information hierarchy, navigation, action feedback, loading/error/empty states, operator workflow, manager visibility, responsive behavior and accessibility.
- [x] Rank UX findings as P0/P1/P2 without implementing visual changes.
- [x] Stop before creating or applying the dashboard redesign change.

## Final verification

- [x] Compare source SHAs with `docs/baseline.md`.
- [x] Confirm the source repositories were not modified.
- [x] Run the complete root validation pipeline on a clean GitHub Actions runner.
- [x] Inspect the migration for accidental credentials, generated databases and visual redesign changes.
- [x] Open PR #1 from `integration/phases-0-8` to `main`; do not merge automatically.

## Verification snapshot

The bootstrap validation and the final monorepo CI completed successfully on clean GitHub Actions runners:

- server lint/typecheck/build: passed;
- panel lint/typecheck/build: passed;
- shared contracts typecheck/drift check: passed;
- server tests: 503 passed across 72 files;
- panel tests: 42 passed across 12 files.

Known non-blocking follow-ups are recorded in `docs/ux-audit.md`.

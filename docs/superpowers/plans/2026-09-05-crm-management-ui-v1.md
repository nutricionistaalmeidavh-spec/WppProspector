# CRM Management UI V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a nova UI CRM aprovada, preservando integrações existentes e deixando Pipeline/Oportunidades/Empresas/Campanhas prontos para trocar fixtures por contratos reais sem redesenho.

**Architecture:** O painel continua React/Vite e mantém auth, API client, React Query e contratos atuais. A nova camada visual usa um AppShell com sidebar responsiva, rotas agrupadas por domínio e um adapter CRM isolado; áreas suportadas pelo backend usam hooks reais, enquanto capacidades futuras usam `CrmRepository` + `MockCrmRepository` apenas em preview/dev e ficam bloqueadas por capability gating em produção.

**Tech Stack:** Node 24+, React 18, React Router 7, TanStack Query 5, TypeScript 6, Tailwind CSS 3, shadcn-style primitives existentes, Lucide, Recharts, Vitest/Testing Library.

**Spec:** `openspec/changes/redesign-crm-management-ui/design.md`

## Global Constraints

- Não alterar `apps/server/**`, migrations, bot, conversation engine ou regras de automação.
- Preservar sessão/auth, API client, React Query, Zod validation, parser XLSX e mutações existentes.
- Não inventar dados CRM em produção; fixtures só podem aparecer quando `VITE_CRM_PREVIEW_MODE=true` ou em `import.meta.env.DEV`.
- Recursos futuros sem backend devem renderizar estado de integração pendente fora do preview, nunca botões falsamente funcionais.
- Desktop operacional; mobile usa navegação lista → detalhe quando múltiplos painéis não cabem.
- Manter `basename: /admin`.
- Toda mutação real mantém feedback de pending/success/error existente.

---

### Task 1: Fundação visual e componentes compartilhados

**Files:**
- Modify: `apps/panel/src/index.css`
- Create: `apps/panel/src/components/PageHeader.tsx`
- Create: `apps/panel/src/components/SectionState.tsx`
- Create: `apps/panel/src/components/StatusPill.tsx`
- Create: `apps/panel/src/components/FeatureAvailability.tsx`
- Test: `apps/panel/src/components/feature-availability.test.tsx`

**Interfaces:**
- Produces: `PageHeader`, `EmptyState`, `ErrorState`, `FeatureAvailability`, `StatusPill`.

- [ ] Escrever teste que verifica que `FeatureAvailability supported=false preview=false` mostra integração pendente e não renderiza children.
- [ ] Executar `npm test --workspace wpp_prospector_bot_panel -- feature-availability.test.tsx` e confirmar falha inicial.
- [ ] Implementar componentes e tokens de superfície/sidebar/brand no CSS.
- [ ] Reexecutar o teste e confirmar PASS.

### Task 2: AppShell e navegação responsiva

**Files:**
- Modify: `apps/panel/src/components/AppShell.tsx`
- Create: `apps/panel/src/components/navigation.tsx`
- Modify: `apps/panel/src/routes/router.tsx`
- Test: `apps/panel/src/routes/navigation.test.tsx`

**Interfaces:**
- Consumes: `FeatureAvailability`.
- Produces: rotas `/overview`, `/crm/*`, `/prospecting/*`, `/conversations/*`, `/analytics/*`, `/settings`.

- [ ] Escrever teste para sidebar desktop com grupos `CRM`, `Prospecção`, `Conversas`, `Analytics` e redirecionamento raiz para `/overview`.
- [ ] Implementar sidebar fixa desktop, drawer mobile e cabeçalho compacto.
- [ ] Preservar logout e `ContractMismatchBanner`.
- [ ] Manter alias/redirect de rotas antigas (`/conversations`, `/leads`, `/consumption`) para as novas rotas.
- [ ] Rodar testes de auth e navegação.

### Task 3: Adapter CRM e capability gating

**Files:**
- Create: `apps/panel/src/features/crm/types.ts`
- Create: `apps/panel/src/features/crm/mock-data.ts`
- Create: `apps/panel/src/features/crm/repository.ts`
- Create: `apps/panel/src/features/crm/preview.ts`
- Test: `apps/panel/src/features/crm/repository.test.ts`
- Modify: `apps/panel/.env.example`

**Interfaces:**

```ts
export interface CrmRepository {
  listOpportunities(): Promise<Opportunity[]>;
  getOpportunity(id: string): Promise<Opportunity | null>;
  listCompanies(): Promise<Company[]>;
  listCampaigns(): Promise<CampaignSummary[]>;
}
```

`isCrmPreviewEnabled()` retorna `import.meta.env.DEV || import.meta.env.VITE_CRM_PREVIEW_MODE === "true"`.

- [ ] Testar determinismo de `MockCrmRepository` e lookup por id.
- [ ] Implementar fixtures coerentes entre empresa, lead, oportunidade e campanha.
- [ ] Documentar `VITE_CRM_PREVIEW_MODE=false` no `.env.example`.

### Task 4: Visão Geral operacional

**Files:**
- Create: `apps/panel/src/features/overview/OverviewRoute.tsx`
- Test: `apps/panel/src/features/overview/OverviewRoute.test.tsx`

**Interfaces:**
- Consumes: `useOverview()` real e `MockCrmRepository` somente em preview.
- Produces: home `/overview`.

- [ ] Testar cards reais `Aguardando humano`, `Leads`, `Inbound pendente`.
- [ ] Renderizar bloco `Precisa de atenção` com `awaitingHuman` e `pendingInbound` reais.
- [ ] Em preview, acrescentar oportunidades/campanhas mockadas com badge `Preview`.
- [ ] Fora do preview, não mostrar métricas CRM fictícias.

### Task 5: CRM visual — Pipeline, Oportunidades e Empresas

**Files:**
- Create: `apps/panel/src/features/crm/PipelineRoute.tsx`
- Create: `apps/panel/src/features/crm/OpportunitiesRoute.tsx`
- Create: `apps/panel/src/features/crm/OpportunityDetailRoute.tsx`
- Create: `apps/panel/src/features/crm/CompaniesRoute.tsx`
- Create: `apps/panel/src/features/crm/OpportunityCard.tsx`
- Test: `apps/panel/src/features/crm/crm-routes.test.tsx`

**Interfaces:**
- Consumes: `CrmRepository`, `FeatureAvailability`, preview flag.
- Pipeline stages: `new | contacted | replied | qualified | meeting | proposal | negotiation | won | lost`.

- [ ] Testar que sem preview as rotas mostram integração pendente.
- [ ] Testar que no preview Pipeline renderiza colunas e abre detalhe por clique.
- [ ] Implementar Kanban horizontal com alternativa explícita `Mover etapa` somente visual/mock no preview.
- [ ] Implementar lista de oportunidades, detalhe com tabs visuais e empresas.
- [ ] Não persistir mudanças de estágio fora do estado local de preview.

### Task 6: Prospecção e campanhas

**Files:**
- Modify: `apps/panel/src/features/leads/LeadsRoute.tsx`
- Create: `apps/panel/src/features/campaigns/CampaignsRoute.tsx`
- Create: `apps/panel/src/features/campaigns/CampaignDetailRoute.tsx`
- Create: `apps/panel/src/features/campaigns/ImportsRoute.tsx`
- Test: `apps/panel/src/features/campaigns/campaign-routes.test.tsx`

**Interfaces:**
- Leads mantém hooks reais.
- Campaigns usa `CrmRepository` somente em preview; produção usa `FeatureAvailability` pendente.

- [ ] Aplicar `PageHeader`, filtros em superfície e barra de seleção consistente à tela real de Leads.
- [ ] Preservar `ImportDialog`, seleção, prospecting, reset e paginação.
- [ ] Implementar lista/detalhe de campanha em preview com métricas coerentes.
- [ ] `ImportsRoute` reutiliza o fluxo real de importação abrindo/embutindo `ImportDialog` a partir de uma página guiada.

### Task 7: Inbox e Aguardando Humano

**Files:**
- Create: `apps/panel/src/features/inbox/InboxRoute.tsx`
- Create: `apps/panel/src/features/inbox/ConversationListPane.tsx`
- Modify: `apps/panel/src/features/conversations/ConversationDetailRoute.tsx`
- Test: `apps/panel/src/features/inbox/InboxRoute.test.tsx`

**Interfaces:**
- Consumes: `useConversationList`, rota real `/conversations/:leadPhone`, filtros atuais e ações existentes.

- [ ] Testar lista de conversas e filtro `awaitingHuman` via query/prop de rota.
- [ ] Implementar Inbox responsiva: desktop lista + área de conteúdo; mobile lista → detalhe.
- [ ] Preservar detalhe existente como rota canônica para ações/timeline.
- [ ] Criar `/conversations/handoff` como Inbox pré-filtrada em `awaitingHuman`.

### Task 8: Analytics e ajustes de Consumo

**Files:**
- Modify: `apps/panel/src/features/consumption/ConsumptionRoute.tsx`
- Create: `apps/panel/src/features/analytics/FunnelRoute.tsx`
- Create: `apps/panel/src/features/analytics/ConversionsRoute.tsx`
- Create: `apps/panel/src/features/analytics/CampaignAnalyticsRoute.tsx`
- Test: `apps/panel/src/features/analytics/analytics-routes.test.tsx`

**Interfaces:**
- `/analytics/costs` usa APIs reais atuais.
- Demais analytics dependem de preview/contratos futuros.

- [ ] Redesenhar cabeçalho/controles de Consumo sem alterar queries.
- [ ] Implementar telas de funil/conversão/campanhas em preview usando fixtures.
- [ ] Fora do preview, mostrar integração pendente.

### Task 9: Settings, auth polish e compatibilidade

**Files:**
- Create: `apps/panel/src/features/settings/SettingsRoute.tsx`
- Modify: `apps/panel/src/routes/LoginRoute.tsx`
- Modify: `apps/panel/src/routes/auth-flow.test.tsx`

- [ ] Atualizar login para nova linguagem visual sem mudar o contrato de sessão.
- [ ] Criar Settings com estado somente leitura das capacidades existentes e módulos futuros.
- [ ] Atualizar testes que dependem do shell antigo sem enfraquecer assertions de auth/401/logout.

### Task 10: Verificação final

- [ ] Executar `npm ci` em runner limpo do GitHub Actions.
- [ ] Executar `npm run check:contracts`.
- [ ] Executar `npm run lint`.
- [ ] Executar `npm run typecheck`.
- [ ] Executar `npm test`.
- [ ] Executar `npm run build`.
- [ ] Inspecionar o diff para confirmar que `apps/server/**` não foi alterado.
- [ ] Confirmar que fixtures CRM só são acessíveis via preview/dev.
- [ ] Abrir PR de `ui/crm-v1-implementation` para `ui/redesign-crm-management-spec`; não fazer merge automático.

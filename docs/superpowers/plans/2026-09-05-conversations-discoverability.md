# Conversations Discoverability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a lista de conversas imediatamente encontrável no menu e exibir um resumo das conversas recentes na Visão geral.

**Architecture:** Reutilizar a rota e o hook de conversas existentes, sem criar um segundo fluxo de Inbox. A navegação passa a expor `/conversations/inbox` com o rótulo `Conversas`; a Visão geral consome `useConversationList({})` e apresenta somente um resumo dos itens já entregues pela API.

**Tech Stack:** React 18, React Router, TanStack Query, TypeScript, Vitest, Tailwind CSS.

**Spec:** feedback aprovado no chat em 2026-09-05: item explícito de Conversas no menu e resumo das conversas na tela inicial.

## Global Constraints

- Preservar o fluxo desktop já existente de lista + detalhe lado a lado.
- Preservar o fluxo mobile já existente de lista → tela de detalhe.
- Não duplicar fonte de dados nem inventar campos que a API não fornece.
- Manter os módulos condicionais do CRM governados por `crmRuntime.modules`.
- Reutilizar `/conversations/inbox` como destino canônico.

---

### Task 1: Tornar Conversas explícito na navegação

**Files:**
- Modify: `apps/panel/src/routes/navigation.test.tsx`
- Modify: `apps/panel/src/components/navigation.tsx`

**Interfaces:**
- Consumes: `getNavigationGroups(crm: CrmModules): NavGroup[]`
- Produces: item de menu `{ to: "/conversations/inbox", label: "Conversas" }`, posicionado no grupo CRM logo após Pipeline quando Pipeline existir; `Aguardando humano` permanece em grupo de atendimento.

- [ ] **Step 1: Write the failing test**

Adicionar asserções de que `Conversas` existe, `Inbox` não é mais o rótulo do menu e que, com oportunidades habilitadas, `Conversas` vem imediatamente depois de `Pipeline`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/panel/src/routes/navigation.test.tsx`
Expected: FAIL porque a navegação atual ainda usa o rótulo `Inbox`.

- [ ] **Step 3: Write minimal implementation**

Mover o item `/conversations/inbox` para o grupo CRM com label `Conversas`; renomear o grupo restante para `Atendimento` e manter `Aguardando humano` nele.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/panel/src/routes/navigation.test.tsx`
Expected: PASS.

### Task 2: Resumo de conversas recentes na Visão geral

**Files:**
- Modify: `apps/panel/src/features/overview/OverviewRoute.test.ts`
- Modify: `apps/panel/src/features/overview/OverviewRoute.tsx`

**Interfaces:**
- Consumes: `useConversationList({})` e campos existentes `leadPhone`, `lastActivityAt`, `state`, `hasPendingInbound`, `leadIntent`, `leadQualification`.
- Produces: `buildRecentConversations(items, limit)` para ordenar por atividade recente e limitar o resumo; card `Conversas recentes` com link `Ver todas as conversas` para `/conversations/inbox`.

- [ ] **Step 1: Write the failing test**

Adicionar teste unitário para `buildRecentConversations`: ordenar `lastActivityAt` descrescente, limitar a quantidade e não alterar a entrada.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- apps/panel/src/features/overview/OverviewRoute.test.ts`
Expected: FAIL porque `buildRecentConversations` ainda não existe.

- [ ] **Step 3: Write minimal implementation**

Implementar o helper, carregar a primeira página com `useConversationList({})` e renderizar um card de até quatro conversas recentes. Exibir telefone, horário, intenção/qualificação e estado; usar `mensagem recebida` quando `hasPendingInbound` estiver ativo. Renderizar skeleton enquanto carrega e estado discreto quando não houver conversas.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- apps/panel/src/features/overview/OverviewRoute.test.ts`
Expected: PASS.

### Task 3: Verificação integrada

**Files:**
- No production changes expected.

- [ ] **Step 1: Run full CI-equivalent verification**

Run: `npm run check:contracts && npm run lint && npm run typecheck && npm test && npm run build`
Expected: exit 0.

- [ ] **Step 2: Review requirements**

Confirmar: menu explícito `Conversas`; Inbox desktop continua split view; mobile continua navegação por tela; dashboard mostra resumo e link para todas as conversas; nenhum campo de backend foi inventado.

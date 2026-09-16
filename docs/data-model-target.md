# Modelo de dados alvo

## 1. Estado atual

O modelo atual é propositalmente simples e deve continuar funcionando durante o redesign.

### Leads

SQLite `leads` usa telefone E.164 como chave primária e mantém cadastro/contexto do lead e estado do primeiro contato (`pending`, `sent`, `replied`, `failed`). Campos de importação incluem empresa, segmento, cidade e `imported_at`.

### Conversas

A fonte da verdade continua sendo um JSON por lead. `conversation_index` é uma projeção SQL para listagem, filtros e contadores atuais.

### Consumo e auditoria

Eventos de LLM e WhatsApp são append-only em SQLite. Ações administrativas também possuem registro próprio.

## 2. Problema que o modelo alvo resolve

No estado atual, o lead possui um estado global de prospecção. Isso funciona para o primeiro fluxo, mas não representa corretamente:

- várias campanhas ao longo do tempo;
- progresso de um lote;
- tentativa/retry por lead;
- resultado de uma campanha específica;
- custo e conversão atribuídos a uma iniciativa;
- retomada segura depois de reinício.

A solução é separar **cadastro do lead** de **participação em campanha** e de **execução**.

## 3. Entidades alvo

```text
Organization (futuro escopo)
   │
   ├── User / Membership
   ├── WhatsAppAccount
   ├── Lead
   │     └── CampaignLead ───── Campaign
   │                              │
   │                              └── CampaignRun
   │                                    └── OutboundJob
   │
   └── Conversation
          ├── Message/Turn
          └── Handoff

UsageEvent / AuditLog / OutboxEvent
```

### `organizations`

Não precisa ser ativado agora, mas é o boundary futuro para comercialização SaaS.

Campos conceituais:

- `id`;
- `name`;
- `status`;
- timestamps.

### `users` / `memberships`

Change futura de Identity/RBAC. Não substitui o segredo/cookie atual nesta fase.

Papéis previstos inicialmente: `owner`, `admin`, `manager`, `sdr`, `viewer`.

### `whatsapp_accounts`

Representa a conexão/canal, em vez de espalhar IDs da Meta pelas regras de negócio.

Campos conceituais:

- `id`;
- `organization_id` futuramente;
- provider;
- external account/phone number ids;
- status operacional;
- timestamps.

Segredos nunca pertencem à linha de domínio; permanecem em secret storage/env.

### `leads`

Cadastro canônico do prospect.

O `prospecting_state` atual pode continuar durante a transição, mas deixa de ser a única fonte para histórico de prospecção.

Campos alvo:

- `id` interno estável;
- `organization_id` futuro;
- phone E.164 com unique por organização;
- display name/company;
- segment;
- city;
- source;
- notes;
- opt-out/suppression status;
- timestamps.

### `lead_imports`

Registra cada importação como operação observável.

- arquivo/origem;
- quantidade total;
- válidos;
- rejeitados;
- inseridos;
- atualizados;
- autor;
- timestamp.

A UI atual já mostra preview de importação; esta entidade permitirá histórico e auditoria dessa ação.

### `campaigns`

Entidade central da prospecção.

Campos conceituais:

- `id`;
- `organization_id` futuro;
- nome;
- objetivo/segmento opcional;
- canal/account;
- template/estratégia de abertura;
- status: `draft | ready | running | paused | completed | cancelled`;
- created/started/completed timestamps.

### `campaign_leads`

Relaciona audiência e resultado de cada lead dentro da campanha.

Campos conceituais:

- `campaign_id`;
- `lead_id`;
- eligibility/status;
- selected_at;
- first_attempt_at;
- delivered_at;
- replied_at;
- qualified_at;
- failure_code/reason;
- conversation_id quando houver.

Unique composto por campanha + lead.

### `campaign_runs`

Uma campanha pode ter uma ou mais execuções/reinícios controlados.

Campos conceituais:

- `id`;
- `campaign_id`;
- status;
- requested_by;
- started_at;
- finished_at;
- counters snapshot/metadata quando útil.

### `outbound_jobs`

Unidade durável de trabalho executada pelo worker.

Campos conceituais:

- `id`;
- `campaign_run_id`;
- `campaign_lead_id`;
- tipo de envio;
- idempotency key;
- `pending | processing | sent | failed | retryable`;
- attempts;
- next_attempt_at;
- provider message id;
- error code/reason;
- timestamps.

Essa tabela/fila substitui a ideia de depender da requisição HTTP para terminar o lote.

### `conversations`

No curto prazo pode continuar em JSON. O modelo alvo, caso seja migrado para SQL, deve ter ID próprio e referenciar lead, canal e ownership.

Campos conceituais:

- `id`;
- lead;
- WhatsApp account;
- state;
- intent;
- qualification;
- quoted plan;
- owner type (`bot | human`);
- assigned user opcional;
- pending inbound;
- last activity;
- timestamps.

### `messages` / `conversation_turns`

Histórico normalizado opcional quando a migração do agregado JSON fizer sentido.

Deve manter:

- direção;
- origin (`bot | human | lead | system`);
- conteúdo;
- provider message id;
- delivery status;
- timestamps;
- metadados necessários à decisão/auditoria.

### `handoffs`

Histórico explícito de transferência bot ↔ humano, em vez de depender somente do estado final da conversa.

### `usage_events`

Continuar append-only. Pode permanecer separado por fonte (LLM/WhatsApp) ou usar uma projeção analítica unificada, desde que a origem e dimensões permaneçam rastreáveis.

### `audit_logs`

Toda ação administrativa relevante deve ser atribuível e imutável.

### `outbox_events`

Quando jobs assíncronos forem introduzidos, eventos que precisam ser publicados/processados depois de uma transação devem poder usar transactional outbox. Não é necessário Kafka.

## 4. Read models

Não são novas fontes da verdade. São projeções voltadas para UI.

### `operational_overview`

Combina:

- saúde do WhatsApp;
- campanhas em execução;
- progresso/falhas;
- conversas aguardando humano;
- inbound pendente;
- custo recente;
- alertas/exceções.

### `campaign_summary`

Agrupa métricas por campanha e run.

### `inbox_priority`

Ordena conversas pela necessidade operacional e última atividade.

## 5. Migração incremental

### Etapa A — atual / redesign

- manter JSON + SQLite;
- manter endpoints atuais;
- criar novos contratos apenas conforme telas precisarem;
- nenhuma migração obrigatória de banco.

### Etapa B — campanha

Adicionar migrations SQLite para `campaigns`, `campaign_leads` e `campaign_runs`, adaptando o disparo existente de forma compatível.

### Etapa C — jobs/outbox

Adicionar `outbound_jobs` e idempotência. O worker pode ainda rodar no mesmo processo.

### Etapa D — worker separado

Separar processo quando necessário sem mudar regras de domínio.

### Etapa E — PostgreSQL

Migrar quando escala/comercialização exigir. Contratos HTTP e domínio permanecem estáveis; adapters de persistência são trocados.

### Etapa F — conversas em SQL, somente se necessário

Migrar JSON por lead apenas quando houver benefício claro. Não acoplar esta migração ao redesign.

## 6. Regra de segurança de dados

O modelo futuro deve suportar:

- opt-out/suppression antes de criar job outbound;
- idempotência para impedir duplicidade de envio;
- auditabilidade de ações humanas;
- escopo por organização quando Identity entrar;
- retenção definida para eventos e mensagens;
- nenhuma credencial de Meta/LLM persistida como dado de negócio.

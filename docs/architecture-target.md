# Arquitetura-alvo — WPP Prospector

## Decisão

A arquitetura recomendada é um **monólito modular com processamento assíncrono**, não microserviços.

O objetivo é manter simplicidade de deploy e desenvolvimento, mas criar limites suficientemente fortes para o produto crescer sem transformar `management`, `conversation-engine` ou integrações externas em um bloco único.

## Estrutura física: agora e alvo

### Agora

```text
apps/
├── server/
└── panel/

packages/
└── contracts/
```

Essa estrutura continua válida durante o redesign.

### Alvo, quando a separação física trouxer benefício

```text
apps/
├── api/
├── worker/
└── panel/

packages/
├── contracts/
├── domain/
├── database/
├── messaging/
├── ai/
└── observability/
```

**Não criar pacotes vazios agora.** A extração deve acontecer quando um limite possuir código e testes suficientes para justificar a mudança.

## Dependências

```text
Panel
  │
  ▼
Contracts
  │
  ▼
API / Application
  │
  ▼
Domain

Database ───────► implementa ports do domínio
Messaging ──────► implementa ports do domínio
AI ─────────────► implementa ports do domínio
Worker ─────────► executa commands/jobs usando os mesmos casos de uso
```

O domínio fica no centro e não importa infraestrutura.

## Módulos de domínio

### Leads

Cadastro e qualidade do prospect: identidade de contato, normalização, deduplicação, importação, segmentação e suppression.

### Campaigns

Agrupa a iniciativa comercial. É o elo que falta entre lista de leads e conversas.

```text
Lead → CampaignLead → Campaign → CampaignRun → OutboundJob
```

### Conversations

Conversa e trabalho do operador: estado, intent, qualificação, histórico, pending inbound, ownership, handoff e retomada.

### Automation

Conversation engine, regras e follow-ups. Produz decisões/commands; não depende do gateway Meta concreto.

### Messaging

Contrato genérico de mensageria e adapters concretos. Meta Cloud API é um adapter.

### AI

Contrato de LLM e adapters concretos. O domínio não depende diretamente de Anthropic ou de outro fornecedor.

### Management / Analytics

Queries, read models e comandos administrativos. Serve a UI, mas não deve virar o lugar onde novas regras de negócio são despejadas.

### Identity

Futuro módulo de Organization/User/Membership/RBAC. A autenticação de usuário único existente permanece até uma change específica.

## API vs Worker

### API

Responsável por:

- autenticação/autorização;
- validação de entrada;
- commands rápidos;
- queries/read models;
- criação de intenção de trabalho persistente.

### Worker

Responsável por:

- envio de campanha;
- retries;
- follow-ups;
- jobs agendados;
- processamento que não deve depender da vida da requisição HTTP.

Inicialmente os dois papéis podem continuar no mesmo processo Node. O ganho imediato é conceitual e de testabilidade; a separação em processos vem depois.

## Fluxos de referência

### Prospecção

```text
Panel
  ↓
API: iniciar campanha
  ↓
CampaignRun persistida
  ↓
OutboundJobs persistidos
  ↓
Worker
  ↓
MessagingProvider
  ↓
Meta Cloud API
```

### Resposta do lead

```text
Meta webhook
  ↓
API/ingress
  ↓
Conversation
  ↓
Automation
  ↓
decisão
  ├─ responder via job
  ├─ aguardar
  └─ handoff humano
```

## Dashboard e arquitetura

O vídeo do painel atual mostra que as três áreas existentes são funcionais, porém desacopladas na navegação: Conversas, Leads e Consumo.

A arquitetura-alvo deve permitir que o próximo dashboard trabalhe com conceitos do negócio:

```text
Visão geral
    ↓
Campanhas / Prospecção
    ↓
Conversas / Inbox
    ↓
Resultado / Analytics
```

Por isso os seguintes read models ficam previstos no backend:

- `OperationalOverview`;
- `CampaignSummary`;
- `InboxPriority`.

A UI não deverá calcular sozinha estados compostos.

## Persistência

### Curto prazo

Manter:

- JSON de conversas;
- SQLite operacional;
- projeções/read models existentes.

### Médio prazo

Acrescentar campanha/jobs de forma aditiva no SQLite e introduzir idempotência/outbox.

### Longo prazo

PostgreSQL quando houver necessidade concreta de:

- multiempresa;
- várias instâncias;
- alta disponibilidade;
- concorrência/volume incompatível com o modelo de escritor único.

Não há justificativa atual para Redis, Kafka ou microserviços.

## Regras de evolução

1. Toda capability nova entra em um limite de domínio explícito.
2. Cross-module ocorre por contracts/ports/use cases, não por imports de infraestrutura.
3. Jobs outbound precisam ser recuperáveis e idempotentes.
4. UI depende apenas de contratos HTTP/tipos compartilhados.
5. Mudança de storage/provider não deve alterar conceitos centrais do domínio.
6. OpenSpec continua obrigatório para mudanças materiais.

## Sequência recomendada após esta fase

```text
Fase 9   arquitetura-alvo                    ← concluída nesta branch
Fase 10  OpenSpec do redesign UX/UI
Fase 11  shell + visão geral
Fase 12  leads → campanhas/prospecção
Fase 13  inbox/conversas
Fase 14  analytics/consumo
Fase 15  estados, responsividade e acessibilidade
```

A introdução real de Campaign/Jobs pode ser feita em paralelo ao redesign somente quando uma tela precisar desses contratos; não é necessário bloquear a melhoria visual esperando toda a migração de backend.

# Design — Arquitetura-alvo

## 1. Estado atual preservado

O baseline consolidado funciona hoje como um único runtime Node/Fastify com quatro áreas principais:

```text
WhatsApp Cloud API
        ↓
whatsapp-connectivity
        ↓
conversation-engine
        ↓
management API
        ↓
@wpp/contracts
        ↓
React panel
```

Persistência atual:

- conversa: arquivo JSON por lead como fonte da verdade;
- `conversation_index`: projeção SQL para listagem/contadores;
- `leads`: cadastro operacional + estado de prospecção;
- eventos de consumo LLM/WhatsApp: append-only em SQLite;
- auditoria de ações administrativas: SQLite.

Nada disso é removido nesta fase.

## 2. Arquitetura-alvo

O produto deve evoluir para um **monólito modular com worker**:

```text
                    ┌────────────────┐
                    │  apps/panel    │
                    │ React / Vite   │
                    └───────┬────────┘
                            │ HTTP
                            ▼
                    ┌────────────────┐
                    │    apps/api    │
                    │ Fastify        │
                    └───────┬────────┘
                            │ commands/queries
             ┌──────────────┴──────────────┐
             ▼                             ▼
      packages/domain                packages/database
             │                             │
             │ jobs/outbox                 │
             ▼                             ▼
                    ┌────────────────┐
                    │  apps/worker   │
                    └───────┬────────┘
                  ┌─────────┼─────────┐
                  ▼         ▼         ▼
             messaging      ai   automations
                  │         │
                  ▼         ▼
               Meta      LLM provider
```

A separação `api`/`worker` é **lógica primeiro**. O runtime atual pode continuar único enquanto volume e operação não exigirem dois processos.

## 3. Limites de domínio

### Identity

Responsável futuramente por organização, usuários, memberships e papéis. Não muda a autenticação atual nesta fase.

### Leads

Dono do cadastro, importação, normalização, deduplicação, segmentação e bloqueios de contato. Um lead não deve conhecer detalhes de Meta ou LLM.

### Campaigns

Novo limite de domínio que representa uma iniciativa de prospecção.

Responsabilidades:

- audiência selecionada;
- template/estratégia inicial;
- execução;
- status e progresso;
- relação lead ↔ campanha;
- resultados agregáveis.

### Conversations

Dono de conversa, turnos, intent, qualificação, estado, handoff e ownership operacional.

### Messaging

Porta de envio/recebimento e delivery status. O domínio conhece `MessagingProvider`, não `MetaCloudApiGateway`.

### Automation

Dono do conversation engine, regras, follow-up e decisão automatizada. Decide ações; não deve enviar diretamente ao provedor.

### AI

Porta para geração/classificação/extração. O domínio conhece `LlmProvider`; Anthropic/OpenAI/Gemini são adapters.

### Management / Analytics

Read models e comandos administrativos. Não deve concentrar regra de negócio. Sua responsabilidade é orquestrar e apresentar projeções seguras para API/painel.

## 4. Regras de dependência

Permitido:

```text
panel → contracts
api → application/domain/contracts
worker → application/domain + adapters
application → domain + ports
database → domain ports
messaging adapters → messaging ports
ai adapters → ai ports
domain → nada de infraestrutura
```

Proibido:

- `domain → Fastify`;
- `domain → Meta SDK/API`;
- `domain → Anthropic SDK/API`;
- `panel → implementação do server`;
- `conversation-engine → gateway Meta concreto`;
- componente React contendo regra de negócio que deveria existir no backend.

## 5. Fluxo de prospecção alvo

```text
Lead
  ↓ associado a
Campaign
  ↓
CampaignRun
  ↓ cria
OutboundJob
  ↓ worker
MessagingProvider
  ↓
WhatsApp
  ↓ webhook
Inbound/Delivery Event
  ↓
Conversation
  ↓
Automation / Handoff
```

O clique do painel não deve significar "enviar N mensagens agora". Ele deve significar "iniciar uma execução validada".

## 6. Read models para o futuro dashboard

A UI atual observada no vídeo monta módulos isolados. O redesign precisará de projeções próprias, por exemplo:

### OperationalOverview

- saúde do canal WhatsApp;
- campanhas ativas;
- leads pendentes/em execução/com falha/respondidos;
- conversas aguardando humano;
- inbound pendente;
- erros recentes;
- custo recente.

### CampaignSummary

- total da audiência;
- processados;
- enviados;
- entregues;
- respondidos;
- qualificados;
- handoffs;
- falhas;
- custo.

### InboxPriority

- última atividade;
- estado;
- intent;
- qualificação;
- necessidade de ação;
- ownership humano/bot.

Esses modelos pertencem ao backend. O frontend apenas consulta e apresenta.

## 7. Persistência e evolução

### Agora

Manter SQLite + JSON para não introduzir regressão antes do redesign.

### Próxima evolução funcional

Adicionar, ainda de forma compatível, tabelas para campanha, associação campanha/lead, runs e jobs. Não é necessário migrar conversas imediatamente.

### Escala/comercialização

PostgreSQL se torna recomendado quando houver uma ou mais destas condições:

- múltiplas instâncias do backend;
- múltiplas empresas/tenants;
- necessidade de HA;
- concorrência que torne SQLite/escritor único uma limitação operacional.

Não adotar Redis/Kafka por antecipação. Uma outbox/job queue persistida em SQL é suficiente para a primeira evolução.

## 8. Relação com a UI atual observada

O vídeo mostra uma UI funcional e deliberadamente simples:

- navegação horizontal: Conversas, Leads e Consumo;
- filtros e tabela como estrutura principal;
- detalhe de conversa com resumo, ações e timeline;
- importação de planilha em modal com preview;
- consumo com cards numéricos, recorte de período, agrupamento e gráfico.

O problema de arquitetura de informação não é ausência de funcionalidade; é que as telas refletem diretamente capacidades técnicas. A arquitetura-alvo cria entidades de negócio suficientes para o próximo redesign ser centrado em operação: **Visão geral → Prospecção/Campanhas → Inbox/Conversas → Analytics**.

## 9. Migração sem big bang

1. manter runtime e persistência atuais;
2. consolidar nomes/ports dos módulos internamente;
3. introduzir Campaign como entidade nova sem remover o fluxo existente;
4. criar jobs persistentes para outbound;
5. separar o papel worker quando necessário;
6. mover read models operacionais para queries próprias;
7. migrar persistência para PostgreSQL apenas quando houver motivo de operação/escala.

A UI pode começar a ser redesenhada depois desta Fase 9 porque os conceitos que ela deve representar passam a estar definidos.

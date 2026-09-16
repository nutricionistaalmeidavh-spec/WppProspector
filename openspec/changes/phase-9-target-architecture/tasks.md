# Tasks — Fase 9 Arquitetura-alvo

## Discovery

- [x] Revisar a arquitetura consolidada das Fases 0–8.
- [x] Revisar o modelo atual de persistência de leads e conversas.
- [x] Revisar o OpenSpec existente para UI, management API, prospecção e consumo.
- [x] Assistir ao vídeo de uso atual do painel e registrar o baseline visual/operacional.

## Arquitetura

- [x] Escolher monólito modular como arquitetura principal.
- [x] Definir API e worker como papéis separados sem exigir processos separados agora.
- [x] Definir limites Identity, Leads, Campaigns, Conversations, Messaging, Automation, AI e Management/Analytics.
- [x] Definir regras explícitas de dependência entre domínio, aplicação, adapters, API e painel.
- [x] Definir isolamento dos provedores Meta e LLM atrás de ports.

## Modelo de dados

- [x] Mapear o modelo atual: leads, conversation JSON/index, usage events e audit.
- [x] Definir Campaign como entidade de domínio entre lead e execução de outbound.
- [x] Definir CampaignRun e OutboundJob para execução resiliente.
- [x] Definir read models mínimos para dashboard, campanha e inbox.
- [x] Definir readiness para Organization/User sem exigir RBAC agora.
- [x] Definir caminho SQLite/JSON → SQL mais completo → PostgreSQL sem big bang.

## Documentação

- [x] Criar `docs/architecture-target.md`.
- [x] Criar `docs/data-model-target.md`.
- [x] Criar `docs/current-ui-video-review.md`.
- [x] Atualizar `docs/architecture.md` com a distinção atual/alvo.
- [x] Atualizar `docs/screen-map.md` com observações confirmadas pelo vídeo.
- [x] Registrar a mudança em OpenSpec.

## Limite da fase

- [x] Não alterar CSS, componentes, layout ou navegação.
- [x] Não migrar banco nem alterar comportamento do bot.
- [x] Não criar microserviços nem pacotes vazios apenas para imitar a arquitetura futura.
- [x] Parar antes da change OpenSpec de redesign da UI.

# Proposal — Redesign CRM Management UI

## Why

O painel atual já opera conversas, leads/prospecção e consumo, mas sua arquitetura de informação ainda é a de uma ferramenta administrativa técnica. O produto precisa evoluir para uma experiência de CRM de prospecção, centrada em oportunidades comerciais, sem reimplementar o bot nem misturar responsabilidade de backend com UI.

## Scope

Esta change cobre somente:

- arquitetura de informação do frontend;
- navegação, layout e design system;
- Dashboard/Visão Geral;
- Pipeline/Kanban de oportunidades;
- lista e detalhe de oportunidades;
- Leads, Empresas, Campanhas e Importações;
- Inbox/conversas com contexto CRM;
- Analytics/Consumo;
- estados de loading, vazio, erro, indisponibilidade e capability ausente;
- responsividade desktop/mobile;
- contratos que a UI espera consumir do backend.

Ficam explicitamente fora do escopo:

- regras do bot;
- conversation engine;
- fila/disparo real;
- automações de negócio;
- LLM/provider;
- implementação de endpoints de backend;
- migração de banco;
- autenticação multiusuário/RBAC.

## Product direction

O centro do produto deixa de ser “o bot” e passa a ser a operação comercial:

`Lead → Campanha → Conversa → Oportunidade → Pipeline → Ganho/Perdido`.

A oportunidade é a entidade central do CRM. Conversas, campanhas e leads fornecem contexto e histórico para essa oportunidade.

## UI target

Navegação de referência:

- Visão Geral
- CRM
  - Pipeline
  - Oportunidades
  - Leads
  - Empresas
- Prospecção
  - Campanhas
  - Importações
  - Listas
- Conversas
  - Inbox
  - Aguardando humano
- Analytics
  - Funil
  - Campanhas
  - Conversões
  - Custos
- Configurações

Itens sem suporte de backend em produção SHALL permanecer ocultos, desabilitados com explicação, ou alimentados por adapter/mock somente em ambiente de desenvolvimento. A UI nunca SHALL apresentar uma função quebrada como se estivesse disponível.

## Compatibility

As funções já existentes do painel SHALL ser preservadas:

- login/logout;
- listagem e detalhe de conversas;
- handoff/resume/mensagem manual;
- leads, importação XLSX, filtros, seleção e prospecção;
- consumo e overview;
- validação de contratos;
- capability gating.

## Success criteria

1. O frontend possui mapa completo de telas e fluxos da V1.
2. O design system e comportamento responsivo estão especificados.
3. O que já possui endpoint atual e o que depende de backend futuro está explícito.
4. Nenhuma mudança no bot/backend é feita nesta change.
5. A implementação futura pode começar por shell + telas já suportadas e evoluir progressivamente sem telas mortas.

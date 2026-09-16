# Fase 9 — Arquitetura-alvo do WPP Prospector

## Por que esta mudança existe

As Fases 0–8 consolidaram o produto funcional sem alterar sua experiência visual. O estado atual é estável, porém ainda reflete a ordem histórica em que as funcionalidades nasceram: WhatsApp, conversation engine, gestão, leads/prospecção e consumo convivem no mesmo runtime e o painel expõe diretamente esses módulos técnicos.

O vídeo de uso atual confirma que a interface já cobre os fluxos essenciais — Conversas, detalhe, Leads/importação/prospecção e Consumo — mas ainda não existe uma entidade de negócio que organize a operação como campanha, execução e resultado. Isso limita o futuro dashboard: hoje ele consegue mostrar estados isolados, mas não consegue responder naturalmente "o que está rodando, para quem, com qual resultado e o que exige atenção?".

## Objetivo

Definir a arquitetura-alvo antes do redesign, sem reescrever o produto e sem alterar UI nesta fase.

A arquitetura escolhida é um **monólito modular com processamento assíncrono evolutivo**, mantendo um único repositório e evitando microserviços prematuros.

## Escopo

Esta change:

- define limites de domínio e dependências permitidas;
- define a evolução de `apps/server` para API + worker sem exigir a separação física agora;
- introduz **Campanha** como conceito de domínio entre Lead e Conversa;
- define o modelo de dados alvo e uma migração incremental a partir do SQLite/JSON atuais;
- isola provedores de WhatsApp e LLM atrás de portas/interfaces;
- define quais read models o futuro dashboard precisará;
- registra o design atual observado em vídeo como baseline de experiência.

## Fora de escopo

- qualquer alteração visual, CSS, layout ou navegação;
- criação de uma home/dashboard nesta fase;
- migração imediata de SQLite para PostgreSQL;
- migração imediata das conversas JSON para SQL;
- Redis, Kafka ou microserviços;
- multiusuário/RBAC implementado agora;
- troca de provedor WhatsApp ou LLM.

## Decisões principais

1. **Monólito modular primeiro.** Separação física só quando houver um motivo operacional real.
2. **API e worker são papéis distintos**, mesmo que inicialmente rodem no mesmo processo.
3. **Domínio não conhece Fastify, Meta, Anthropic, React ou banco concreto.**
4. **Campanha passa a ser o eixo da prospecção**, evitando que disparo em lote seja apenas uma ação sobre uma lista de leads.
5. **Persistência migra incrementalmente.** SQLite/JSON continuam válidos no curto prazo; PostgreSQL é destino de escala/comercialização, não pré-requisito para UI.
6. **O dashboard futuro lê read models próprios**, não reconstrói indicadores combinando chamadas e regras no frontend.

## Critério de conclusão da Fase 9

A fase está concluída quando arquitetura-alvo, modelo de dados, regras de dependência, migração e implicações para o dashboard estiverem documentados e versionados, sem alteração de comportamento do produto atual.

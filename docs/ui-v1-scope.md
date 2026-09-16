# UI V1 — Escopo de Implementação

## Objetivo

Entregar uma nova experiência de CRM sem bloquear a interface por dependências futuras de backend.

## V1 implementável imediatamente

### 1. Login
Reutilizar sessão atual e redesenhar apenas apresentação/feedback.

### 2. Novo AppShell
- sidebar desktop;
- drawer mobile;
- navegação agrupada;
- page headers consistentes;
- estados globais de erro/contrato/sessão.

### 3. Visão Geral v1
Usar somente dados já disponíveis:
- overview;
- contagens de conversas;
- leads;
- aguardando humano;
- consumo recente;
- erros/indisponibilidade detectáveis pelo frontend.

### 4. Leads
Preservar:
- filtros;
- paginação;
- seleção;
- prospecção em lote;
- reset.

Melhorar:
- hierarquia;
- legibilidade;
- ações em lote;
- status;
- empty/error/loading.

### 5. Importações
Transformar o modal atual em fluxo orientado:
`arquivo → validação → revisão → confirmação → resultado`.

### 6. Inbox
Reutilizar APIs atuais de conversas e ações.

Desktop:
`lista | conversa | contexto disponível`.

Mobile:
`lista → conversa → contexto`.

### 7. Aguardando humano
Não precisa de entidade nova: começa como filtro/visão da Inbox baseada no estado de conversa já existente.

### 8. Analytics / Custos
Reaproveitar Consumo e Overview, mudando arquitetura da informação e apresentação.

## V1 preparada, mas não publicada como funcional sem backend

- Pipeline;
- Oportunidades;
- Empresas como entidade;
- Campanhas persistidas;
- Funil;
- Conversões;
- valor de oportunidades;
- motivos de perda.

A UI desses módulos pode ser desenvolvida com fixtures/adapters no ambiente de desenvolvimento, desde que permaneça capability-gated em produção.

## Ordem recomendada

1. Design system e AppShell
2. Overview
3. Leads
4. Importações
5. Inbox
6. Analytics/Custos
7. Responsividade/acessibilidade
8. Componentes CRM futuros com adapters
9. Conectar Pipeline/Oportunidades/Campanhas à medida que contratos reais forem entregues

## Critério de conclusão da V1

A V1 está pronta quando todas as funções atuais continuam acessíveis na nova arquitetura, sem regressão funcional, e nenhum módulo sem suporte real é apresentado ao usuário como se estivesse operacional.

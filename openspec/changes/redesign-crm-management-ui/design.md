# Design — CRM Management UI

## 1. Objetivo

Transformar o painel atual em uma interface de CRM de prospecção sem alterar o motor do bot. A UI deve organizar o trabalho em torno de prioridades comerciais, preservar todas as funções atuais e suportar capacidades futuras por contratos explícitos.

## 2. Princípios

1. **Oportunidade é o centro comercial.** Lead, empresa, campanha e conversa são contexto.
2. **Atenção antes de métrica.** A home deve responder o que precisa de ação agora.
3. **Componentes adequados ao conteúdo.** Tabela para dados, Kanban para processo, Inbox para conversa, timeline para histórico, cards somente para síntese.
4. **Progressive enhancement.** O frontend deve funcionar com as APIs atuais e desbloquear telas novas quando o backend expuser as capacidades correspondentes.
5. **Sem telas falsas em produção.** Recurso sem backend não aparece acionável.
6. **Desktop operacional, mobile funcional.** Desktop recebe densidade e contexto; mobile prioriza navegação lista → detalhe.

## 3. Arquitetura de informação

```text
Visão Geral

CRM
├── Pipeline
├── Oportunidades
├── Leads
└── Empresas

Prospecção
├── Campanhas
├── Importações
└── Listas

Conversas
├── Inbox
└── Aguardando humano

Analytics
├── Funil
├── Campanhas
├── Conversões
└── Custos

Configurações
```

### V1 visível com backend atual

- Login
- Visão Geral v1 derivada de `overview`, conversas, leads e consumo
- Leads
- Importações
- Conversas/Inbox
- Aguardando humano como filtro de Inbox
- Custos/Consumo

### V1 preparada, mas dependente de novos contratos

- Pipeline
- Oportunidades
- Detalhe da oportunidade
- Empresas
- Campanhas como entidade persistida
- Funil/Conversões por oportunidade
- Dashboard avançado de campanhas/oportunidades

Esses módulos podem ser implementados com adapters tipados e fixtures no ambiente de desenvolvimento, mas em produção devem respeitar capability gating.

## 4. App Shell

### Desktop

- sidebar fixa, colapsável;
- logotipo/nome do produto no topo;
- navegação agrupada por domínio;
- badge de atenção apenas quando houver contagem relevante;
- área de conteúdo com largura fluida;
- topo local por página para título, contexto e ações principais;
- logout e conta no rodapé da sidebar.

### Mobile

- sidebar vira drawer;
- header compacto com título contextual;
- ações primárias permanecem acessíveis sem depender de hover;
- tabelas viram lista responsiva ou cards densos somente quando necessário;
- Inbox usa navegação `lista → conversa → contexto`, nunca três painéis simultâneos.

## 5. Visão Geral

A home deverá priorizar exceções e progresso.

Ordem recomendada:

1. status operacional do bot/backend;
2. bloco “Precisa de atenção”;
3. resumo do pipeline;
4. campanhas em andamento;
5. oportunidades prioritárias;
6. conversas aguardando humano;
7. falhas recentes;
8. consumo/custo recente.

Exemplos de atenção:

- conversas aguardando humano;
- falhas de prospecção;
- oportunidades sem próxima ação;
- propostas sem retorno;
- campanhas paradas ou com erro.

A versão inicial pode calcular somente itens suportados pela API atual. Itens de oportunidade/campanha ficam condicionados às capabilities correspondentes.

## 6. Pipeline

O Kanban representa **Oportunidades**, não Leads.

Etapas padrão:

`Novo → Contatado → Respondeu → Qualificado → Reunião/Demonstração → Proposta → Negociação → Ganho / Perdido`.

### Card mínimo

- empresa/lead;
- produto/oportunidade;
- valor estimado, quando houver;
- responsável, quando houver;
- próxima ação/data;
- origem/campanha;
- indicador de conversa aguardando humano.

### Interações

- clicar abre detalhe;
- drag-and-drop pode mover etapa no desktop;
- menu/ação explícita de “Mover etapa” é obrigatório para mobile e acessibilidade;
- Ganho/Perdido exige confirmação e campos adicionais quando aplicável;
- movimentação otimista só ocorre quando o contrato de backend garantir idempotência/resultado confiável.

## 7. Oportunidade

Tela de contexto central.

### Cabeçalho

- empresa/lead;
- nome da oportunidade;
- etapa;
- valor;
- responsável;
- próxima ação.

### Tabs

- Resumo
- Conversa
- Atividades
- Dados

### Painel lateral desktop

- etapa;
- qualificação;
- valor;
- responsável;
- origem;
- campanha;
- próxima ação;
- data prevista;
- motivo de perda, quando aplicável.

### Timeline

Eventos comerciais e operacionais relevantes:

- lead importado;
- campanha iniciada;
- template enviado;
- resposta recebida;
- qualificação;
- handoff;
- mudança de etapa;
- reunião/proposta;
- ganho/perda.

## 8. Inbox

Substitui a percepção de “tabela de conversas” por operação de atendimento.

### Desktop

```text
lista de conversas | conversa ativa | contexto CRM
```

Filtros:

- todas;
- não lidas/pendentes quando suportado;
- aguardando humano;
- bot ativo;
- qualificadas;
- com oportunidade;
- sem resposta.

O painel de contexto mostra dados disponíveis do lead e, quando existir, oportunidade/campanha. Sem endpoint específico, a UI não deve inventar dados.

### Ações preservadas

- handoff;
- resume;
- mensagem manual;
- abrir lead;
- abrir oportunidade quando capability existir.

Toda ação deve ter estado `idle → pending → success/error` e feedback persistente o suficiente para o operador compreender o resultado.

## 9. Leads e Importações

A funcionalidade existente deve ser preservada e reorganizada.

### Leads

- busca/filtros;
- seleção em lote;
- estado de prospecção;
- empresa, segmento e cidade;
- origem;
- primeiro contato;
- vínculo com conversa/oportunidade quando disponível.

### Importação

Fluxo em etapas:

`Selecionar arquivo → validar → revisar rejeitados/duplicados → confirmar → resultado`.

O parser local XLSX atual deve ser reaproveitado. A nova UI apenas melhora clareza e progressão.

## 10. Campanhas

Campanha, quando suportada pelo backend, é entidade persistida e não apenas “seleção de leads”.

Tela:

- status;
- público;
- progresso;
- enviados;
- respostas;
- qualificados;
- oportunidades;
- ganhos;
- falhas.

Tabs:

- Visão geral
- Público
- Execução
- Conversas
- Oportunidades
- Performance
- Falhas

Até existir backend, não deve haver campanha persistente fictícia em produção.

## 11. Analytics

### Custos

Evolução da tela atual de Consumo. Preservar períodos, agrupamentos e custo LLM/WhatsApp.

### Funil e Conversões

Dependem das entidades Oportunidade/Pipeline. Devem mostrar:

- volume por etapa;
- taxa entre etapas;
- tempo médio por etapa;
- ganhos/perdas;
- motivo de perda;
- conversão por campanha;
- valor potencial/ganho quando existir.

## 12. Design system

### Direção

- base neutra e limpa;
- maior hierarquia que a UI atual;
- densidade de produto B2B, sem excesso de espaços vazios;
- cor de marca usada para navegação/ação, não como preenchimento indiscriminado;
- status com semântica consistente;
- superfícies elevadas apenas quando necessário.

### Componentes base

- Button
- IconButton
- Input/SearchInput
- Select/Combobox
- DateRange
- Badge/StatusBadge
- Card/SummaryCard
- Table/DataGrid
- Tabs
- Drawer/Sheet
- Dialog
- DropdownMenu
- Tooltip
- Toast/InlineAlert
- Skeleton
- EmptyState
- ErrorState
- Timeline
- KanbanColumn/KanbanCard
- ConversationList/MessageBubble/Composer
- Metric/ChartContainer

### Estados obrigatórios

Todo componente de dados deve definir:

- loading;
- empty;
- error recuperável;
- forbidden/indisponível;
- stale/retrying quando aplicável;
- success feedback para mutações.

## 13. Contratos frontend ↔ backend

### Já disponíveis

A API atual expõe sessão, conversas, ações de conversa, leads/importação/prospecção, capabilities e consumo/overview. Essas capacidades sustentam o primeiro corte visual sem backend novo.

### Contratos novos esperados

A UI futura espera, sem implementar nesta change:

- `OperationalOverview`;
- `Opportunity` / `OpportunityListPage`;
- `Pipeline` / `PipelineStage`;
- `Company` / `CompanyListPage`;
- `Campaign` / `CampaignSummary`;
- `InboxPriority` ou campos equivalentes no contrato de conversa;
- métricas de funil/conversão.

A definição exata de endpoints é responsabilidade do backend. A UI especifica apenas o shape funcional necessário e deve consumir `@wpp/contracts` quando esses contratos forem entregues.

## 14. Capability gating

A UI deve diferenciar:

- `supported`: mostrar e habilitar;
- `unsupported`: ocultar ou mostrar indisponível;
- `degraded`: mostrar a tela com subconjunto funcional;
- `backend_error`: mostrar erro de serviço, nunca tratar como capability ausente;
- `unauthorized`: redirecionar para login.

Esse modelo corrige a ambiguidade atual entre endpoint ausente e erro operacional.

## 15. Rotas alvo

```text
/login
/overview
/crm/pipeline
/crm/opportunities
/crm/opportunities/:id
/crm/leads
/crm/companies
/prospecting/campaigns
/prospecting/campaigns/:id
/prospecting/imports
/conversations/inbox
/conversations/:leadPhone
/analytics/funnel
/analytics/campaigns
/analytics/conversions
/analytics/costs
/settings
```

Rotas não suportadas por capability em produção não devem ser links acionáveis.

## 16. Migração da UI atual

### Reaproveitar

- sessão/auth;
- API client;
- React Query;
- Zod/contract validation;
- ContractMismatchBanner;
- parser XLSX;
- hooks e mutações existentes quando os contratos permanecerem iguais.

### Adaptar

- Leads;
- ImportDialog;
- Consumption;
- Conversation actions;
- filtros e tabelas.

### Substituir

- AppShell;
- navegação horizontal atual;
- tabela de Conversas como experiência principal.

### Criar

- Overview;
- CRM shell/sidebar;
- Pipeline;
- Opportunity detail;
- Inbox de 2/3 painéis;
- Campaign UI;
- Analytics de funil/conversão;
- componentes de estado e feedback padronizados.

## 17. Ordem de implementação recomendada

1. tokens/design system + novo AppShell;
2. rotas e navegação com capability gating;
3. Overview v1 com APIs existentes;
4. Leads + Importação redesenhados;
5. Inbox usando contratos atuais;
6. Custos/Consumo redesenhado;
7. adapters/interfaces para capacidades CRM futuras;
8. Pipeline/Oportunidades/Campanhas apenas quando contratos reais ou mocks de desenvolvimento estiverem disponíveis;
9. acessibilidade, responsividade e polish final.

## 18. Testes

- testes unitários de componentes de estado;
- testes de rotas/capabilities;
- testes de auth 401 vs erro de backend;
- testes de fluxos de Leads/Importação;
- testes de ações da Inbox;
- testes responsivos críticos por estrutura/comportamento;
- contract tests para cada adapter;
- smoke test de build integrado ao CI existente.

## 19. Não objetivos

Esta change não implementa:

- bot;
- regras de automação;
- agendamento real;
- workers;
- novas migrations;
- PostgreSQL;
- endpoints CRM;
- RBAC;
- billing.

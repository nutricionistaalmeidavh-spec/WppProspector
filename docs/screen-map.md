# Mapa das Telas Atuais — antes do redesign

Este mapa descreve o painel efetivamente implementado no baseline consolidado, confirmado também pelo vídeo de uso enviado em 2026-09-04. Não representa as telas desejadas para o redesign.

O React Router usa `basename: /admin`. As rotas abaixo são relativas a esse prefixo.

| Tela | Rota | Objetivo | APIs/ações principais |
| --- | --- | --- | --- |
| Login | `/login` | Criar sessão administrativa | `POST /admin/api/session`; validação inicial via overview |
| Conversas | `/conversations` | Listar, filtrar e abrir conversas | `GET /admin/api/conversations` |
| Detalhe da conversa | `/conversations/:leadPhone` | Ler contexto/timeline e agir manualmente | detalhe; handoff; resume; mensagem manual |
| Leads | `/leads` | Importar, filtrar, selecionar e prospectar leads | listagem; importação; disparo em lote; reset |
| Consumo | `/consumption` | Visualizar métricas/custos por período | consumption; overview |
| Não encontrada | `*` | Fallback de navegação protegida | nenhuma |

A rota protegida inicial redireciona para `/conversations`.

## Navegação atual

O `AppShell` expõe três áreas de primeira classe:

- **Conversas** → `/conversations`;
- **Leads** → `/leads`;
- **Consumo** → `/consumption`.

Também oferece logout. Não existe uma home/dashboard executivo independente; após autenticação o usuário entra diretamente em Conversas.

### Baseline visual confirmado pelo vídeo

- header horizontal simples com `Gestão do Bot` à esquerda e `Sair` à direita;
- fundo branco e conteúdo centralizado;
- tipografia e controles compactos;
- bordas cinza discretas;
- tabelas como principal superfície operacional;
- praticamente nenhuma codificação visual forte de prioridade/urgência.

Esse baseline está detalhado em `docs/current-ui-video-review.md`.

## Conversas

### Listagem

API: `GET /admin/api/conversations`.

Filtros/consulta suportados pelo client atual incluem estado, intenção do lead, telefone, faixa de atividade, paginação e cursor.

O vídeo confirma a tabela com colunas de telefone, estado, intent, qualificação, turnos, última atividade e inbound.

### Detalhe

API: `GET /admin/api/conversations/:leadPhone`.

Conforme disponibilidade e estado da conversa, o operador pode:

- fazer handoff para humano: `POST /admin/api/conversations/:leadPhone/handoff`;
- devolver a conversa ao bot: `POST /admin/api/conversations/:leadPhone/resume`;
- enviar mensagem manual: `POST /admin/api/conversations/:leadPhone/messages`;
- consultar estado, intenção, qualificação, plano cotado, módulos e histórico de turnos.

O vídeo confirma a composição atual em **resumo + ações + timeline**.

## Leads / Prospecção

A prospecção já está implementada no painel do baseline correto.

A tela permite:

- filtrar por estado, telefone e segmento;
- importar planilha;
- exibir loading, erro recuperável e estado vazio;
- selecionar leads elegíveis individualmente ou em lote;
- disparar mensagem de abertura em lote quando a capability `prospecting` está disponível;
- resetar a prospecção de um lead mantendo conversa e histórico;
- paginação incremental da lista.

APIs usadas:

- `GET /admin/api/leads`;
- `POST /admin/api/leads/import`;
- `POST /admin/api/leads/prospect`;
- `POST /admin/api/leads/:leadPhone/reset`;
- `GET /admin/api/capabilities` para disponibilidade das ações.

O vídeo confirma o fluxo de importação completo: **abrir modal → escolher `.xlsx` → preview → importar → confirmação**.

### Gap estrutural identificado na Fase 9

O fluxo atual modela prospecção essencialmente como uma ação sobre uma lista de leads. A arquitetura-alvo introduz **Campanha → CampaignRun → OutboundJob** para que o redesign consiga representar progresso, falhas, resultados e histórico de cada iniciativa sem remover a tela de Leads existente.

## Consumo

APIs:

- `GET /admin/api/stats/consumption`;
- `GET /admin/api/stats/overview`.

O vídeo confirma cards de estado atual, seleção de período, agrupamento, gráfico de custo estimado e resumo tabular. A tela já possui leitura por período, mas ainda é uma superfície técnica de analytics e não uma visão gerencial completa.

## Sessão e compatibilidade

- Login: `POST /admin/api/session`.
- Logout: `DELETE /admin/api/session`.
- A sessão é mantida por cookie e o client usa `credentials: include`.
- `GET /admin/api/capabilities` informa disponibilidade de ações de conversa e prospecção.
- Existe `ContractMismatchBanner` para divergências de contrato detectadas no client.

## Gap de experiência antes do redesign

O principal gap não é falta das telas básicas. O produto já cobre os fluxos centrais. O gap é **arquitetura de informação e priorização operacional**:

1. não existe visão inicial de saúde e prioridades;
2. Conversas não funciona ainda como inbox priorizada;
3. Leads não organiza a operação por campanha;
4. Consumo aparece separado do contexto de resultado;
5. estados e ações importantes têm pouco contraste/hierarquia;
6. o menu reflete módulos técnicos, não o ciclo comercial completo.

A Fase 9 resolve a base conceitual para isso sem alterar UI.

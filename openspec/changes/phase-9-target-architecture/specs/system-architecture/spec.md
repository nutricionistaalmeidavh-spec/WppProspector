# system-architecture Specification Delta

## ADDED Requirements

### Requirement: Monólito modular como unidade de produto

O sistema SHALL permanecer em um único repositório e SHALL organizar suas capacidades em módulos de domínio com dependências explícitas. A existência de módulos separados NÃO SHALL implicar microserviços ou deploys independentes enquanto não houver necessidade operacional comprovada.

#### Scenario: Nova capability de negócio

- **WHEN** uma nova capability for adicionada
- **THEN** ela SHALL pertencer a um limite de domínio explícito e SHALL reutilizar ports/contracts para atravessar limites, em vez de importar diretamente adapters de infraestrutura de outro módulo

### Requirement: Separação lógica entre API e processamento assíncrono

O sistema SHALL tratar requisições HTTP administrativas e execução de jobs de outbound/automação como papéis distintos. Esses papéis MAY rodar no mesmo processo inicialmente, mas SHALL possuir fronteira suficiente para serem separados em `api` e `worker` sem reescrever as regras de negócio.

#### Scenario: Início de uma prospecção em lote

- **WHEN** o operador inicia uma execução de prospecção
- **THEN** a API SHALL validar e persistir a intenção de execução e o processamento de cada envio SHALL ser modelado como trabalho recuperável, não como uma sequência dependente da conexão HTTP do painel

### Requirement: Domínio independente de provedores externos

Regras de negócio SHALL depender de ports para mensageria e IA. Implementações concretas de Meta Cloud API e de provedores LLM SHALL ficar na infraestrutura/adapters.

#### Scenario: Troca de provedor

- **WHEN** um adapter alternativo de mensageria ou LLM for introduzido
- **THEN** as entidades e regras centrais de Leads, Campaigns e Conversations SHALL continuar válidas sem importar SDK/API do provedor

### Requirement: Campanha como eixo da prospecção

O sistema SHALL representar uma campanha de prospecção como entidade distinta do lead e da conversa. A campanha SHALL possuir audiência, estado e execuções observáveis; a relação de um lead com uma campanha SHALL ser persistível independentemente do estado global do lead.

#### Scenario: Mesmo lead em iniciativas diferentes

- **WHEN** um lead elegível participar de campanhas diferentes ao longo do tempo
- **THEN** o histórico e resultado de cada participação SHALL permanecer atribuídos à campanha correspondente sem sobrescrever o histórico das demais

### Requirement: Execução resiliente de campanha

Uma execução de campanha SHALL poder ser representada por `CampaignRun` e unidades persistentes de trabalho outbound. Reinício de processo SHALL NOT exigir que o usuário reinicie manualmente toda a campanha nem SHALL duplicar envios já confirmados.

#### Scenario: Reinício durante lote

- **WHEN** o processo reinicia após parte de uma campanha ter sido processada
- **THEN** o sistema SHALL conseguir distinguir trabalhos concluídos, pendentes e falhos antes de continuar a execução

### Requirement: Read models pertencem ao backend

Indicadores compostos do dashboard, resumos de campanha e prioridade de inbox SHALL ser produzidos pelo backend como queries/read models. O painel SHALL NOT reconstruir regras de negócio juntando respostas técnicas desconectadas.

#### Scenario: Visão operacional

- **WHEN** o painel solicitar a visão geral operacional
- **THEN** a resposta SHALL fornecer um modelo coerente de saúde, campanhas, leads, conversas que exigem ação, exceções e consumo sem exigir que o frontend derive esses estados a partir de múltiplas regras locais

### Requirement: Migração de persistência incremental

A arquitetura SHALL permitir manter JSON + SQLite enquanto forem adequados e SHALL prever PostgreSQL como evolução quando houver necessidade de múltiplas instâncias, HA ou multiempresa. A migração SHALL ser incremental e NÃO SHALL ser pré-requisito para o redesign da interface.

#### Scenario: Redesign antes da migração de banco

- **WHEN** a nova UI for implementada ainda sobre o armazenamento atual
- **THEN** ela SHALL consumir contratos/read models estáveis, de modo que uma futura troca de persistência não exija reescrever a interface

### Requirement: Readiness para escopo organizacional

Entidades de negócio novas que representem campanhas, canais e ownership SHALL ser desenhadas de forma compatível com futuro escopo por organização. A autenticação atual de usuário único MAY continuar até uma change específica de identity/RBAC.

#### Scenario: Evolução para múltiplas empresas

- **WHEN** identity/multiempresa for adicionada no futuro
- **THEN** o modelo de campanhas, leads e canais SHALL poder receber escopo organizacional sem redefinir os conceitos centrais da prospecção

# management-web-ui — CRM Redesign Delta

## Requirement: Navegação orientada ao trabalho comercial

A interface SHALL substituir a navegação horizontal técnica por um AppShell com áreas de Visão Geral, CRM, Prospecção, Conversas, Analytics e Configurações. Itens cuja capability não esteja disponível no backend SHALL permanecer ocultos ou explicitamente indisponíveis e nunca SHALL ser acionáveis como rotas quebradas.

### Scenario: capability disponível
- **WHEN** uma capability de CRM está disponível
- **THEN** a área correspondente aparece na navegação e pode ser acessada normalmente.

### Scenario: capability ausente
- **WHEN** uma capability não está disponível
- **THEN** a UI não oferece um link acionável que leve a erro 404/501.

## Requirement: Visão Geral operacional

A interface SHALL oferecer `/overview` como rota inicial autenticada. A tela SHALL priorizar saúde operacional, itens que precisam de atenção, andamento de prospecção/conversas e consumo. Métricas de Pipeline/Campanhas/Oportunidades SHALL aparecer somente quando seus contratos existirem.

### Scenario: somente APIs atuais
- **WHEN** o backend expõe apenas overview, conversas, leads e consumo
- **THEN** a tela monta uma Visão Geral funcional apenas com esses dados, sem placeholders enganosos.

### Scenario: contratos CRM disponíveis
- **WHEN** o backend expõe os read models CRM
- **THEN** a tela incorpora pipeline, campanhas e oportunidades prioritárias sem mudar sua arquitetura principal.

## Requirement: Pipeline centrado em oportunidades

A interface SHALL representar o pipeline como Kanban de Oportunidades, não de Leads ou Conversas. As etapas padrão SHALL ser: Novo, Contatado, Respondeu, Qualificado, Reunião/Demonstração, Proposta, Negociação, Ganho e Perdido.

### Scenario: mover oportunidade
- **WHEN** o usuário move uma oportunidade para outra etapa
- **THEN** a UI solicita a mutação correspondente e reflete o resultado confirmado pelo backend.

### Scenario: mobile ou acessibilidade
- **WHEN** drag-and-drop não for apropriado
- **THEN** a mesma mudança de etapa é possível por uma ação explícita de “Mover etapa”.

## Requirement: Detalhe de oportunidade como centro de contexto

A interface SHALL oferecer uma tela de oportunidade com resumo comercial, etapa, valor, responsável, origem, campanha, próxima ação e histórico, além de acesso contextual à conversa do lead quando disponível.

### Scenario: oportunidade existente
- **WHEN** o usuário abre uma oportunidade
- **THEN** a UI exibe cabeçalho, tabs Resumo/Conversa/Atividades/Dados e timeline dos eventos conhecidos.

## Requirement: Inbox operacional

A interface SHALL evoluir Conversas para uma Inbox. No desktop SHALL permitir lista de conversas, conversa ativa e contexto CRM simultaneamente quando houver largura suficiente. No mobile SHALL usar fluxo lista → conversa → contexto.

### Scenario: aguardando humano
- **WHEN** uma conversa requer intervenção humana
- **THEN** ela é identificável e filtrável sem que o operador precise abrir cada item.

### Scenario: ação manual
- **WHEN** o operador executa handoff, resume ou mensagem manual
- **THEN** a UI exibe pending, sucesso ou erro e mantém o restante da tela utilizável.

## Requirement: Leads e importação preservam funcionalidade atual

A interface SHALL preservar filtros, seleção, prospecção em lote, reset e importação XLSX atuais, reorganizando apenas a experiência.

### Scenario: importar planilha
- **WHEN** o operador seleciona um XLSX
- **THEN** a UI conduz o fluxo Selecionar → Validar → Revisar → Confirmar → Resultado, reaproveitando o parser existente.

## Requirement: Campanhas como entidade condicionada a backend

A interface SHALL tratar Campanha como entidade persistida somente quando o backend expuser contratos reais de campanha. A UI de produção NÃO SHALL sintetizar campanhas fictícias a partir de seleções temporárias de leads.

### Scenario: backend sem Campaign
- **WHEN** não existe capability/contrato de Campaign
- **THEN** a navegação de Campanhas fica oculta ou indisponível e a prospecção existente continua operável via Leads.

### Scenario: backend com Campaign
- **WHEN** Campaign estiver disponível
- **THEN** a UI oferece lista, detalhe e indicadores de execução, respostas, qualificação, oportunidades e falhas.

## Requirement: Analytics separa custo de funil comercial

A interface SHALL mover a experiência de Consumo para Analytics/Custos e SHALL reservar Funil/Conversões para métricas baseadas em Oportunidades.

### Scenario: consumo atual
- **WHEN** o usuário acessa Analytics/Custos
- **THEN** períodos, agrupamentos, tokens e custos atuais permanecem disponíveis.

### Scenario: funil sem backend
- **WHEN** não existe contrato de Pipeline/Oportunidade
- **THEN** Funil e Conversões não aparecem como telas funcionais em produção.

## Requirement: Diferenciar capability ausente de erro de serviço

A interface SHALL tratar separadamente `unsupported`, `degraded`, `backend_error` e `unauthorized`.

### Scenario: 401
- **WHEN** qualquer chamada protegida retorna 401
- **THEN** a sessão é tratada como expirada e a UI volta ao login.

### Scenario: 5xx ou falha de rede
- **WHEN** o backend falha
- **THEN** a UI mostra indisponibilidade/erro recuperável e NÃO interpreta isso como feature ausente.

### Scenario: capability explicitamente ausente
- **WHEN** o servidor informa capability não suportada
- **THEN** a UI oculta/desabilita apenas a feature correspondente.

## Requirement: Responsividade funcional

A interface SHALL ser excelente no desktop e totalmente utilizável no mobile. Nenhuma função crítica SHALL depender de hover, drag-and-drop exclusivo ou três colunas simultâneas.

### Scenario: Inbox mobile
- **WHEN** a largura não comporta três painéis
- **THEN** a UI apresenta navegação sequencial lista → conversa → contexto.

### Scenario: Pipeline mobile
- **WHEN** o Kanban é acessado no mobile
- **THEN** a movimentação de etapa permanece disponível por controle explícito.

## Requirement: Estados consistentes

Toda superfície remota SHALL definir loading, empty, error recuperável, indisponível, success e retry quando aplicável.

### Scenario: lista vazia
- **WHEN** uma consulta retorna zero itens com sucesso
- **THEN** a UI mostra EmptyState com próxima ação pertinente, não uma mensagem genérica de erro.

## Requirement: Compatibilidade com contratos tipados

A interface SHALL continuar validando respostas via contratos Zod compartilhados e SHALL consumir novos contratos CRM somente após serem adicionados a `@wpp/contracts`.

### Scenario: contrato divergente
- **WHEN** uma resposta não valida contra o contrato esperado
- **THEN** a UI exibe incompatibilidade e evita renderizar dados incorretos como válidos.

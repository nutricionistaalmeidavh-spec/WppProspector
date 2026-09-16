# Tasks — CRM Management UI

## 0. Guardrails

- [ ] Não alterar bot, conversation engine, gateways, jobs ou regras de prospecção.
- [ ] Não criar migrations ou endpoints nesta change.
- [ ] Preservar todas as capacidades atuais de login, Leads, Conversas e Consumo.
- [ ] Toda tela futura sem backend real deve usar capability gating em produção.

## 1. Fundação visual

- [ ] Definir tokens de cor, tipografia, espaçamento, radius, shadow e densidade.
- [ ] Criar novo AppShell com sidebar desktop e drawer mobile.
- [ ] Padronizar page header, section header e action bar.
- [ ] Padronizar EmptyState, ErrorState, Skeleton, InlineAlert e Toast.
- [ ] Garantir foco visível, labels, keyboard navigation e contraste.

## 2. Rotas e capabilities

- [ ] Introduzir `/overview` como rota inicial autenticada.
- [ ] Organizar rotas em CRM, Prospecção, Conversas, Analytics e Configurações.
- [ ] Criar modelo de capability `supported | unsupported | degraded | backend_error`.
- [ ] Diferenciar 401 de erro de rede/5xx.
- [ ] Testar que rotas sem capability não ficam acionáveis.

## 3. Visão Geral

- [ ] Criar Overview v1 usando somente APIs atuais.
- [ ] Exibir saúde/estado disponível, leads, conversas que exigem atenção e consumo recente.
- [ ] Criar slots/adapters para Pipeline, Campanhas e Oportunidades sem dados fictícios em produção.
- [ ] Definir estados loading/empty/error/degraded.

## 4. Leads e Importações

- [ ] Migrar Leads para o novo shell sem regressão funcional.
- [ ] Preservar filtros, paginação, seleção, bulk prospect e reset.
- [ ] Reestruturar Importação em fluxo Selecionar → Validar → Revisar → Confirmar → Resultado.
- [ ] Reaproveitar parser XLSX e testes existentes.
- [ ] Melhorar feedback de rejeitados, duplicados e importados.

## 5. Inbox

- [ ] Transformar listagem/detalhe de Conversas na experiência Inbox.
- [ ] Desktop: lista + conversa + contexto quando houver largura.
- [ ] Mobile: lista → conversa → contexto.
- [ ] Preservar handoff, resume e mensagem manual.
- [ ] Adicionar feedback pending/success/error para todas as mutações.
- [ ] Tratar “aguardando humano” como filtro/visão de primeira classe.

## 6. Analytics / Custos

- [ ] Mover semanticamente Consumo para Analytics/Custos.
- [ ] Preservar períodos e agrupamentos atuais.
- [ ] Reorganizar métricas para leitura gerencial.
- [ ] Manter sinalização de custo parcial/indisponibilidade.

## 7. Adapters CRM futuros

- [ ] Definir interfaces frontend para `OperationalOverview`.
- [ ] Definir interfaces frontend para Opportunity/Pipeline.
- [ ] Definir interfaces frontend para Company.
- [ ] Definir interfaces frontend para Campaign.
- [ ] Definir interfaces frontend para InboxPriority.
- [ ] Usar fixtures apenas em Storybook/test/dev; nunca como dados produtivos.
- [ ] Migrar adapters para `@wpp/contracts` assim que backend entregar os contratos reais.

## 8. Pipeline e Oportunidades

Bloqueado para produção até backend correspondente existir.

- [ ] Implementar Kanban de oportunidades.
- [ ] Implementar alternativa acessível a drag-and-drop.
- [ ] Implementar lista de oportunidades.
- [ ] Implementar detalhe com Resumo/Conversa/Atividades/Dados.
- [ ] Implementar confirmações de Ganho/Perdido.
- [ ] Vincular conversa/campanha/empresa conforme contratos reais.

## 9. Campanhas

Bloqueado para produção até entidade Campaign existir no backend.

- [ ] Implementar lista de campanhas.
- [ ] Implementar detalhe com Visão geral/Público/Execução/Conversas/Oportunidades/Performance/Falhas.
- [ ] Implementar estados de execução e falhas conforme contrato real.

## 10. Analytics CRM

Bloqueado para produção até Pipeline/Oportunidade existirem.

- [ ] Implementar Funil.
- [ ] Implementar Conversões.
- [ ] Implementar métricas de campanha ligadas a oportunidades.
- [ ] Implementar ganho/perda e motivos de perda quando disponíveis.

## 11. Responsividade e acessibilidade

- [ ] Testar 320px, 375px, 768px, 1024px e desktop amplo.
- [ ] Garantir nenhuma ação crítica dependente de hover.
- [ ] Garantir nenhuma ação crítica dependente exclusivamente de DnD.
- [ ] Garantir navegação por teclado no shell, tabelas, dialogs e Inbox.
- [ ] Testar redução de movimento quando houver animações.

## 12. Validação

- [ ] Manter lint e typecheck verdes.
- [ ] Manter testes atuais verdes.
- [ ] Adicionar testes de capability gating.
- [ ] Adicionar testes de auth vs backend error.
- [ ] Adicionar testes de Overview.
- [ ] Adicionar testes do fluxo de importação redesenhado.
- [ ] Adicionar testes da Inbox e ações.
- [ ] Rodar build do monorepo no CI.
- [ ] Comparar funcionalidades atuais antes/depois e registrar regressões zero.

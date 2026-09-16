# Mapa de Telas Alvo — CRM UI

## Login

**Rota:** `/login`

Estados: checking, anonymous, invalid-secret, backend-error, authenticated.

## Visão Geral

**Rota:** `/overview`

Blocos:
- saúde/estado operacional disponível;
- precisa de atenção;
- leads/prospecção;
- conversas aguardando humano;
- consumo recente;
- slots condicionais de campanhas/oportunidades/pipeline.

## CRM / Pipeline

**Rota:** `/crm/pipeline`

Entidade: Opportunity.

Estados: loading, empty, unsupported, backend-error.

## CRM / Oportunidades

**Rota:** `/crm/opportunities`

Lista/pesquisa/filtros. Não publicar como funcional até existir contrato real.

## CRM / Oportunidade

**Rota:** `/crm/opportunities/:id`

Tabs: Resumo, Conversa, Atividades, Dados.

## CRM / Leads

**Rota:** `/crm/leads`

Evolução da tela atual `/leads`, preservando filtros, seleção, prospecção e reset.

## CRM / Empresas

**Rota:** `/crm/companies`

Dependente de entidade Company real; o campo textual `lead.company` não deve ser apresentado como cadastro completo de empresa.

## Prospecção / Campanhas

**Rota:** `/prospecting/campaigns`

Dependente de Campaign persistida.

## Prospecção / Campanha

**Rota:** `/prospecting/campaigns/:id`

Tabs: Visão geral, Público, Execução, Conversas, Oportunidades, Performance, Falhas.

## Prospecção / Importações

**Rota:** `/prospecting/imports`

Fluxo: Selecionar arquivo → Validar → Revisar → Confirmar → Resultado.

## Conversas / Inbox

**Rota:** `/conversations/inbox`

Desktop: lista | conversa | contexto CRM.
Mobile: lista → conversa → contexto.

## Conversa

**Rota:** `/conversations/:leadPhone`

Pode permanecer como deep-link compatível para abrir uma conversa específica dentro da experiência Inbox.

## Conversas / Aguardando humano

Não precisa de rota técnica separada obrigatória. Pode ser `/conversations/inbox?view=awaiting-human` ou rota alias, mantendo uma única experiência de Inbox.

## Analytics / Funil

**Rota:** `/analytics/funnel`

Dependente de Opportunity/Pipeline.

## Analytics / Campanhas

**Rota:** `/analytics/campaigns`

Dependente de Campaign.

## Analytics / Conversões

**Rota:** `/analytics/conversions`

Dependente de Opportunity e eventos de ganho/perda.

## Analytics / Custos

**Rota:** `/analytics/costs`

Evolução da tela atual `/consumption`; já suportada pelo backend atual.

## Configurações

**Rota:** `/settings`

Na primeira versão pode concentrar apenas configurações que realmente possuam suporte. Não criar formulários sem persistência.

## Compatibilidade de rotas antigas

Durante a migração:
- `/conversations` → `/conversations/inbox`;
- `/leads` → `/crm/leads`;
- `/consumption` → `/analytics/costs`.

Redirecionamentos devem preservar bookmarks e deep-links existentes.

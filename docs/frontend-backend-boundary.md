# Fronteira Frontend ↔ Backend

## Resumo

O backend atual **não está faltando para o painel existente**. Ele já suporta sessão, conversas, ações manuais, leads, importação/prospecção, capabilities e consumo/overview.

O que ainda não existe no backend são algumas **novas capacidades de CRM que foram introduzidas pelo redesign de produto**, e não pelo sistema original.

## Já existe hoje

### Sessão
- `POST /admin/api/session`
- `DELETE /admin/api/session`

### Conversas
- `GET /admin/api/conversations`
- `GET /admin/api/conversations/:leadPhone`
- `POST /admin/api/conversations/:leadPhone/handoff`
- `POST /admin/api/conversations/:leadPhone/resume`
- `POST /admin/api/conversations/:leadPhone/messages`

### Leads / Prospecção
- `GET /admin/api/leads`
- `POST /admin/api/leads`
- `POST /admin/api/leads/import`
- `POST /admin/api/leads/prospect`
- `POST /admin/api/leads/:leadPhone/prospect`
- `POST /admin/api/leads/:leadPhone/reset`

### Estado / Consumo
- `GET /admin/api/stats/overview`
- `GET /admin/api/stats/consumption`
- `GET /admin/api/capabilities`

Com isso, já é possível redesenhar completamente:

- Login;
- Visão Geral v1;
- Leads;
- Importações;
- Inbox/Conversas;
- Aguardando humano;
- Analytics/Custos.

## O que é novo no CRM e ainda exige backend

### Oportunidades
O sistema atual conhece Lead e Conversa, mas não possui uma entidade comercial persistida `Opportunity` com:

- id próprio;
- etapa do pipeline;
- valor;
- responsável;
- próxima ação;
- status ganho/perdido;
- motivo de perda;
- histórico de movimentações.

Sem essa entidade, um Kanban real de vendas seria apenas uma representação visual sem fonte da verdade.

### Pipeline
O backend atual não persiste `Pipeline` e `PipelineStage` como entidades comerciais. Portanto, não existe hoje uma API oficial para mover uma oportunidade de `Qualificado` para `Proposta`, por exemplo.

### Empresas
O Lead atual possui um campo `company`, mas isso é texto associado ao lead. Não existe ainda uma entidade `Company` com id, múltiplos contatos, dados próprios e histórico.

### Campanhas
Hoje existe prospecção em lote de leads, mas isso não equivale a uma entidade `Campaign` persistida com:

- id;
- nome;
- status;
- público;
- execução;
- enviados;
- respostas;
- falhas;
- oportunidades geradas;
- conversão.

Por isso a UI nova não deve fingir que uma seleção temporária de leads é uma campanha completa.

### Dashboard CRM avançado
O endpoint `stats/overview` atual foi pensado para estado operacional existente. Para um Dashboard CRM completo, seria desejável um read model como `OperationalOverview` contendo também:

- oportunidades por etapa;
- oportunidades sem próxima ação;
- campanhas ativas;
- campanhas com falha;
- propostas sem retorno;
- conversão recente.

### Analytics de funil
Custos já existem. Funil comercial e conversão dependem de Oportunidades/Pipeline, então só fazem sentido quando essas entidades existirem.

## Regra de integração

Nosso frontend não implementará nenhuma dessas regras de backend.

A estratégia é:

1. redesenhar e implementar agora tudo que usa os contratos existentes;
2. definir adapters/interfaces para as futuras entidades CRM;
3. usar fixtures somente em teste/dev quando necessário para construir a UI;
4. em produção, esconder/desabilitar módulos sem capability;
5. quando o backend do seu sócio expuser os contratos reais, conectar os adapters à API sem redesenhar a interface.

## Conclusão

Portanto, a frase correta não é “falta backend no sistema”.

A frase correta é:

> **O backend atual cobre o produto que existe hoje. O redesign que estamos projetando adiciona conceitos novos de CRM; esses novos conceitos precisam de contratos de backend próprios para deixarem de ser apenas UI e se tornarem funcionalidades persistentes.**

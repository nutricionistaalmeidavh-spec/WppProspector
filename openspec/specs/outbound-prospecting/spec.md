# outbound-prospecting Specification

## Purpose

Permite que o operador inicie ativamente a conversa com um lead: cadastrar o lead, disparar
uma mensagem de template aprovada como primeiro contato e criar a conversa correspondente já
com o turno inicial registrado, acompanhando o estado de prospecção de cada lead. O disparo é
autenticado, idempotente por lead e serializado com o processamento de mensagens desse lead.

## Requirements

### Requirement: Cadastro de lead para prospecção

O sistema SHALL expor `POST /admin/api/leads`, protegido pela sessão de usuário único da API
de gestão, que registra um lead a partir de um telefone no formato E.164 e de campos
opcionais de contexto (nome, origem, notas, **empresa, segmento, cidade**). O lead SHALL ser
persistido no armazenamento operacional (`operational-data-store`) e SHALL ser deduplicado
por telefone: um segundo cadastro do mesmo telefone NÃO SHALL criar um segundo registro —
SHALL atualizar os campos de contexto informados e responder com sucesso, preservando o
estado de prospecção corrente. Um telefone fora do formato E.164 SHALL ser recusado com HTTP
422 sem persistir nada. A resposta de sucesso SHALL devolver, em um contrato tipado, o lead
registrado com o seu estado de prospecção e com os campos de contexto (incluindo empresa,
segmento e cidade, `null` quando ausentes).

#### Scenario: Lead novo cadastrado

- **WHEN** um operador autenticado envia `POST /admin/api/leads` com um telefone E.164 válido e campos de contexto
- **THEN** o sistema persiste um novo lead com estado de prospecção `pending` e responde com sucesso e o lead registrado, incluindo empresa, segmento e cidade quando informados

#### Scenario: Telefone já cadastrado

- **WHEN** o operador cadastra um telefone que já existe como lead
- **THEN** o sistema não cria um segundo registro, atualiza os campos de contexto informados, mantém o estado de prospecção atual e responde com sucesso

#### Scenario: Telefone em formato inválido

- **WHEN** o operador envia um cadastro cujo telefone não está no formato E.164
- **THEN** o sistema responde HTTP 422 e não persiste nenhum lead

#### Scenario: Sem sessão

- **WHEN** uma requisição chega a `POST /admin/api/leads` sem cookie de sessão válido
- **THEN** o sistema responde HTTP 401 e não persiste nenhum lead

### Requirement: Disparo de prospecção com template de primeiro contato

O sistema SHALL expor `POST /admin/api/leads/:leadPhone/prospect`, protegido pela sessão de
usuário único, que envia ao lead uma **mensagem de template aprovada** como primeiro contato
de prospecção, delegando ao caso de uso de envio de template da conectividade com o WhatsApp.
O nome do template, o idioma e o mapeamento de parâmetros SHALL vir de configuração (não
codificados); os parâmetros do template PODEM ser informados no corpo da requisição. Quando
nenhum template de primeiro contato estiver configurado, o disparo SHALL falhar com um erro
identificável e NÃO SHALL chamar o gateway.

Em caso de sucesso do envio, o sistema SHALL **semear a conversa** do lead (ver a capability
`conversation-engine`): criar o agregado `Conversation` se ainda não existir e registrar o
turno outbound inicial com origem no operador e marcação de primeiro contato de prospecção; se
a conversa já existir, SHALL apenas acrescentar esse turno. A conversa semeada SHALL ser
persistida antes de a resposta ser devolvida.

Quando não existir lead cadastrado para o telefone informado, o sistema SHALL responder HTTP
404 e NÃO SHALL enviar nada. Um telefone fora do formato E.164 SHALL ser recusado com HTTP
422. A resposta de sucesso SHALL devolver, em um contrato tipado, o identificador da mensagem
(`wamid`) e o estado de prospecção atualizado do lead.

#### Scenario: Primeiro contato disparado com sucesso

- **WHEN** um operador autenticado chama `POST /admin/api/leads/:leadPhone/prospect` para um lead cadastrado em estado `pending` e com template de primeiro contato configurado
- **THEN** o sistema envia a mensagem de template pela Cloud API, semeia/atualiza a conversa com um turno outbound de origem no operador marcado como primeiro contato, persiste a conversa, passa o lead ao estado `sent` e responde com sucesso, o `wamid` e o estado atualizado

#### Scenario: Lead não cadastrado

- **WHEN** o operador dispara a prospecção para um telefone sem lead cadastrado
- **THEN** o sistema responde HTTP 404 e não envia nenhuma mensagem

#### Scenario: Template de primeiro contato não configurado

- **WHEN** o operador dispara a prospecção e nenhum template de primeiro contato está configurado
- **THEN** o sistema responde com um erro identificável, não chama o gateway e não altera o estado do lead

#### Scenario: Telefone em formato inválido

- **WHEN** o operador dispara a prospecção para um telefone fora do formato E.164
- **THEN** o sistema responde HTTP 422 e não envia nada

#### Scenario: Sem sessão

- **WHEN** uma requisição chega ao endpoint de disparo sem cookie de sessão válido
- **THEN** o sistema responde HTTP 401 e não envia nada

### Requirement: Idempotência do disparo por lead

O sistema SHALL tratar o disparo de prospecção como idempotente por lead: quando o lead já
teve um primeiro contato de prospecção enviado (estado `sent`, `replied` ou `failed` após uma
tentativa anterior bem-sucedida de envio), uma nova chamada a
`POST /admin/api/leads/:leadPhone/prospect` sem o parâmetro `force` NÃO SHALL reenviar o
template nem acrescentar um novo turno de primeiro contato — SHALL responder com sucesso e o
estado corrente do lead. Com `force` verdadeiro, o sistema SHALL reenviar o template e
registrar um novo turno outbound de origem no operador. Um lead em estado `failed` cuja
tentativa anterior não chegou a enviar (falha antes do gateway) SHALL poder ser disparado
novamente sem `force`.

#### Scenario: Redisparo sem force é ignorado

- **WHEN** o operador chama o disparo de prospecção para um lead que já está em `sent` ou `replied`, sem `force`
- **THEN** o sistema não reenvia o template, não acrescenta turno e responde com sucesso e o estado atual do lead

#### Scenario: Redisparo com force reenvia

- **WHEN** o operador chama o disparo com `force` verdadeiro para um lead que já foi prospectado
- **THEN** o sistema reenvia o template, registra um novo turno outbound de origem no operador e atualiza o estado do lead conforme o resultado do envio

#### Scenario: Novo disparo após falha antes do gateway

- **WHEN** um disparo anterior falhou antes de chamar o gateway (ex.: template não configurado) e o operador dispara novamente
- **THEN** o sistema executa o envio normalmente, sem exigir `force`

### Requirement: Serialização do disparo com o processamento do lead

O sistema SHALL executar o disparo de prospecção dentro do processo do bot e na mesma fila
serial por lead usada para processar as mensagens recebidas daquele lead. O disparo NÃO SHALL
ler, mutar e gravar a conversa em paralelo a uma geração de resposta ou a outra ação de
operação em andamento para o mesmo lead; SHALL aguardar a sua vez na fila. Disparos para
leads diferentes PODEM ocorrer em paralelo.

#### Scenario: Disparo enfileirado atrás de um processamento em andamento

- **WHEN** um processamento de mensagem para um lead está em andamento e o operador dispara a prospecção para o mesmo lead
- **THEN** o disparo só é aplicado após o processamento em andamento concluir, sobre o estado já atualizado da conversa

#### Scenario: Disparos para leads diferentes em paralelo

- **WHEN** o operador dispara a prospecção para dois leads distintos ao mesmo tempo
- **THEN** os dois disparos podem ser processados concorrentemente, cada um na fila do seu lead

### Requirement: Estado de prospecção do lead

O sistema SHALL manter, para cada lead, um estado de prospecção com os valores
`pending | sent | replied | failed`, derivado do resultado do envio e do primeiro inbound
subsequente:

- `pending` — lead cadastrado, primeiro contato ainda não disparado;
- `sent` — primeiro contato enviado com sucesso ao gateway, sem resposta do lead ainda;
- `replied` — o lead enviou a primeira mensagem inbound após o primeiro contato;
- `failed` — o gateway rejeitou o envio do primeiro contato.

A transição para `replied` SHALL ser feita quando o primeiro inbound do lead após o disparo
for processado; o webhook já cria/atualiza a conversa, e a projeção liga esse inbound ao
lead. Uma falha ao atualizar o estado de prospecção a partir do inbound NÃO SHALL falhar o
processamento da mensagem: o erro SHALL ser registrado em log e o estado SHALL convergir no
próximo evento ou reconciliação.

#### Scenario: Envio bem-sucedido leva a sent

- **WHEN** o primeiro contato de prospecção de um lead é aceito pelo gateway
- **THEN** o estado de prospecção do lead passa a `sent`

#### Scenario: Envio rejeitado leva a failed

- **WHEN** o gateway rejeita o envio do primeiro contato de prospecção
- **THEN** o estado de prospecção do lead passa a `failed` e nenhum turno "enviado" é semeado na conversa

#### Scenario: Primeira resposta do lead leva a replied

- **WHEN** um lead em estado `sent` envia a sua primeira mensagem inbound após o primeiro contato
- **THEN** ao processar essa mensagem o sistema passa o estado de prospecção do lead para `replied`

#### Scenario: Falha ao ligar o inbound ao lead não quebra o processamento

- **WHEN** a atualização do estado de prospecção a partir de um inbound falha
- **THEN** o sistema registra o erro em log e o processamento da mensagem recebida segue normalmente

### Requirement: Guardas do primeiro contato de prospecção

O sistema SHALL exigir uma mensagem de template para o primeiro contato de prospecção (fora
da janela de atendimento de 24 h) — o disparo NÃO SHALL usar envio de texto de sessão. Um
telefone inválido SHALL resultar em HTTP 422. Uma falha do gateway ao enviar o template SHALL
resultar em estado `failed` e HTTP 502, sem semear um turno "enviado" na conversa e sem
marcar o lead como `sent`.

#### Scenario: Falha do gateway não semeia turno

- **WHEN** o operador dispara a prospecção e o gateway rejeita o envio do template
- **THEN** o sistema responde HTTP 502, marca o lead como `failed` e não acrescenta nenhum turno outbound à conversa

#### Scenario: Primeiro contato nunca usa texto de sessão

- **WHEN** o primeiro contato de prospecção de um lead é disparado
- **THEN** o sistema envia uma mensagem de template aprovada e nunca uma mensagem de texto de sessão

### Requirement: Correlação do envio de template com o lead para o registro de consumo

O sistema SHALL registrar o identificador da mensagem (`wamid`) devolvido pelo envio do
template de primeiro contato de forma correlacionável ao lead, para que os eventos de status
e de precificação da Meta recebidos depois (capability `consumption-metrics`, via
`whatsapp-connectivity`) possam ser atribuídos a esse lead. Esta change NÃO SHALL introduzir
um novo fluxo de cálculo de custo — apenas garantir a correlação do `wamid`.

#### Scenario: wamid do primeiro contato correlacionável ao lead

- **WHEN** o primeiro contato de prospecção é enviado com sucesso e devolve um `wamid`
- **THEN** o sistema guarda esse `wamid` associado ao lead, de modo que um evento de status posterior para esse `wamid` seja atribuível ao lead

### Requirement: Importação de leads em lote sem disparo

O sistema SHALL expor `POST /admin/api/leads/import`, protegido pela sessão de usuário
único, que recebe uma coleção de leads já extraídos e normalizados pelo cliente — cada item
com um telefone E.164 e campos opcionais de contexto (`company`, `segment`, `city`,
`displayName`, `source`, `notes`) — e os persiste em lote no armazenamento operacional. A
importação SHALL registrar cada lead com estado de prospecção `pending` quando novo e SHALL
ser deduplicada por telefone; para um telefone já existente ela SHALL **sobrescrever** os
campos de contexto informados com os valores recebidos (o arquivo importado é a fonte da
verdade da importação) e SHALL preservar o estado de prospecção corrente. A importação NÃO
SHALL, em nenhuma hipótese, enviar mensagem de template nem semear conversa.

Itens com telefone ausente ou fora do formato E.164 SHALL ser rejeitados individualmente,
sem abortar o lote; a resposta SHALL devolver, em um contrato tipado, o total de leads
criados, o total atualizados e a lista de itens rejeitados com o índice/linha de origem e um
motivo identificável. Um lote acima do limite máximo configurado de itens SHALL ser recusado
com HTTP 422 sem persistir nada. Duas ocorrências do mesmo telefone dentro do mesmo lote
SHALL resultar em um único lead, com a última ocorrência prevalecendo.

#### Scenario: Lote com leads novos e já existentes

- **WHEN** um operador autenticado envia `POST /admin/api/leads/import` com um telefone novo e um telefone já cadastrado, ambos E.164 válidos
- **THEN** o sistema cria o lead novo com estado `pending`, sobrescreve os campos de contexto do lead existente com os valores do lote, preserva o estado de prospecção do existente e responde com os totais de criados e atualizados

#### Scenario: Linhas inválidas não abortam o lote

- **WHEN** o lote contém itens com telefone vazio e com telefone fora do formato E.164 ao lado de itens válidos
- **THEN** o sistema persiste os itens válidos e devolve os itens inválidos na lista de rejeitados, cada um com a linha de origem e o motivo, sem falhar a requisição

#### Scenario: Importação nunca dispara

- **WHEN** um lote de leads é importado com sucesso
- **THEN** nenhum template é enviado, nenhuma conversa é semeada e todos os leads novos ficam em estado `pending`

#### Scenario: Telefone repetido no mesmo lote

- **WHEN** o lote traz o mesmo telefone em duas linhas com campos de contexto diferentes
- **THEN** o sistema persiste um único lead com os valores da última ocorrência

#### Scenario: Lote acima do limite

- **WHEN** o operador envia um lote com mais itens que o limite máximo configurado
- **THEN** o sistema responde HTTP 422 e não persiste nenhum lead

#### Scenario: Sem sessão

- **WHEN** uma requisição chega a `POST /admin/api/leads/import` sem cookie de sessão válido
- **THEN** o sistema responde HTTP 401 e não persiste nenhum lead

### Requirement: Disparo de prospecção em lote

O sistema SHALL expor `POST /admin/api/leads/prospect`, protegido pela sessão de usuário
único, que recebe uma lista de telefones E.164 e um sinalizador opcional `force`, e dispara
o primeiro contato de prospecção para cada telefone reusando a mesma lógica do disparo
individual (envio de
template aprovado, semeadura/atualização da conversa na fila serial do lead, idempotência
por lead, atualização do estado de prospecção). O processamento SHALL ser **continue-on-error**:
a falha de um telefone (gateway, lead inexistente, telefone inválido) NÃO SHALL interromper
o disparo dos demais.

Sem `force`, apenas leads em estado `pending` ou `failed` SHALL ter o template efetivamente
enviado; um lead em `sent` ou `replied` SHALL ser reportado como `skipped` sem reenviar. A
resposta de sucesso SHALL devolver, em um contrato tipado, um resultado por telefone com o
desfecho (`sent` com `wamid` | `skipped` | `failed` com motivo) e o estado de prospecção
resultante do lead. Uma lista acima do limite máximo configurado SHALL ser recusada com HTTP
422 sem disparar nada. O disparo SHALL respeitar um limite de concorrência entre telefones
distintos, mantendo a serialização por lead.

#### Scenario: Lote disparado com desfechos mistos

- **WHEN** um operador autenticado chama `POST /admin/api/leads/prospect` com quatro telefones: um `pending` cadastrado, um `sent`, um sem lead cadastrado e um cujo gateway rejeita o envio
- **THEN** o sistema envia o template ao lead `pending` (desfecho `sent` com `wamid`), reporta o lead `sent` como `skipped`, reporta o telefone sem lead como `failed` com motivo, reporta o telefone rejeitado pelo gateway como `failed` com motivo, e responde com sucesso e o resultado por telefone

#### Scenario: Falha de um lead não aborta o lote

- **WHEN** o disparo de um dos telefones da lista lança erro
- **THEN** o sistema segue disparando os telefones restantes e inclui o telefone com erro na resposta marcado como `failed` com o motivo

#### Scenario: Redisparo em lote sem force é ignorado por lead

- **WHEN** a lista inclui leads já em `sent` ou `replied` e `force` não é verdadeiro
- **THEN** o sistema não reenvia o template para esses leads, marca-os como `skipped` e dispara normalmente os leads `pending`/`failed`

#### Scenario: Redisparo em lote com force

- **WHEN** o operador chama o disparo em lote com `force` verdadeiro para leads já prospectados
- **THEN** o sistema reenvia o template, registra um novo turno outbound de origem no operador para cada um e atualiza o estado conforme o resultado do envio

#### Scenario: Lista acima do limite

- **WHEN** o operador envia uma lista com mais telefones que o limite máximo configurado
- **THEN** o sistema responde HTTP 422 e não dispara nenhuma mensagem

#### Scenario: Sem sessão

- **WHEN** uma requisição chega ao endpoint de disparo em lote sem cookie de sessão válido
- **THEN** o sistema responde HTTP 401 e não dispara nada

### Requirement: Reset da prospecção de um lead

O sistema SHALL expor `POST /admin/api/leads/:leadPhone/reset`, protegido pela sessão de
usuário único, que devolve um lead ao estado de prospecção `pending` e limpa os carimbos de
primeiro contato do lead (`first_contact_wamid`, `first_contact_at`, `replied_at`),
re-habilitando o lead para um novo disparo de primeiro contato. O reset SHALL agir somente
sobre o registro do lead no armazenamento operacional — NÃO SHALL apagar o agregado
`Conversation` do lead nem os turnos já registrados. Um disparo posterior sobre um lead
resetado SHALL semear/atualizar a conversa normalmente, acrescentando um novo turno de
primeiro contato à conversa existente.

Quando não existir lead cadastrado para o telefone informado, o sistema SHALL responder HTTP
404. Um telefone fora do formato E.164 SHALL ser recusado com HTTP 422. Chamar o reset para
um lead que já está em `pending` SHALL ser idempotente (sucesso, sem efeito adicional além
de garantir os carimbos limpos). A ação SHALL ser registrada na trilha de auditoria de forma
best-effort: uma falha ao auditar NÃO SHALL desfazer o reset já aplicado. A resposta de
sucesso SHALL devolver, em um contrato tipado, o lead com o estado de prospecção atualizado.

#### Scenario: Reset de um lead já contatado

- **WHEN** um operador autenticado chama `POST /admin/api/leads/:leadPhone/reset` para um lead em estado `sent` ou `replied`
- **THEN** o sistema passa o lead para `pending`, limpa os carimbos de primeiro contato, mantém a conversa e os turnos do lead intactos, registra a auditoria best-effort e responde com sucesso e o lead atualizado

#### Scenario: Novo disparo após o reset

- **WHEN** um lead é resetado e em seguida a prospecção é disparada novamente para ele
- **THEN** o sistema envia o template, acrescenta um novo turno de primeiro contato à conversa já existente do lead e passa o lead para `sent`

#### Scenario: Reset idempotente

- **WHEN** o operador chama o reset para um lead que já está em `pending`
- **THEN** o sistema responde com sucesso sem efeito adicional

#### Scenario: Lead inexistente

- **WHEN** o operador chama o reset para um telefone sem lead cadastrado
- **THEN** o sistema responde HTTP 404 e nada é alterado

#### Scenario: Telefone em formato inválido

- **WHEN** o operador chama o reset para um telefone fora do formato E.164
- **THEN** o sistema responde HTTP 422

#### Scenario: Sem sessão

- **WHEN** uma requisição chega ao endpoint de reset sem cookie de sessão válido
- **THEN** o sistema responde HTTP 401 e nada é alterado

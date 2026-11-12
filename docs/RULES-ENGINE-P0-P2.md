# Motor de regras — arquitetura P0–P2

## Núcleo obrigatório
- Backend Node/Fastify + SQLite (WAL + FTS5) + TypeScript, sem dependência de serviços pagos.
- Provedores Anthropic/OpenAI/compatível e WhatsApp Meta permanecem opcionais e exigem configuração explícita.
- O conector local Baileys é não oficial; custo de API R$ 0 não significa imunidade a bloqueios da plataforma.
- Nenhuma simulação envia WhatsApp, altera oportunidade ou aciona API paga sem consentimento explícito.

## P0 — prioridade e confiabilidade
1. Política obrigatória de descadastramento e transferência humana é aplicada **antes** de qualquer regra e novamente no use-case, mesmo se SQLite ou o motor de automação falharem.
2. Sessões de menu usam chave JSON `[businessId, channelId, phone]`, com migração aditiva. Não há chave de canal derivada de segredo.
3. Follow-ups novos são vinculados ao canal escolhido no momento do agendamento. Processamento e cancelamento automático por resposta respeitam o canal. Jobs antigos com `channel_key=default` não são enviados por outro canal; revise/reagende-os após upgrade.
4. Follow-ups enviam pelo `DurableWhatsappGateway` com o ID persistente do agendamento como `operationId`. Após `sent`, tentativas com o mesmo ID retornam o identificador persistido e não enviam novamente. A outbox ainda oferece garantia **at-least-once**, não exactly-once: falha do provedor após entrega e antes da confirmação pode gerar duplicidade.
5. O adapter de respostas desativa o segundo envio imediato quando a outbox durável está ativa; o worker persistente passa a controlar tentativas.

## P1 — motor profissional
- `rule-evaluator.ts` é puro, compartilhado entre execução real e simulação; regras por prioridade estável.
- Suporta condições `all/any`, campos permitidos (`message.text`, `crm.stage`, `commerce.stock`, `commerce.sku`, `event.type`) e operadores tipados.
- Eventos suportados: mensagem recebida; etapa de oportunidade alterada; saldo do catálogo alterado por importação ou sincronização.
- Ação `crm_set_stage` exige evento CRM, condição explícita da etapa, estágio de destino e identificador canônico da oportunidade; o executor valida o vínculo com o contato e usa `CrmStore.updateOpportunity`.
- Ações de evento **não** enviam mensagens WhatsApp implicitamente. Rascunho, validação e publicação de regras já existentes continuam necessários.
- Histórico `automation_rule_executions` registra ID da regra, evento, origem, escopo e data, sem conteúdo bruto da conversa no endpoint administrativo.
- Laboratório: `POST /admin/api/business/studio/rules/simulate` recebe até 15 mensagens, contexto simulado de CRM/estoque e reproduz sessões de menus sem mutação ou chamadas externas. Para validar uma publicação, rode o laboratório com cenário representativo.

## P2 — recuperação local
- Índice `business_commerce_fts` (FTS5) sobre o catálogo canônico publicado; triggers mantêm inclusão, alteração e exclusão.
- Tokens normalizados com remoção de acentos e filtro de palavras de parada. Busca não envia catálogo para terceiros.
- `LocalRulesLlmClient` usa a busca apenas quando há um único candidato; em caso ambíguo, preserva o comportamento conservador sem inventar preço ou saldo.
- O estoque continua sendo o saldo da **última sincronização**, e nunca deve ser prometido como disponibilidade em tempo real.

## Limites explicitamente mantidos para compatibilidade
- Um estabelecimento por instalação. O histórico completo de conversas e o índice do CRM permanecem identificados por telefone; o novo escopo de canal protege sessões de regras e agendamentos, mas a migração integral de conversas multi-canal precisa de uma mudança própria para não quebrar clientes/links já existentes.
- Eventos de estoque apenas executam decisões locais/auditoria. Não disparam mensagens para clientes.
- Não há filas distribuídas nem novos processos obrigatórios; SQLite permanece fonte canônica e implementação self-hosted simples.
- Ações automáticas de CRM realizadas após um PATCH são best-effort. Se falharem, o PATCH canônico não é desfeito e o erro fica no log do servidor.
- Migração `0021_automation_architecture.sql` é aditiva e não remove regras, perfis, conversas, leads ou históricos anteriores.

## Validação
```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:smoke
```
Testes novos incluem: precedência de políticas, falha do motor, menus por canal, agendamentos por canal, operação durável idempotente, condição E/OU, ação CRM e busca FTS5 após sincronização.

**Não fazer merge ou release até a CI ficar verde.** Dados e números usados nos testes são fictícios.

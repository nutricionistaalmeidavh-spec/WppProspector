# Integridade canônica — WppProspector (P0)

## Fontes da verdade

| Domínio | Armazenamento canônico | Referências / projeções |
| --- | --- | --- |
| Identidade do contato | \`leads.phone\` (E.164) | \`crm_customers.lead_phone\`, \`crm_opportunities.lead_phone\`, público de campanhas |
| Cadastro do lead | \`leads.display_name\`, \`leads.company_id\` | Nome/empresa do cliente são lidos ao vivo do lead; snapshot legado em \`crm_customers\` não é autoritativo |
| Empresa | \`crm_companies.id\` | \`leads.company_id\`, \`crm_opportunities.company_id\` |
| Negócio | \`crm_opportunities.id\` + etapa | \`crm_stage_events\` é trilha de transições |
| Valor da venda | \`crm_quotes.total_cents\` quando existe proposta | \`estimated_cents\` continua sendo previsão inicial, não é sobrescrito pela cotação |
| Autoria/operador | \`crm_team_users.id\` | Oportunidades/atividades com \`owner_user_id\`; nomes históricos só fallback de migração |
| Prospecção | \`leads.prospecting_state\` | Nunca atribuir o status global a uma campanha específica |
| Campanhas | \`crm_campaign_deliveries\` | \`sent/replied/failed\` por evidência real de campanha; respostas correlacionadas à última entrega pertinente, por id e data |
| Follow-up | \`automation_followups.id\` e \`state\` | Atividade com \`followup_id\`; vencimento/estado de envio projetados; trigger encerra atividade após envio |
| Conversas | 1 JSON por telefone | \`conversation_index\` é derivado e reconstruído em cada inicialização do serviço |

## Migração segura

A \`0014_crm_canonical_integrity.sql\` somente adiciona colunas, índice, tabela de entregas e trigger, mantendo dados legados. 
Na migração, associa empresa por nome apenas se a correspondência for inequívoca; em seguida recupera IDs previamente vinculados aos clientes ou a uma única empresa de oportunidades.
Em casos ambíguos, o vínculo permanece nulo para **revisão humana**, em vez de vincular empresas erradas.

Use \`PATCH /admin/api/crm/leads/:phone/company\` para vinculação explícita por UUID. Reimportações podem atualizar dados textuais do lead sem gerar outra identidade ou substituir \`company_id\`.
A interface de nova oportunidade também vincula o lead à empresa escolhida se ainda não houver associação por ID.

## Regras comerciais

- Um lead convertido em cliente permanece canônico em \`leads\`, com o histórico intacto; primeiro contato de prospecção é bloqueado inclusive com \`force\`, mas atendimento humano não é bloqueado.
- Empresas e responsáveis são selecionados por IDs, nunca por inferência de nome em operações novas.
- Só o endpoint explícito \`POST /admin/api/crm/campaigns/:id/prospect\` pode vincular um envio realizado a uma campanha. O servidor exige membro existente e usa a implementação já aprovada de primeiro contato. Campanhas antigas não ganham falsos envios retroativos.
- O envio é recurso opcional de template pelo provedor habilitado e sujeito a consentimento; a tela nunca dispara o público inteiro automaticamente.
- Um follow-up ligado a uma atividade WhatsApp continua controlado pela automação, com consentimento e cancelamento; o CRM não cria envio ou nova fila por conta própria.
- Um orçamento tem valor próprio (cotado) e não reescreve a estimativa histórica da oportunidade; indicadores comerciais usam o cotado quando existente.

## Limites operacionais e validação

- A reconstrução integral do índice de conversas prioriza consistência durante a inicialização e pode exigir otimização incremental para grandes históricos.
- Listagens de CRM ainda têm limites individuais históricos; a paginação geral é uma melhoria de escalabilidade separada.
- A atribuição de respostas ao último envio registrado depende dos timestamps e IDs de mensagem; não recupera envios históricos sem evidências.
- Realizar backup e testar restauração antes de atualizar bancos reais; nenhum \`.env\`, token ou banco deve entrar na distribuição.
- Os testes automatizados não substituem a homologação do provedor WhatsApp, rede, Docker ou navegador real em dispositivos.
- Core R$0, self-hosted e open source. Meta Cloud API/Anthropic permanecem opt-in explícito e podem gerar custos.

## Verificação

Arquivos de regressão:
- \`apps/server/src/crm/canonical-integrity.test.ts\`
- \`apps/server/src/crm/campaign-attribution.test.ts\`
- \`apps/server/src/management/canonical-prospecting.test.ts\`
- \`apps/server/src/crm/crm-store.test.ts\`

CI obrigatório da PR: \`npm ci\`, contratos, lint, typecheck, testes, build e smoke. **Não realizar merge caso o último SHA não tenha CI verde.**

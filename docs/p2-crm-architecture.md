# P2 — CRM real e analytics

O CRM utiliza tabelas SQLite canônicas de empresas, oportunidades, histórico de transições e campanhas. Leads são referenciados pela chave E.164 existente. Conversas continuam na fonte JSON, sem migração ou duplicação.

As métricas de campanhas exibem estados atuais dos leads associados, não provam que a campanha foi a responsável pelo envio. Criar uma campanha ou associar leads NÃO envia mensagens. Participar de uma campanha NÃO concede consentimento de prospecção.

Oportunidades registram todas as mudanças de etapa. O campo wonValue representa valor estimado dos negócios ganhos, NÃO faturamento ou recebimento. Analytics deve usar exclusivamente dados persistidos. Não inserir fixtures/demo no banco produtivo. CRM deve ser protegido por sessão de admin.

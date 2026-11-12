# WppProspector — contrato de comportamento

## Escopo e fonte canônica
Uma instalação = uma empresa, SQLite local canônico para perfis e pedidos importados. As integrações são opcionais e não substituem os dados de leads, clientes e conversas já existentes.

## Contrato de publicação
- Mudanças de perfil são gravadas no rascunho, sem alterar a fonte ativa.
- A publicação explícita registra revisão; falhas preservam o rascunho.
- Histórico permite restauração com confirmação inline e registro de nova revisão; restauração não altera credenciais.
- Alterações de provedor/modelo são preparadas separadamente; a ativação requer ação distinta.
- Padrão sempre é regras locais R$0. Nenhuma API paga é requisito de boot.

## Laboratório
- Regras automáticas precedem motor LLM.
- A simulação jamais chama o gateway WhatsApp nem persiste menu ou follow-up.
- Sem consentimento de cobrança, a simulação usa exclusivamente o motor local.
- Solicitação paga exige consentimento explícito por execução, nunca implícito em salvar.
- Publicar motor somente quando o motor correspondente foi testado no painel.

## Comércio
- Produtos e pedidos Shopify são lidos pelo backend após clique explícito.
- Token armazenado cifrado; GET não devolve segredo; apagar conexão não apaga banco.
- Catálogo complementar só é consultado pelo bot quando ativado.
- Pedidos não são compartilhados com LLM nem retornados ao cliente via WhatsApp.
- Estoque importado é fotografia do sincronismo, não promessa de tempo real.
- Sincronização atual consulta no máximo 50 produtos e 50 pedidos; demais dados exigem paginação futura.

## Regras de UI
- Navegação horizontal de etapas sempre mantém os rascunhos locais durante navegação interna.
- Carregamento, operação em andamento, falha e sucesso devem estar visíveis; erro preserva entradas.
- Botões de publicar e ativar são distintos de salvar rascunho.
- Avisos financeiros devem aparecer antes de chamada externa, com opt-in desmarcado.
- Diálogos de ações reversíveis de alto impacto exigem confirmação.
- Campos de senha mascarados; nunca ecoar segredos em URLs, erros ou toasts.

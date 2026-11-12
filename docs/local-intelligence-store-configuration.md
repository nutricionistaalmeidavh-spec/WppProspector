# Motor de atendimento local — configuração por loja

## Princípio
O motor local funciona sem chave de API, modelo instalado ou assinatura. Cada instalação usa exclusivamente o cadastro canônico da própria loja. Nenhuma informação de demonstração pode ser usada em produção.

## O que o lojista informa
1. Nome, segmento e descrição do negócio.
2. Horários, pagamentos, entregas e política de trocas.
3. Produtos e preços, por cadastro ou sincronização da fonte comercial.
4. Perguntas frequentes e respostas aprovadas.
5. Regras específicas de atendimento e critérios de transferência humana.

Esses dados já possuem superfícies de cadastro em Configurações > Motor de Regras / IA e Automações. A publicação de rascunhos deve continuar separada do atendimento ativo.

## Automático, sem configuração
- Normalização de acentos e caixa.
- Correspondência de nomes completos e SKU.
- Tolerância a um erro de digitação por token de produto, com limites para evitar falsos positivos.
- Respostas apenas com dados locais cadastrados; informações ausentes devem gerar encaminhamento.
- Opt-out e solicitação de humano mantêm prioridade sobre a geração de respostas.

## Evolução futura (não implementada nesta alteração)
- Editor visual de condições AND/OR, validado no backend.
- Busca FTS5 e classificação de intenção com modelos locais opcionais.
- Sinônimos editáveis por empresa, com teste de simulação e rollback.
- Templates por segmento somente como sugestões, nunca como dados comerciais publicados automaticamente.
- Avaliação de Fuse.js e json-rules-engine após medição de ganho contra a implementação local.

## QA
Validar: erros de digitação, nomes parcialmente coincidentes, múltiplos produtos, negação, opt-out, estoque ausente, preços desconhecidos, menus, handoff e isolamento entre instalações. Testar sem qualquer conexão de rede.

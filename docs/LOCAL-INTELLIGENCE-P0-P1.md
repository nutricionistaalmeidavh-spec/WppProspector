# Inteligência comercial local PT-BR (P0/P1)

## Funcionamento padrão: R$ 0 e self-hosted
- `rules` é o motor predefinido. Classifica em português intenções de preço, estoque, entrega, compra, suporte, atendimento humano, rejeição e descadastramento, sem depender de GPU, modelos de IA ou serviços pagos.
- O comércio usa perfis, FAQs, políticas e preços **publicados** no SQLite da própria instalação. Os rascunhos são testáveis e só passam ao atendimento real mediante publicação explícita.
- O catálogo comercial ativo possui busca SQLite FTS5 (PR #23). Uma tolerância conservadora para um erro de digitação complementa a identificação de produtos; quando ambígua, a resposta não escolhe um preço arbitrário.
- O motor de regras, FTS5, consentimento/outbox e validação por loja da PR #23 continuam intactos.
- Cancelar um pedido ou compra solicita suporte, **não** retira automaticamente o consentimento. Pedidos explícitos de parar mensagens prevalecem sobre qualquer automação.
- Cada instalação possui sua configuração isolada. Múltiplas lojas num único SQLite requerem projeto multi-tenant dedicado e **não** fazem parte deste escopo.

## Fora do escopo nesta entrega
- Busca semântica, embeddings, servidores de modelos e qualquer configuração de inferência vetorial. Não foram adicionados ao core nem ao painel.
- APIs Anthropic/OpenAI são opções já existentes de ativação explícita; não são necessárias para o funcionamento local.

## QA e publicação
- Conferir `npm run check:contracts`, `npm run lint`, `npm run typecheck`, testes Vitest, build e Playwright.
- Dados usados em testes são fictícios; nenhuma chave real é necessária.

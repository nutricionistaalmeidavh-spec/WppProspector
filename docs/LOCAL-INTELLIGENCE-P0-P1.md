# P0/P1 — Inteligência local por estabelecimento (R$0)
 
## Núcleo padrão (sem APIs ou modelos)
- `rules` é o provedor inicial. Classificação PT-BR determinística de intenção e assunto; não baixa modelos, não depende de GPU, rede externa ou API paga.
- Perfis, FAQ, políticas e produtos ficam no SQLite de **cada instalação**; rascunhos não alteram atendimento até a publicação. Uma instalação usa um perfil comercial ativo; múltiplas lojas no mesmo SQLite exigem uma migração multi-tenant específica, não são anunciadas como suportadas.
- Correspondência por nome/SKU, tolerância conservadora de um caractere, FTS5 do catálogo publicado e fallback humano. Preços, estoque e regras usam registros canônicos; não inferir preços nem saldo de mensagens.
- Pedidos de descadastramento são prioritários. Cancelamento de **pedido/compra/assinatura** é suporte, não remoção automática de consentimento; o mesmo predicado de opt-out é usado em atendimento e políticas obrigatórias.

## Busca semântica opcional
- Na Central do atendente virtual → **Conhecimento**, ative a busca semântica e informe endpoint `/v1/embeddings` e nome do modelo.
- Exemplo de serviço próprio: `http://127.0.0.1:8080/v1/embeddings`. É necessário manter um servidor compatível com a API de embeddings ativo; ele **não é instalado/baixado pelo CRM**. Pode exigir CPU/RAM própria. A opção fica **desligada por padrão**, mesmo em instalações antigas.
- Apenas após ativar **e publicar** o perfil o atendimento pode enviar perguntas ao endpoint configurado. O uso de um endpoint externo HTTPS é escolha explícita do administrador e pode ter custo; não é necessário para o core.
- O mecanismo compara os vetores ao catálogo local (máximo de 500 itens por consulta), com similaridade mínima 0,85 e diferença de 0,08 em relação ao segundo item. Sem confiança única, falha de rede ou modelo indisponível, a resposta segue o fluxo local/FTS5 ou atendimento humano.
- Vetores ficam em cache de memória por instalação, invalidados quando nome, SKU, versão de sincronização, endpoint ou modelo mudam. Nenhum dado é enviado a serviço externo por padrão.

## Verificação
- `npm run check`: contratos, lint, tipagem, testes e build.
- GitHub Actions Monorepo CI + Docker self-hosted e Playwright Visual QA.
- Testes com dados sintéticos cobrem isolamento de instalações, mudanças de perfil sem reinicialização, opt-out, cancelamento de compra, erros de digitação, retorno sem API externa, ambiguidade semântica e falha de endpoint.
- Mudanças em `main` ou publicação de release apenas após compatibilização e verificações aprovadas.

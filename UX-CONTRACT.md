# WppProspector — contrato de comportamento

## Produto e canonicidade
Uma instalação corresponde a uma empresa. SQLite local é a fonte canônica de empresa, regras, credenciais e dados comerciais importados. Estoque não é contabilização de reserva nem autorização de venda. Nenhuma API comercial é pré-requisito para inicializar o CRM.

## Configuração inicial P0
- A Central apresenta etapas: visão geral, empresa, conhecimento, regras/automação, inteligência, laboratório, estoque/pedidos e histórico.
- Salvar configurações de perfil, regras ou IA **não ativa** alterações. Rascunhos ficam separados da versão publicada.
- Uma simulação bem-sucedida e correspondente ao rascunho é exigida **no servidor** antes de publicar. O hash da configuração aprovada expira após cada edição.
- Para regras, simular texto disparador não cria sessão de menu, agendamento ou envio de WhatsApp.
- O administrador edita regras diretamente na Central; o link antigo de automações encaminha a esse editor. A API legada é mantida por compatibilidade.
- A API de perfil e a API de provedor legadas são reservadas a administrações e compatibilidade; os fluxos da Central usam rascunho/publicação explícitos.

## Laboratório e diagnóstico P1
- Regras têm prioridade sobre o modelo de atendimento.
- Resposta do modo gratuito é produzida localmente; nenhuma credencial paga é necessária.
- A simulação **não** chama o gateway do WhatsApp.
- Sem consentimento, o preview de qualquer provedor comercial cai para regras locais e **não** autoriza a publicação do provedor pago.
- Diagnóstico de conexão/modelo para endpoint próprio ou comercial exige autorização explícita por chamada; não encaminha dados pessoais.
- Provedores externos podem consumir créditos somente após seleção deliberada e consentimento explícito.
- Erros ao diagnosticar são categorizados sem ecoar token, corpo da resposta nem endereço privado.
- O histórico permite restaurar perfil, regras e seleção de IA. Chaves de API não são incluídas em snapshots, e restauração de modelo comercial exige que a chave ainda exista.

## Estoque e pedidos P2
- Integração genérica funciona por HTTP local com token aleatório de alta entropia, exibido uma vez, guardado como hash SHA-256, revogável e rotacionável.
- Endpoint: `POST /admin/integrations/commerce/v1/sync`, header `Authorization: Bearer TOKEN`.
- Corpo: `products` com id, name, sku, price, stock; `orders` com id, number, financialStatus, fulfillmentStatus, total, createdAt.
- Não aceitar campos adicionais de pedidos com dados pessoais. O backend impõe limites de linhas por solicitação.
- Produtos enviados por integração substituem atomicamente **somente** a fotografia da origem integração; produtos manuais e Shopify opcionais são preservados. Pedidos têm upsert por ID externo.
- Catálogo só entra no contexto comercial do bot quando explicitamente ativado; dados de pedidos nunca são adicionados ao prompt.
- Saldo é fotografia do instante de sincronização. A aplicação não promete disponibilidade em tempo real.
- Shopify permanece conector específico opt-in e não é dependência, fonte central nem padrão.

## Autenticação e falhas
- Mudanças na Central exigem sessão de administrador. O endpoint genérico de sincronização exige token próprio, independente do cookie.
- Revogar/rotacionar invalida imediatamente o token antigo. Segredos não aparecem em GET, histórico ou mensagens de erro.
- Rascunhos e contexto publicado sobrevivem a falhas de teste sem ativação parcial.
- Recuperação e publicação registram revisões; nenhum mecanismo deve alterar pedidos/estoque ao restaurar versões de IA ou de perfil.

## Interface
- Entradas possuem estado de carregamento, feedback de sucesso/erro e impedimento de ação enquanto ocupadas.
- Botões de salvar, testar, ativar, restaurar e revogar são distintos; restauração pede confirmação inline.
- Estilo e primitivas canônicas estão definidos em DESIGN.md. Nunca criar tema paralelo ou alterar breadcrumbs em uma funcionalidade.

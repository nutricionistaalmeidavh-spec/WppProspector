# Integração opcional — ArtiSys Commerce Core (P5)

A integração de vendas com Shopify, Mercado Livre e Pagamentos ArtiSys é **R$ 0, self-hosted, sem serviços obrigatórios**. Não altera o WhatsApp, chaves Meta, Anthropic, contatos, sessões ou OAuth.

## Ativação

- Padrão: **DESATIVADA**.
- Configure em ambiente privado ARTISYS_COMMERCE_INBOUND_SECRET com segredo aleatório exclusivo de pelo menos 32 caracteres. Não usar ADMIN_ACCESS_SECRET ou segredos Meta.
- Configure o Commerce Core para enviar CRM_CONNECTOR_JSON apontando para a URL HTTPS do WppProspector em /api/integrations/artisys-commerce, usando o mesmo segredo.
- A comunicação usa POST JSON, x-artisys-timestamp, x-artisys-delivery-id e x-artisys-signature (HMAC-SHA256), com verificação sobre corpo bruto e janela de 5 minutos.
- O receptor só responde {"accepted":true} após persistência idempotente no SQLite.
- Consulte a projeção no painel autenticado, pela API GET /admin/api/crm/external-sales.

## Canonicidade / privacidade

- Vendas externas são armazenadas apenas em crm_external_sales e crm_external_sale_events. Chave lógica: (source,external_order_id), com delivery_id único.
- Projeta status paid/revoked. Um cancelamento anterior não é reativado por venda atrasada.
- Não identifica cliente pelo nome nem cria lead por e-mail. A fonte canônica do lead permanece leads.phone em E.164.
- Não associa conversa, empresa, oportunidade, telefone ou contato sem correspondência autenticada.
- Não envia mensagens automáticas, não move Kanban e não reescreve propostas comerciais.
- Campos: email fornecido pelo checkout, nome, SKUs, canal, ID de pedido, estado e data. Aplicar políticas LGPD e retenção antes de produção.

## Homologação

1. Execute npm run check e npm run test:smoke no projeto.
2. Faça POST com corpo correto e HMAC assinado em ambiente de teste, verifique resposta 200.
3. Repita o mesmo delivery_id e confira que só existe uma venda.
4. Envie cancelamento anterior à venda e confirme estado revoked.
5. Verifique ausência de alterações no cadastro de leads e conversas.
6. Valide HTTPS, segredo, backup SQLite, autenticação administrativa e políticas de privacidade antes de ativar tráfego real.

Não modificar automaticamente .env, dados de clientes ou segredo existente. Sem deploy até a aprovação.

# Integração de estoque e pedidos (P2)

A sincronização do WppProspector usa HTTP + SQLite. O core é **open source, gratuito e self-hosted**; nenhum serviço comercial é necessário. Shopify é um conector opcional independente desta API.

## 1. Criar e guardar o token

No painel como administrador: **Configurações → Central do atendente virtual → E-commerce → Integração genérica**, clique **Criar token local de integração**. O valor só aparece uma vez. Copie para o cofre de segredos do ERP/PDV. Não adicione a variável ao frontend, código-fonte, captura de tela ou log.

Use a mesma origem do painel para enviar POST a:

```text
/admin/integrations/commerce/v1/sync
```

O endpoint é protegido por Bearer token independente do cookie de sessão. Uma nova geração substitui o token anterior. **Revogar acesso** desabilita novas sincronizações, mantendo dados já importados.

## 2. Corpo canônico

```json
{
  "products": [
    { "id": "SKU001", "name": "Produto exemplo", "sku": "SKU001", "price": "50.00", "stock": 7 }
  ],
  "orders": [
    {
      "id": "PED001", "number": "#1001", "financialStatus": "paid",
      "fulfillmentStatus": "pending", "total": "50.00 BRL",
      "createdAt": "2026-11-12T12:00:00Z"
    }
  ]
}
```

`products` representa o **snapshot completo da fonte integração** (até 2500 itens por chamada). O próximo snapshot substitui apenas os produtos dessa origem. Envie `[]` para zerar essa fonte conscientemente.

`orders` aceita até 300 atualizações por chamada. O pedido é atualizado por identificador da origem, mantendo histórico no SQLite. **Não inclua nomes, telefones, endereços, e-mails, documentos ou outros campos pessoais**: o esquema rejeita propriedades extras.

Campos de estoque podem ser `null` quando desconhecidos. Saldo é uma fotografia do momento recebido; não representa reserva em tempo real nem promessa de entrega.

## 3. Exemplo com curl

```sh
curl -X POST 'https://seu-servidor/admin/integrations/commerce/v1/sync' \
  -H "Authorization: Bearer $CRM_COMMERCE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"products":[{"id":"SKU001","name":"Produto exemplo","sku":"SKU001","price":"50.00","stock":7}],"orders":[]}'
```

O retorno inclui a contagem de produtos, pedidos e o instante da sincronização. Sem token, token expirado/rotacionado ou token inválido: HTTP 401.

## 4. Visibilidade no atendimento

Os produtos importados ficam separados de entradas manuais e de conectores opcionais. **Ativar catálogo no bot** é uma ação distinta: sem ativação, nenhum dado importado é usado no prompt. Pedidos são usados apenas pela área de administração; não há endpoint do atendente para consultar pedidos individuais de terceiros.

## 5. Automação local

Exporte um snapshot do ERP/PDV, valide o JSON e envie via cron local, Activepieces self-hosted, script Python ou outro agendador open source. A configuração e a cadência são decisões de quem administra a instalação. Não existe polling externo automático nem assinatura obrigatória.

## 6. Limites

A integração é **unidirecional e autenticada**, não faz vendas no ERP, não reserva estoque, não sincroniza dados de pagamento e não executa consultas remotas a sistemas específicos. Consultar um pedido de um cliente a partir do WhatsApp exigirá fluxo adicional de autenticação e vinculação canônica; não está habilitado nesta etapa.

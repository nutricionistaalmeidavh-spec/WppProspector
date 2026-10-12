# WppProspector — núcleo autohospedado P0

## Fonte canônica e proveniência

O repositório canônico é `nutricionistaalmeidavh-spec/WppProspector`. Não fazer merge integral dos repositórios históricos.

Fontes avaliadas:
- `Marcoslima016/wpp_prospector_bot`, branch `develop` (conectividade Baileys, gestão de sessões e fila de teste).
- `Marcoslima016/wpp_prospector_bot_panel` (painel já consolidado).
- `nutricionistaalmeidavh-spec/utilidades` (launcher de WhatsApp **manual**, não equivalente a um gateway).
- `nutricionistaalmeidavh-spec/PDV-ARTISYS` (padrões de outbox SQLite).
- `nutricionistaalmeidavh-spec/automa-ooublicacao` (referência de retries/agendamento).

O projeto antigo do Marcos declara `UNLICENSED`. A implementação do adaptador neste repositório deve ser original, inspirada na interface pública e na documentação da biblioteca Baileys; não copiar código proprietário de origem sem autorização formal dos coautores.

## Política de custo

O modo padrão é `WHATSAPP_PROVIDER=baileys` com regras locais `LLM_PROVIDER=rules`. O software não depende de serviços comerciais nem usa chaves pagas sem configuração explícita.

Meta Cloud API e Anthropic são conectores opcionais. Baileys usa uma integração **não oficial**: auto-hospedagem não garante ausência de bloqueios, suporte oficial, gratuidade de infraestrutura/hardware ou conformidade da conta.

## Segurança e dados

- Credenciais Baileys permanecem fora do Git e requerem diretório privado (permissão de arquivo local do sistema).
- Campanhas/prospecção somente para números com consentimento registrado e sem opt-out.
- O processamento de webhook deve confirmar eventos apenas depois de persistência durável (evolução adicional necessária).
- A outbox garante recuperação/retries, mas não exatamente-uma-vez no transporte externo; uma queda entre entrega e confirmação remota pode causar duplicidade.
- Fazer backup consistente do SQLite/WAL e dos JSONs de conversas; armazenar chaves de sessão separadas e criptografar o backup em repouso.
- Para produção, limitar acesso ao painel com rede privada e TLS. O cookie de sessão sozinho não substitui autenticação forte.

## Instalação do conector local

O repositório não inclui a biblioteca Baileys no lockfile principal: ela só é carregada dinamicamente no modo local, para manter o pipeline histórico com `npm ci` intacto. Instale a dependência open-source no workspace do servidor:

```sh
npm ci
cd apps/server
npm install --no-save --package-lock=false --workspaces=false baileys@6.7.24 pino@9.14.0 qrcode-terminal@0.12.0
cd ../..
npm run build
npm start
```

O gerenciador aceita até cinco sessões (`BAILEYS_SESSION_IDS=principal,secundaria`), cada uma em diretório de autenticação separado. Por segurança, mensagens de saída são enviadas somente pelo número principal; o mapeamento multioperador/multinúmero por conversa fica para a etapa de gestão. O gateway local recebe texto em chats 1:1 e exibe QR no terminal. Não há suporte completo a mídia, grupos e LID nesta fase. A inclusão de Baileys no lockfile canônico deve ser feita antes da distribuição final do instalador; o comando acima é uma etapa temporária explícita, nunca um serviço pago.

## Operações

As rotas `/admin/api/contacts/:phone/consent` (POST com `source`), `/admin/api/contacts/:phone/opt-out` (POST) e `/admin/api/connection` (GET) exigem sessão administrativa. O envio de templates exige autorização persistida; solicitações de parada recebidas são registradas na lista de supressão.

Para backup manual seguro, encerre o servidor antes de copiar `apps/server/data/app.db` e `apps/server/data/conversations`. Use `node scripts/backup-selfhost.mjs --server-stopped --dest /caminho/seguro`; credenciais exigem `--include-keys` explícito. Criptografe e proteja os backups. O script não verifica processos ativos.

## Critérios de aceite

1. `npm run check` e `npm run test:smoke` completos.
2. Boot sem Meta/Anthropic no modo local e sem envio remoto durante testes.
3. QR code + conexão + envio/recebimento de teste manual em número autorizado (não automatizar pareamento real na CI).
4. Testes de opt-out, recuperação do estado e reprocessamento após falhas.
5. `main` intocada até revisão do PR e CI satisfatória.

## Estado inicial

A integração Meta/Anthropic e o pipeline existente ficam preservados. Funcionalidades que dependam de gateway não-oficial devem ser consideradas experimentais até teste manual com uma conta de desenvolvimento autorizada.

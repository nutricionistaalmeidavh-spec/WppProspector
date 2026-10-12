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

## Critérios de aceite

1. `npm run check` e `npm run test:smoke` completos.
2. Boot sem Meta/Anthropic no modo local e sem envio remoto durante testes.
3. QR code + conexão + envio/recebimento de teste manual em número autorizado (não automatizar pareamento real na CI).
4. Testes de opt-out, recuperação do estado e reprocessamento após falhas.
5. `main` intocada até revisão do PR e CI satisfatória.

## Estado inicial

A integração Meta/Anthropic e o pipeline existente ficam preservados. Funcionalidades que dependam de gateway não-oficial devem ser consideradas experimentais até teste manual com uma conta de desenvolvimento autorizada.

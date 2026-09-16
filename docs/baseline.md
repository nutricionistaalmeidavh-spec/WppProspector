# Baseline de Migração — 2026-09-04

| Componente | Origem | Branch | Commit fixado |
| --- | --- | --- | --- |
| Server + bot runtime | `Marcoslima016/wpp_prospector_bot` | `feature/refinamento_bot` | `464e5dcb1cef198721e1db3c46cc48500ae02d0d` |
| Panel | `Marcoslima016/wpp_prospector_bot_panel` | `feature/leads_import_and_start_chat` | `03ac11773d9bc2c2d541dbdda8cf33d0db6bad76` |
| Destino inicial | `nutricionistaalmeidavh-spec/DesignUIWPPBoot` | `main` | `7e41b1ba5f6af07bf841b994718b4c6497ad1517` |

## Decisão de baseline

O branch `feature/refinamento_bot` é utilizado porque contém, numa única linha evolutiva, o servidor Fastify, WhatsApp Cloud API, conversation engine, management API, persistência, métricas, importação/prospecção de leads e as especificações OpenSpec atuais.

Para o painel, `feature/leads_import_and_start_chat` é o baseline correto porque está alinhado aos contratos atuais do servidor e já inclui o fluxo funcional de Leads — listagem, filtros, importação, seleção, disparo e reset de prospecção. O `main` do painel estava anterior a essa integração.

Os repositórios de origem são somente leitura nesta migração. Todas as alterações são feitas em `DesignUIWPPBoot`.

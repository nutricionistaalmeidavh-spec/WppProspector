# QA visual do CRM

A workflow `QA — painel real e capturas Playwright` valida uma instalação local e registra screenshots do código em execução.

## Executar
- Na aba Actions, abra **QA — painel real e capturas Playwright** e clique **Run workflow** depois que este workflow existir na branch principal.
- Ou abra/atualize uma PR que contenha o workflow. O pipeline aceita PRs para `main` e `feat/crm-commercial-pack-20261111`.
- Acesse o run concluído e baixe o artifact `wpp-prospector-qa-telas-*` com PNGs desktop/mobile e `report.json`.

## Escopo
Executa `npm run check`, `npm run test:smoke` e abre o build real em Chromium/Playwright. Os dados são exclusivamente fictícios, em banco SQLite efêmero, sem ligações a contas Meta, Anthropic ou WhatsApp de produção. O job acusa falha quando houver erros, mas preserva as imagens geradas até a etapa do erro.

## Limitação
Capturas reais representam o commit testado, **não** uma demonstração da integração externa com WhatsApp nem homologação em conta real. GitHub-hosted Actions respeita as franquias de uso da conta; o software principal permanece self-hosted e sem dependência de serviço comercial.

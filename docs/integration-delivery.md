# Integração UI + servidor — WppProspector

## Origem preservada

- UI e monorepo: `nutricionistaalmeidavh-spec/DesignUIWPPBoot`, branch `ui/priority-fixes-2026-09-05`, commit `827df7adfb19ba77239bd0cf3969708ebe758f3f`.
- Servidor de referência: `Marcoslima016/wpp_prospector_bot`, branch `feature/refinamento_bot`, commit `464e5dcb1cef198721e1db3c46cc48500ae02d0d`.
- A comparação inicial encontrou 199 dos 200 arquivos de `src` do servidor idênticos em `apps/server`; a diferença era um teste de knowledge-loader. Foi preservada a versão integrada da UI.
- Os 469 arquivos da branch da UI foram copiados, incluindo documentação, especificações, conhecimento comercial e a planilha de apoio. Os repositórios de origem não foram alterados.

## Ajustes de integração

1. Painel e API no mesmo processo/origem, em `/admin/` e `/admin/api`.
2. Caminho padrão da SPA corrigido para `../panel/dist`.
3. Scripts na raiz para iniciar o servidor com `.env` da raiz (ou o legado em `apps/server/.env`). Caminhos relativos de dados continuam relativos a `apps/server`.
4. Build copia prompts Markdown e migrations SQL, além do JavaScript compilado.
5. Detecção do entrypoint compatível com caminhos Windows e espaços.
6. Histórico completo com filtros preservado em `/admin/conversations/history`, acessível pela Inbox. Testes antigos atualizados para a navegação/textos existentes.
7. `HOST` configurável, mantendo o padrão anterior `0.0.0.0`; o smoke test usa somente loopback.
8. CI preservado com acionamento manual, sem disparar GitHub Actions nesta entrega.

Meta Cloud API, Anthropic, modelos, prompts, templates, regras de negócio, contratos e dados persistidos não foram substituídos. Não foi introduzido Baileys.

## Verificação reproduzível

```sh
npm ci
npm run check
npm run test:smoke
```

- Contratos compartilhados sincronizados; lint e typecheck.
- 503 testes do servidor, 59 do painel e 2 testes de empacotamento/inicialização.
- Build completo de servidor e painel.
- Smoke HTTP sobre o build real: assets, fallback SPA, rejeição de acesso sem sessão, login, cookies protegidos, capabilities, conversas, visão geral, consumo, importação e persistência após reinício, logout e 404 da API.
- Smoke usa somente dados temporários e credenciais fictícias; não envia mensagens nem chama a IA.

## Limites preservados

- Telas de empresas/oportunidades/campanhas que dependiam de capabilities continuam condicionadas ao suporte do servidor. Os previews existentes não viraram funcionalidades novas nesta integração.
- O build gera aviso de bundle acima de 500 kB (não é erro); divisão de bundle fica fora desta entrega.
- Envio real, recebimento do webhook Meta e respostas Anthropic precisam ser confirmados no ambiente final com o `.env` do operador.
- Nenhum `.env` real, banco ou histórico de clientes foi copiado dos servidores de produção.

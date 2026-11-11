# WppProspector — gate de comercialização do código-fonte

## Requisitos obrigatórios antes de entregar a um comprador

1. Confirmar a cadeia de titularidade/licenças de todos os arquivos importados e dependências, além da declaração do mantenedor. Incluir licença e NOTICE no pacote.
2. \`npm ci && npm run check && npm run test:smoke\` aprovados no SHA da entrega em GitHub Actions.
3. Instalação limpa Node 24 via \`npm run setup:selfhost\` e acesso ao painel sem utilizar chaves de serviços comerciais.
4. Validar com um número de desenvolvimento autorizado o pareamento Baileys, recebimento, handoff, opt-out, reconexão e não duplicação de mensagens após falhas.
5. Confirmar HTTPS/rede privada, política de cookies, backups restauráveis (SQLite WAL + JSON), permissões de arquivos e remoção de segredos e dados reais de qualquer pacote.
6. Validar PWA/mobile e desktop com dados fictícios robustos, testes de conversão, orçamentos idempotentes e atividades.
7. Conferir o checklist de LGPD (base legal, consentimento, retenção, exclusão quando aplicável) e a documentação de suporte.
8. Emitir tag/artefato imutável, checksum SHA-256 e instruções de atualização e recuperação.

## Limites comerciais

- Modo local Baileys é não oficial e não deve ser anunciado como plataforma oficial da Meta.
- \`WHATSAPP_PROVIDER=meta\` é opcional e pode ter custos externos.
- \`LLM_PROVIDER=rules\` é o núcleo gratuito. Anthropic é opcional e pode ter cobrança.
- Orçamentos do CRM são locais: **não** cobram, emitem nota ou alteram o financeiro do ERP.
- A conclusão de uma atividade não dispara mensagem sem consentimento ou ação separada.
- Não declarar homologação real de conexões externas apenas com testes de unidade.

## Entrega de código-fonte

Entregar a tag revisada com \`LICENSE\`, \`NOTICE.md\`, \`.env.example\`,
README, migrations, testes, instruções de instalação/backup e lista das
limitações. Nunca incluir \`.env\`, tokens, banco, históricos, sessões ou chaves.

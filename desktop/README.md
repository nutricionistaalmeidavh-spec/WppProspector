# WppProspector CRM — versão desktop de avaliação

O instalador para Windows 64 bits encapsula o painel React, servidor Node.js 24 e SQLite no Electron. A execução é local (loopback); o cliente não precisa instalar Node ou Docker, nem receber `.env` do desenvolvedor. O banco e as credenciais de WhatsApp são guardados na pasta de dados do usuário, fora do diretório do aplicativo, e sobrevivem a atualizações e desinstalações comuns.

## Licenciamento

A partir do instalador **0.1.3**, a ativação de avaliação também aceita um código alfanumérico de **16 caracteres**. O código do lote é criado com 80 bits de aleatoriedade, e somente seu compromisso SHA-256 fica versionado e no instalador, nunca o código aberto. A verificação é offline, sem API externa, e expira em **25/11/2026, 22:33:02 UTC (19:33:02 Brasília)**, mesmo que a instalação seja posterior. O código pode ser copiado para outra máquina; não há vinculação ao dispositivo ou revogação offline, e novas emissões exigem atualizar a lista de hashes no app e distribuir outra build. Não use códigos curtos previsíveis.

O novo mecanismo **não invalida licenças anteriores**:

A ativação aceita códigos `WPP1.<payload>.<assinatura>` assinados com Ed25519. **Somente a chave pública fica no repositório e no instalador.** A chave privada deve ser guardada offline pelo proprietário; não adicioná-la ao GitHub Secrets nem a qualquer pacote distribuído. Para gerar nova avaliação (14 dias):

```sh
node desktop/issue-license.mjs --key=/caminho/seguro/private.pem --days=14
```

A licença é conferida antes do servidor iniciar e novamente a cada minuto. Expirado o prazo, o CRM interrompe operações ao encerrar o processo do servidor, **sem apagar registros**. A ativação offline não impede cópias da licença entre dispositivos nem ataques de relógio/arquivos locais feitos por um usuário com controle total da máquina. Para licenças com revogação e limite por dispositivo, é necessário um serviço de validação explicitamente configurado (não incluso no core).

## Publicação

`.github/workflows/desktop-trial-release.yml` valida contratos, testes, smoke e assinatura, empacota em runner Windows e publica o `.exe` na Release `v0.1.5-trial` quando a main recebe alterações relevantes, publicando diretamente na Release mesmo se o serviço de artefatos do Actions estiver indisponível. Um PR só gera artefato de QA, **não publica**. A URL de instalação pode ser distribuída após o job de Release estar verde:

`https://github.com/nutricionistaalmeidavh-spec/WppProspector/releases/download/v0.1.5-trial/ArtiSys-WppProspector-Setup-0.1.5-x64.exe`

A release v0.1.5 inclui o onboarding com WhatsApp manual por padrão e motor automático opcional, validado com testes e aprovação explícita. O pipeline de release agora inicia o Node distribuído em Windows limpo, valida /admin/, login local e SQLite. Falhas de boot geram um arquivo local em %APPDATA%\\artisys-wppprospector-desktop\\logs\\desktop-boot.log (ou no userData definido pelo Electron), sem incluir códigos de licença ou credenciais locais.

O executável não possui certificado Authenticode. Não prometa ausência de alertas SmartScreen. Teste a instalação e a autenticação em Windows limpo antes de enviar a um cliente.

## WhatsApp (limitação conhecida)

Baileys é uma biblioteca open source **não oficial**. A central **Configurações > Conexões WhatsApp** exibe o QR no painel autenticado e permite selecionar/reconectar sessões. Antes de liberar o instalador a clientes, valide manualmente o pareamento e o envio/recebimento com um número autorizado. O CRM e a persistência local são testáveis com dados fictícios sem serviços externos. A Meta Cloud API e a Anthropic permanecem **opcionais**, sem tokens embutidos; a conexão oficial exige configuração privada e aprovação junto à Meta.

## Garantias e limites

Esta distribuição mantém a licença de código-fonte MIT e os avisos de terceiros. Uma licença de ativação regula o acesso ao pacote distribuído, mas não revoga os direitos concedidos pela licença de código-fonte. Aplicações JavaScript empacotadas não são equivalentes a código-fonte criptografado. Não distribuir bancos, históricos, tokens de sessão, arquivos `.env` ou chaves privadas em artefatos.
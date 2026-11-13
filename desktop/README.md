# WppProspector CRM — instalador comercial Windows

O instalador Windows x64 embute painel, servidor Node.js 24 e SQLite, sem exigir que o cliente instale Node ou Docker. Banco, contatos, sessões de WhatsApp e credenciais ficam na pasta de dados local do usuário, fora do executável; atualizações preservam esse diretório.

## Central de Licenças ArtiSys

O CRM usa o mesmo serviço do PDV ArtiSys e da Oficina: https://pdv-artisys.sistema-artisys.workers.dev/admin. O produto é WPPPROSPECTOR, independente de PDV e OFICINA.

1. Na Central, selecione ArtiSys CRM WhatsApp Prospector, informe o e-mail do comprador, deixe a validade vazia para licença vitalícia e escolha a quantidade permitida de PCs (padrão 3, de 1 a 20).
2. Gere o código de **6 dígitos**, válido por **48 horas** e **uso único**. O prazo do código não limita o prazo da licença.
3. No instalador, o cliente informa **e-mail + código**. O CRM registra uma identidade local única, a Central verifica o limite de PCs e cria uma ativação vinculada à licença.
4. A cada abertura e periodicamente, quando conectado, o app consulta o estado da instalação. Quando offline, uma instalação já validada continua localmente com recibo criptografado pelo Windows (Electron safeStorage/DPAPI).
5. Para trocar de computador, o vendedor entra na mesma Central e usa **Desativar PC**, depois **Reativar instalação** para gerar um código novo. O app desativado será bloqueado assim que conseguir consultar a Central.

A Central não armazena contatos, leads, conversas ou o banco operacional. O CRM não depende de serviços pagos ou de IA para gerenciar contatos manualmente; a ativação comercial inicial usa o Worker Cloudflare existente. Sem internet e sem uma ativação prévia válida, uma nova instalação não é liberada.

**Limitação de segurança:** uma desativação não pode ser aplicada imediatamente a um computador que permaneça totalmente offline; ela passa a valer na próxima verificação. O limite se refere a ativações, não a usuários simultâneos ou a um banco compartilhado. Cada instalador desktop usa SQLite local, portanto instalar em três PCs **não sincroniza dados automaticamente**. O compartilhamento de dados requer um servidor local central de CRM e clientes apontando para essa mesma instância.

## Compatibilidade com códigos anteriores

- Licenças curtas de avaliação de **16 caracteres** continuam aceitas e preservam o vencimento em **25/11/2026 às 19:33:02 de Brasília**.
- Licenças offline antigas assinadas WPP1.payload.assinatura continuam aceitas, com a política de validade do formato original.
- Não grave a chave privada de emissão em Git, GitHub Secrets, Cloudflare Worker ou instaladores.
- O arquivo de licença antigo não é removido; novas ativações da Central são armazenadas separadamente.

## Publicação e verificação

A versão comercial **0.1.6** preserva o mesmo appId do desktop para atualizar por cima. O workflow .github/workflows/desktop-trial-release.yml roda testes, build do servidor, teste do runtime Windows e empacotamento NSIS. A publicação ocorre na tag v0.1.6 somente após merge na main e CI verde:

https://github.com/nutricionistaalmeidavh-spec/WppProspector/releases/download/v0.1.6/ArtiSys-WppProspector-Setup-0.1.6-x64.exe

O URL só estará disponível depois da publicação efetiva da release. O instalador não possui assinatura Authenticode; o Windows SmartScreen pode exibir um alerta.

O WhatsApp via Baileys é uma integração não oficial e requer validação com conta autorizada; Meta Cloud API e provedores de IA são opcionais. As chaves de terceiros não são embutidas no instalador.

O código-fonte do projeto tem licença MIT; a ativação comercial do binário distribuído não altera os direitos já concedidos pelo código-fonte MIT.

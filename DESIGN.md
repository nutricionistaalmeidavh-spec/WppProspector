# WppProspector — direção de design

## Produto e público
CRM self-hosted de WhatsApp e e-commerce para administradores de empresas, com atendimento operacional para equipes. O usuário deve reconhecer a diferença entre *rascunho*, *teste* e *configuração ativa*.

## North Star
O administrador configura e valida o atendimento sem entender infraestrutura ou pagar por APIs. Uma alteração de conhecimento nunca muda o comportamento publicado até confirmação consciente.

## Linguagem visual
Preservar os tokens existentes em `apps/panel/src/index.css` (verdes funcionais, superfícies neutras, cantos 0.75rem, contraste de uso comercial). Não introduzir paleta paralela, novas fontes remotas ou componente que pareça uma landing page. Layout responsivo desktop-first com controles acessíveis também em smartphone.

## Hierarquia
1. Visão geral com motor ativo, estado do rascunho e próxima etapa;
2. Etapas da Central: empresa, conhecimento, regras, inteligência, laboratório, e-commerce, versões;
3. Ações distintas: salvar rascunho, testar, publicar/ativar e restaurar;
4. Dados financeiros e credenciais somente em telas de administração.

## Componentes canônicos
Reutilizar `PageHeader`, `Card`, `Button`, `Input`, `Label` e tokens CSS. As interações de CRUD têm feedback inline e botão com estado ocupado. A navegação existente e o breadcrumb da aplicação devem permanecer operacionais. Ícones Lucide existentes; sem efeitos decorativos não funcionais.

## Limites visuais
Sem animações distrativas, sem glassmorphism impeditivo de contraste, sem campos de segredo em texto claro, sem API paga pré-selecionada. Manter modo escuro e preferências da instalação.

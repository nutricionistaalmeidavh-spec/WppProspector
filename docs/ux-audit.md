# Auditoria UX — checkpoint antes de alterar UI

## Princípio

O painel já entrega os fluxos centrais de gestão — Conversas, Leads/Prospecção e Consumo — e deve ser tratado como produto funcional. O problema principal agora não é ausência de funcionalidade básica, e sim transformar módulos técnicos em uma experiência operacional clara para gestor e SDR sem reescrever o que já funciona.

## P0 — bloqueios de experiência do produto

### Não existe visão operacional inicial

Depois do login, a aplicação redireciona diretamente para Conversas. Falta uma visão que responda em poucos segundos:

- o bot está operando normalmente?;
- há conversas aguardando intervenção?;
- quantos leads estão pendentes, enviados, respondidos ou falharam?;
- houve falhas de prospecção?;
- qual o consumo recente?;
- onde o usuário deve agir agora?

**Próxima fase:** criar um dashboard inicial orientado a decisão e exceções, não uma coleção de cards decorativos.

### A arquitetura de informação não conecta o funil inteiro

Leads, Conversas e Consumo existem como áreas separadas, mas o usuário precisa perceber um fluxo único:

`lead importado → prospectado → respondeu → conversa em andamento → intervenção/handoff → resultado`.

Hoje a UI expõe as etapas, porém não cria continuidade suficiente entre elas.

**Próxima fase:** desenhar navegação e vínculos contextuais entre Leads e Conversas antes de alterar componentes.

## P1 — alto impacto na operação

### Conversas devem funcionar como inbox priorizada

A listagem é funcional, mas a próxima experiência deve tornar prioridade visível sem abrir cada item: estado, intenção, última atividade, pendência, resposta aguardando humano e demais sinais acionáveis.

### Leads já funciona, mas precisa comunicar melhor o progresso

A tela atual já permite importação, filtros, seleção, disparo em lote, paginação e reset. O redesign deve preservar essas funções e melhorar:

- leitura dos estados de prospecção;
- resultado da importação e rejeições;
- diferença entre selecionado, elegível e já prospectado;
- resultado do disparo em lote, inclusive falhas parciais;
- passagem de um lead respondido para a conversa correspondente;
- visão do avanço do lote/funil.

### Ações manuais precisam de feedback de consequência

Handoff, retomada do bot, mensagem manual, disparo e reset são ações operacionais importantes. A UI futura deve deixar explícitos estado em andamento, sucesso, erro, impacto e estado resultante.

### Erro de backend e sessão expirada precisam ser diferenciados

O bootstrap de autenticação consulta overview para determinar o estado inicial. Uma indisponibilidade de backend não deve parecer simplesmente uma sessão inválida. A experiência futura deve separar 401/sessão expirada de erro de rede, contrato ou servidor.

### Capabilities não devem mascarar falha operacional

`getCapabilities` atualmente converte qualquer erro em `null`, o que ajuda compatibilidade com deploys antigos, mas pode tornar indisponibilidade do backend indistinguível de capability ausente. O redesign deve apresentar indisponibilidade de forma diagnosticável.

### Consumo precisa responder perguntas de negócio

A tela deve relacionar custo com atividade operacional: período, conversas, mensagens, LLM, mensageria, tendência e eventuais dados parciais. O objetivo não é apenas exibir números, mas ajudar o gestor a entender custo por operação e desvios.

## P2 — refinamento e qualidade

- padronizar skeleton/loading entre módulos;
- estados vazios sempre com próxima ação clara;
- mensagens de erro recuperáveis e específicas;
- responsividade mobile sem reduzir eficiência no desktop;
- foco visível, navegação por teclado, labels e contraste acessíveis;
- consistência de nomenclatura entre OpenSpec, API e interface;
- reduzir cliques repetitivos do operador;
- revisar densidade das tabelas/listas em desktop;
- dividir o bundle do painel: o build atual gera um chunk JS principal acima de 1 MB minificado;
- corrigir warnings `act(...)` dos testes de autenticação para manter a suíte limpa;
- planejar atualização do Recharts 2.x, que está em linha descontinuada.

## Fluxos que devem guiar o redesign

1. **Gestor:** entrar → entender saúde/volume/custo → localizar exceções → agir ou delegar.
2. **SDR/operador:** entrar → ver conversas prioritárias → abrir contexto → assumir/responder/retomar.
3. **Prospecção:** importar → revisar resultado → filtrar/selecionar → disparar → acompanhar enviados/falhas/respostas → abrir conversa.
4. **Diagnóstico:** perceber falha/capability indisponível → saber se é configuração, sessão, backend ou operação → recuperar.

## Evidência técnica do checkpoint

Na migração consolidada foram executados com sucesso lint, typecheck, testes e build:

- servidor: 72 arquivos de teste, 503 testes aprovados;
- painel: 12 arquivos de teste, 42 testes aprovados;
- build TypeScript do servidor aprovado;
- build de produção Vite do painel aprovado.

Avisos não bloqueantes registrados para a próxima etapa técnica:

- `npm audit` reportou 1 vulnerabilidade de severidade alta a ser triada sem atualização cega de dependências;
- Recharts 2.x está descontinuado;
- bundle principal do painel está acima do limiar de 500 kB;
- testes de fluxo de autenticação passam, mas emitem warnings de `act(...)`.

## Limite deste checkpoint

Nenhum componente visual, CSS, layout ou fluxo foi redesenhado nesta auditoria. O próximo passo é abrir uma mudança OpenSpec específica para a nova experiência do dashboard e dos fluxos operacionais, usando este mapa como baseline.

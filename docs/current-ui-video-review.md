# Baseline visual do painel — vídeo 2026-09-04

## Evidência analisada

Vídeo de aproximadamente 61 segundos mostrando o painel atual em uso no navegador local. Esta revisão registra somente o estado atual para orientar arquitetura e próximo redesign; nenhuma alteração visual é aplicada na Fase 9.

## Linguagem visual atual

O painel é um dashboard administrativo minimalista e funcional:

- fundo branco quase integral;
- barra superior horizontal fina;
- marca textual **Gestão do Bot**;
- navegação textual **Conversas / Leads / Consumo**;
- ação **Sair** no extremo direito;
- conteúdo central em largura limitada;
- bordas cinza finas;
- tipografia pequena;
- controles compactos;
- tabelas como principal estrutura de informação;
- pouco uso de cor e pouca diferenciação de níveis de prioridade.

É uma interface de ferramenta interna: baixa ornamentação, alta densidade de dados e foco em funcionar.

## Conversas

A tela exibida no início do vídeo confirma:

- filtros por estado;
- intent;
- trecho de telefone;
- intervalo de última atividade;
- tabela com telefone, estado, intent, qualificação, turnos, última atividade e inbound.

A tela tem bastante espaço vazio quando há poucos registros. O registro é clicável para acessar o detalhe.

### Detalhe da conversa

O vídeo mostra três blocos principais:

1. resumo do lead/conversa;
2. ações operacionais;
3. linha do tempo.

No resumo aparecem informações como intent, plano citado, módulos/interesses, qualificação, turnos e atividade. Nas ações há controles para assumir/retomar atendimento e enviar mensagem manual na janela permitida. A timeline apresenta eventos inbound/outbound em blocos empilhados.

**Implicação arquitetural:** ownership humano/bot, prioridade operacional e estado da conversa precisam ser first-class no read model da futura inbox.

## Leads

A tela de Leads é uma tabela extensa com:

- seleção por checkbox;
- nome/empresa;
- telefone;
- segmento;
- cidade;
- estado da prospecção;
- primeiro contato;
- ações.

O vídeo demonstra o fluxo real de importação:

`Importar planilha → selecionar .xlsx → preview das linhas → importar → confirmação de conclusão`.

Isso confirma que a prospecção já existe funcionalmente; o problema não é criar uma tela de leads do zero.

**Implicação arquitetural:** a operação hoje trata prospecção como ação sobre leads. Para o redesign, o backend deve oferecer o conceito de **Campanha/Execução**, permitindo agrupar audiência, progresso, falhas e resultados sem perder o cadastro de Leads já existente.

## Consumo

A tela de Consumo confirma:

- cards de contadores do estado atual;
- seleção de período (hoje/7 dias/30 dias/personalizado);
- alternância de agrupamento;
- gráfico de custo estimado;
- tabela/resumo do período.

Com poucos dados, a tela fica visualmente muito vazia.

**Implicação arquitetural:** consumo deve continuar sendo uma capability analítica, mas a futura visão geral não deve obrigar o gestor a entrar em Consumo para descobrir saúde ou exceções da operação.

## Pontos fortes preserváveis

- fluxos essenciais já estão implementados;
- tabelas são adequadas para trabalho operacional de desktop;
- filtros já refletem necessidades reais;
- importação de planilha é direta;
- detalhe da conversa possui contexto suficiente para ação;
- interface tem baixa carga visual e boa previsibilidade básica.

## Problemas que o redesign deverá resolver

1. **Não existe home operacional.** Login leva diretamente a Conversas.
2. **Navegação reflete módulos técnicos**, não o ciclo de trabalho comercial.
3. **Hierarquia visual é fraca.** Dados críticos e secundários têm peso semelhante.
4. **Prioridade operacional não aparece claramente.** A inbox não destaca o que exige ação agora.
5. **Prospecção não tem conceito visual de campanha.** Importação, seleção e disparo ficam presos à lista de Leads.
6. **Muito espaço vazio em estados com poucos dados**, sem usar esse espaço para guidance, saúde ou próxima ação.
7. **Ações importantes ficam dispersas no detalhe**, sem uma leitura clara de ownership e consequência.
8. **Consumo é tecnicamente correto, mas pouco orientado à decisão.**

## Direção para a próxima UI

A arquitetura de informação deverá sair de:

```text
Conversas | Leads | Consumo
```

para uma estrutura centrada na operação, sem exigir que todos os módulos sejam criados de uma vez:

```text
Visão geral
Prospecção
  ├─ Leads
  └─ Campanhas
Conversas / Inbox
Analytics
Configurações
```

O vídeo será tratado como baseline visual de comparação: o redesign deve preservar as funcionalidades observadas e reduzir fricção, não simplesmente trocar cores ou aumentar cards.

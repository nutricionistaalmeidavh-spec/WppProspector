# Primeiro acesso guiado do WPP CRM (P0–P2)

## Rotas e fluxo

- `/admin/onboarding`: wizard de 5 etapas, acessível a administradores; se não existir perfil da loja, o primeiro acesso administrativo dirige à configuração.
- `/admin/overview?tour=1`: tour contextual por navegação, com salvar/prosseguir/voltar/pular.
- `/admin/onboarding/first-operation`: exercício guiado que cria **registros reais somente após confirmação do usuário**, reutilizando lead, empresa e oportunidade canônicos.
- `/admin/settings/onboarding`: indicadores locais (apenas admin) e progresso das etapas.
- `/admin/settings`: retomar assistente, refazer tour e acessar métricas.

## Persistência e permissões

Migration `0019_crm_onboarding.sql` adiciona tabelas apenas para progresso, histórico de tour e referências de primeira operação. O perfil comercial permanece em `business_profile`, leads em `leads`, empresas em `crm_companies` e oportunidades em `crm_opportunities`.

A configuração de loja e métricas exigem admin. Operadores podem salvar apenas o próprio tour e progresso da primeira operação. As rotas usam o cookie de sessão já existente e o guard de autenticação. Progresso de setup pertence à instalação; tour pertence ao operador.

O wizard não ativa disparos, não cria bases de demonstração nem cadastra produtos fictícios. Etapas de conexão WhatsApp e IA podem ser adiadas; toda conexão pela Meta e toda API comercial dependem de autorização/configuração explícita. Recomendações de segmentos **não** alteram silenciosamente o funil nem criam regras. A instalação continua funcional no modo local, com custo obrigatório R$ 0.

## Estados de recuperação

O progresso de cada etapa é salvo pelo servidor. Falhas exibem motivo e conservam valores já digitados. A primeira operação registra cada checkpoint (lead, empresa e oportunidade) e, ao retomar, consulta os registros canônicos antes de inserir novos objetos. O backend só confirma conclusão após verificar o vínculo oportunidade–lead no SQL. Replicar a conclusão da mesma operação é idempotente.

## Testes

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:smoke` e o CI de Docker self-hosted. Testes automatizados de backend cobrem autenticação, validação, persistência, checkpoint e vínculo canônico. O teste React cobre perfil, avanço e acesso à retomada. Verificar manualmente em diferentes viewports, teclado e leitor de tela antes da publicação.

## Limitações intencionais

- O tour destaca locais da navegação mas não executa automações por conta própria.
- Modelos setoriais são sugestões revisáveis, não uma configuração ativa de vendas.
- Os indicadores medem apenas a instalação local; não são uma plataforma externa de telemetry.
- A API oficial da Meta pode cobrar pelo uso, mas não é exigida pelo onboarding nem pelo núcleo do CRM.

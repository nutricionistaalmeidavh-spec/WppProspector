# Motor de Regras / Inteligência Artificial — configuração de cada empresa

## Acesso
No CRM: **Configurações → Motor de Regras / Inteligência Artificial** (somente administradores).
O cadastro inclui nome/segmento/descrição da loja, horário, meios de pagamento, políticas,
produtos/serviços e preços, FAQ e orientações opcionais. É persistido no SQLite **da própria instalação**.

## Modos de funcionamento
- **Motor de regras (padrão, R$ 0):** 100% local, determinístico, sem chamadas externas.
  Consulta diretamente as informações atuais da loja no SQLite. Responde a perguntas de catálogo,
  preços, horários, pagamentos, trocas e entregas; transfere a uma pessoa quando a informação falta.
  Regras de atendimento configuradas em **Automações** continuam prioritárias.
- **Anthropic (opcional):** o administrador insere sua chave e escolhe um modelo compatível.
- **OpenAI (opcional):** o administrador insere sua chave e escolhe um modelo compatível com Chat Completions e saída JSON estruturada.

Não há chave, créditos nem plano de API incluídos. **Salvar uma chave e ativar um provedor pago**
é uma escolha explícita do administrador; chamadas a esses provedores podem gerar custos próprios.
Codex como agente de programação não é um provedor específico deste motor.

## Privacidade e isolamento
- A API HTTP nunca devolve o valor da chave. O navegador envia a chave somente no formulário de configuração.
- O backend cifra a chave com AES-256-GCM no SQLite. A chave mestra é gerada localmente em
  `.ai-credentials-key` ao lado do banco, com permissão de arquivo restrita.
- Se desejar, configure `AI_CREDENTIALS_KEY` como **64 caracteres hexadecimais** no ambiente
  do servidor; nesse caso a chave do ambiente prevalece. Não versionar nem colocar a chave no instalador.
- Ao efetuar backups, guarde o SQLite e o arquivo `.ai-credentials-key` (ou o segredo privado configurado)
  em local seguro. Sem a chave correspondente, as chaves de API salvas não poderão ser descriptografadas.
- O backend consulta a empresa do banco em cada turno; alterações no catálogo entram em vigor sem
  reiniciar a aplicação. O motor gratuito nunca usa informações de outras lojas.
- Arquivos históricos sobre Obra na Mão/FluxoDRE, usados pelos testes de código, não são
  copiados para `dist/` nem para o runtime do instalador.
- As migrações são aditivas: leads, conversas, campanhas, banco e licenciamento permanecem intactos.
- As configurações são por **instalação**, não por um modelo multiempresa/tenant compartilhado.
  Não usar um único banco para armazenar dados de várias lojas independentes.

## Limitações explícitas
O motor gratuito utiliza correspondência de termos e intenções; não é um modelo de linguagem,
não interpreta linguagem natural livre como um LLM e não tem consulta a estoque em tempo real.
Para uma resposta que não esteja cadastrada, encaminha ao atendimento humano sem inventar.
A disponibilidade de modelos e cobranças dos provedores externos depende de cada fornecedor.

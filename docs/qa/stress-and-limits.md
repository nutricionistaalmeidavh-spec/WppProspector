# QA de estresse, exaustão e limites — WppProspector CRM

Esta suíte mede **integridade sob carga sintética**, não a capacidade real de uma instância de produção. É executada somente contra objetos em memória, SQLite efêmero (ou arquivos temporários) e Fastify `inject`. Não acessa WhatsApp, Meta, IA externa, bancos de clientes ou URLs públicas. Core: Node.js 24 + Vitest já presentes no repositório. Sem ferramentas comerciais obrigatórias.

## Perfis e execução

```bash
npm ci
STRESS_PROFILE=smoke npm run test:stress -w wpp_prospector_bot_server
STRESS_PROFILE=standard npm run test:stress -w wpp_prospector_bot_server
STRESS_PROFILE=exhaustion npm run test:stress -w wpp_prospector_bot_server
```

- **smoke**: em toda PR para `main` — limite superior de 2.000 tarefas de fila, 700 mensagens recebidas (com 20% de reentregas), 2.000 avaliações do motor, 1.000 jobs/journal, 120 oportunidades, 300 conversas paginadas e 60 acessos concorrentes.
- **standard**: em toda PR para `main` e disponível manualmente — 12.000 tarefas, 3.000 mensagens, 12.000 avaliações, 5.000 jobs, 500 oportunidades, 1.000 conversas e 250 acessos.
- **exhaustion**: em toda PR para `main` e disponível manualmente — 60.000 tarefas, 10.000 mensagens, 60.000 avaliações, 25.000 jobs, 2.500 oportunidades, 3.000 conversas e 900 acessos.

Arquivo do workflow: `.github/workflows/stress-qa.yml`. Todas as PRs executam os três perfis em matriz. Após a inclusão do workflow na branch padrão, em **Actions → CRM Stress & Limits QA → Run workflow**, pode-se repetir um único perfil. Também é possível executar localmente sem GitHub. A execução tem limite de 45 minutos e heap máximo de 3 GiB no runner.

## O que é garantido pelos testes

1. **Fila serial por telefone:** uma tarefa ativa por lead; trabalho paralelo entre leads; ordem preservada; falhas sintéticas não bloqueiam a fila nem apagam tarefas.
2. **Webhook/inbound:** múltiplas mensagens por lead são agrupadas; a reentrega do mesmo ID não duplica os turnos; mensagens de leads diferentes permanecem isoladas.
3. **Motor de regras:** prioridade da política de atendimento humano e descadastro sobre regras comerciais; decisões com 120 regras; nenhum custo de LLM externo.
4. **SQLite e CRM:** `INSERT OR IGNORE` contra reentregas; limite de retirada de 100 jobs da outbox; reivindicação idempotente; recuperação após interrupção; WAL após restart; integridade referencial e canonicidade do vínculo lead/empresa/oportunidade.
5. **HTTP:** paginação completa em grandes bases, fronteiras 100/101 da listagem, sessão obrigatória sob acessos concorrentes, erro 413 para payload maior que 1 MiB, ausência de respostas HTTP 5xx inesperadas.

## Como interpretar resultados

As linhas `STRESS_METRIC` exibem volume, duração, operações por segundo, heap e — nas chamadas HTTP — p50/p95/p99 de latência. O workflow anexa o `stress.log` para comparação entre execuções. **Não compare operações por segundo de `Fastify.inject` com usuários reais;** a execução não envolve rede, proxy, autenticação federada, Baileys, provedores externos ou saturação de disco real.

**Critério de aprovação automático:** nenhuma perda ou duplicação não prevista, integridade canônica, ordenação correta, isolamento por lead, sessões protegidas, recuperação após crash e códigos de erro corretos. Não há SLA numérico de p95 sem baseline documentado em hardware controlado. Os perfis maiores são ensaios de limite, não compromissos de capacidade de produção.

## Ensaios adicionais antes de comercializar como alta capacidade

- Repetir em Docker com a configuração de CPU/RAM/disco do cliente e **somente** uma instância local de QA.
- Medir 30–60 minutos de carga sustentada e o ponto de degradação (p95, erro, RSS, CPU, WAL, disco).
- Simular indisponibilidade de rede, falha de disco, quota cheia, cancelamento, backup/restauração e reinício durante envio, sem usar sessões de WhatsApp reais.
- Determinar limites de taxa e backpressure antes de prometer quantos atendimentos simultâneos o CRM suporta.

**Importante:** persistência da outbox é semântica *at-least-once*, não garantia de entrega única externa; provedores podem receber uma operação novamente se o processo falhar após o envio e antes do ACK. Nunca apresentar deduplicação local como exatamente-uma-vez no WhatsApp.

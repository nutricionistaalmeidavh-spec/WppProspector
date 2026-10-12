# P1 — Automação de conversas (conector independente)

Escopo:
- Regras determinísticas configuradas pelo painel e persistidas em SQLite, com prioridades.
- Gatilhos `equals`, `contains`, `starts_with`, com comparação normalizada (acentos, caixa).
- Ações `reply`, `handoff` e `menu` com opções de resposta simples e contexto por telefone, expiração em 24h.
- Templates de texto editáveis nas regras e em follow-ups.
- Agendamento manual de follow-ups com `dueAt` ISO UTC, até 30 dias, exigindo consentimento.
- Em qualquer resposta recebida, cancelamento dos follow-ups pendentes.
- Scheduler local (SQLite + polling), retries limitados, preservando o transporte configurado.
- Painel React mobile-first em rota `/automations`, sem dependências comerciais.

Segurança:
- Não iniciar campanhas por conta própria nem enviar follow-up para contatos sem consentimento.
- Sem bypass de restrições da Meta: follow-up em janela indisponível poderá falhar e deve ser revisado.
- `opt_out` tem precedência sobre o motor de automações.
- Evitar registros de texto/telefone em logs operacionais.
- Cada envio pode ser reprocessado após falhas de confirmação; at-least-once, não exatamente uma vez.

Critério de aceite: testes unitários + integrações HTTP + UI build + smoke em CI, sem pareamento real automatizado no GitHub Actions.

-- A instalação nova deve receber e armazenar WhatsApp sem mandar mensagens automáticas.
-- Não altera o comportamento de instalações já operacionais ou de decisões já tomadas.
INSERT INTO onboarding_setup_steps(step,status,updated_at)
SELECT 'rules','pending',strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE NOT EXISTS (SELECT 1 FROM onboarding_setup_steps)
  AND NOT EXISTS (SELECT 1 FROM business_profile)
  AND NOT EXISTS (SELECT 1 FROM leads)
  AND NOT EXISTS (SELECT 1 FROM automation_rules)
  AND NOT EXISTS (SELECT 1 FROM conversation_index);

# QA visual automatizado — WPP CRM

Workflow: .github/workflows/visual-qa.yml (em PR e via acionamento manual). Não faz merge, deploy público ou publicação de release.

## Execução verificável

- Compila o React/Vite e o backend Fastify reais (`npm run build`).
- Inicia o processo real em 127.0.0.1:3202 com SQLite temporário isolado, sem usar bases de clientes.
- Chromium/Playwright navega pela aplicação usando formulários, cookie HttpOnly e API HTTP reais; **não há mock de respostas de navegador**.
- Faz login, percorre wizard P0–P2, tour, criação canônica de lead/empresa/oportunidade, Kanban, leads, indicadores e motor de regras.
- Emula desktop 1440px, iPhone 13 e tablet 820px, registra aproximadamente 22 capturas PNG e detecta overflow horizontal, imagens não carregadas e erros JS.
- Captura relatório HTML, relatório JSON, traces e vídeos quando há falha.

## Dados e segurança

Somente dados artificiais: Loja Fictícia QA Visual, Contato Fictício QA, Empresa Fictícia QA, telefone fictício +5516999000101. O banco é descartado após a execução. O runner não recebe segredos de produção nem cria contato real.

O modo de boot usa valores *falsos* de Meta exclusivamente para inicializar o processo e motor `rules`; nenhuma mensagem é disparada. Assim o teste **não certifica entrega real de WhatsApp, OAuth, Meta Embedded Signup, IA comercial nem dispositivos QR**. Esses módulos exigem teste específico autorizado com ambiente controlado.

## Ver as imagens

GitHub → Actions → Playwright Visual QA → execução correspondente à PR → Artifacts → wppcrm-playwright-visual-qa. Extraia o ZIP e abra visual-qa/screenshots/ ou visual-qa/playwright-report/index.html. Os traces e vídeos estarão em visual-qa/test-results/ nas falhas.

O workflow usa biblioteca Playwright Apache-2.0 instalada somente no runner, sem dependência em produção. A implementação é open source/self-hosted, e pode ser executada localmente sem serviço pago; o GitHub Actions segue os limites/franquias da conta.

## Executar na máquina

```sh
npm ci
npm run build
npm install --no-save --package-lock=false --ignore-scripts @playwright/test@1.65.0
npx --no-install playwright install --with-deps chromium
npx --no-install playwright test --config=playwright.visual.config.mjs
```

## Limitação da comparação visual

Esta primeira execução estabelece um **registro visual para revisão**, com asserções de navegação e layout. Não existem imagens baseline aprovadas no repositório para comparação pixel a pixel. Para ativar diferenças de imagens, aprove um conjunto de referências e versioná-las de maneira explícita, usando o mecanismo de screenshot snapshots do Playwright; não aceitar baselines automaticamente se houver falha visual.
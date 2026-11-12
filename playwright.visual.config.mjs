import { defineConfig, devices } from "@playwright/test";

// Screenshot do React COMPILADO + Fastify HTTP + SQLite; sem mock de rede.
export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: "visual-qa/test-results",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "visual-qa/playwright-report" }],
    ["json", { outputFile: "visual-qa/report.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3202",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "light",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    { name: "chromium-visual", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "node scripts/qa/visual-server.mjs",
    url: "http://127.0.0.1:3202/admin/",
    timeout: 90_000,
    reuseExistingServer: false,
  },
});

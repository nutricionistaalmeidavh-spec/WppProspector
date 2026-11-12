import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { devices, expect, test } from "@playwright/test";

// Testes serializados porque representam UMA instalação nova de CRM com
// persistência real no SQLite efêmero criado pelo webServer do Playwright.
test.describe.configure({ mode: "serial" });
const screenshots = "visual-qa/screenshots";
const secret = "qa-visual-only-not-production";
const contact = "+5516999000101";
const opportunity = "Implantação CRM QA";

async function capture(page, info, name) {
  mkdirSync(screenshots, { recursive: true });
  const path = join(screenshots, name + ".png");
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
  await info.attach(name, { path, contentType: "image/png" });
}

async function verifyLayout(page) {
  const result = await page.evaluate(() => ({
    excess: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    broken: [...document.images]
      .filter(img => img.complete && img.naturalWidth === 0)
      .map(img => img.getAttribute("src")),
  }));
  expect(result.excess, "A página não pode ter overflow horizontal global").toBeLessThanOrEqual(2);
  expect(result.broken, "Imagens quebradas não são permitidas").toEqual([]);
}

async function login(page) {
  await page.goto("/admin/login");
  await expect(page.getByLabel("Segredo de acesso")).toBeVisible();
  await page.getByLabel("Segredo de acesso").fill(secret);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ajuda desta página" })).toBeVisible();
}

test("desktop: configuração P0–P2, tour e primeira oportunidade em banco canônico", async ({ page }, info) => {
  const errors = [];
  page.on("pageerror", err => errors.push(err.message));

  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: "Entrar no WPP CRM" })).toBeVisible();
  await capture(page, info, "01-desktop-login");
  await verifyLayout(page);

  await page.getByLabel("Segredo de acesso").fill(secret);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Configure sua empresa")).toBeVisible();
  await capture(page, info, "02-desktop-wizard-empresa");
  await page.getByLabel("Nome da empresa").fill("Loja Fictícia QA Visual");
  await page.getByLabel("Segmento", { exact: true }).fill("Serviços");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("Seu funil comercial")).toBeVisible();
  await expect(page.getByText("Entender a necessidade do cliente")).toBeVisible();
  await capture(page, info, "03-desktop-wizard-funil");
  await page.getByRole("button", { name: "Confirmar e continuar" }).click();

  await expect(page.getByText("Conecte seu WhatsApp")).toBeVisible();
  await capture(page, info, "04-desktop-whatsapp-opcional");
  await page.getByRole("button", { name: "Continuar sem conectar" }).click();
  await expect(page.getByText("Automação e inteligência artificial")).toBeVisible();
  await expect(page.getByText(/Motor de regras local — R\$ 0/)).toBeVisible();
  await capture(page, info, "05-desktop-motor-gratuito");
  await page.getByRole("button", { name: "Configurar mais tarde" }).click();
  await expect(page.getByText("Revise sua configuração")).toBeVisible();
  await capture(page, info, "06-desktop-wizard-revisao");
  await page.getByRole("button", { name: "Concluir e conhecer o CRM" }).click();

  const tour = page.getByRole("dialog");
  await expect(tour.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await capture(page, info, "07-desktop-tour-inicio");
  for (let index = 0; index < 6; index++) {
    if (index === 5) await capture(page, info, "08-desktop-tour-final");
    await tour.getByRole("button", { name: index === 5 ? "Concluir tour" : "Próximo" }).click();
    if (index !== 5) await expect(tour).toBeVisible();
  }
  await expect(tour).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible();
  await capture(page, info, "09-desktop-dashboard");
  await verifyLayout(page);

  await page.goto("/admin/onboarding/first-operation");
  await expect(page.getByRole("heading", { name: "Crie sua primeira oportunidade" })).toBeVisible();
  await page.getByLabel("Nome do contato").fill("Contato Fictício QA");
  await page.getByLabel("Telefone internacional (E.164)").fill(contact);
  await page.getByLabel("Empresa vinculada").fill("Empresa Fictícia QA");
  await page.getByLabel("Título da oportunidade").fill(opportunity);
  await capture(page, info, "10-desktop-form-primeira-operacao");
  await page.getByRole("button", { name: "Cadastrar no CRM" }).click();
  await expect(page.getByText("Primeira operação confirmada")).toBeVisible();
  await capture(page, info, "11-desktop-operacao-confirmada");
  const stateResponse = await page.request.get("/admin/api/onboarding/state");
  expect(stateResponse.ok()).toBeTruthy();
  expect((await stateResponse.json()).firstOperation.leadPhone).toBe(contact);

  await page.goto("/admin/crm/pipeline");
  await expect(page.getByText(opportunity)).toBeVisible();
  await capture(page, info, "12-desktop-kanban");
  await verifyLayout(page);
  await page.goto("/admin/crm/leads");
  await expect(page.getByText(contact, { exact: false }).first()).toBeVisible();
  await capture(page, info, "13-desktop-leads");
  await verifyLayout(page);
  await page.goto("/admin/settings/onboarding");
  await expect(page.getByRole("heading", { name: "Progresso do primeiro acesso" })).toBeVisible();
  await capture(page, info, "14-desktop-analytics-onboarding");
  await page.goto("/admin/settings/business-ai");
  await expect(page.getByRole("heading", { name: "Central do atendente virtual" })).toBeVisible();
  await capture(page, info, "15-desktop-central-inteligencia");

  expect(errors, "Erros JavaScript não tratados no navegador").toEqual([]);
});

test("mobile e tablet: navegação, Kanban e layout sem overflow global", async ({ browser }, info) => {
  const phoneContext = await browser.newContext({
    ...devices["iPhone 13"],
    baseURL: "http://127.0.0.1:3202",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  try {
    const page = await phoneContext.newPage();
    await page.goto("/admin/login");
    await expect(page.getByLabel("Segredo de acesso")).toBeVisible();
    await capture(page, info, "16-mobile-login");
    await verifyLayout(page);

    await login(page);
    await page.goto("/admin/overview");
    await expect(page.getByRole("heading", { name: "Visão geral", exact: true })).toBeVisible();
    await capture(page, info, "17-mobile-dashboard");
    await verifyLayout(page);

    await page.getByRole("button", { name: "Abrir navegação" }).click();
    const menu = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(menu).toBeVisible();
    await capture(page, info, "18-mobile-menu");
    await menu.getByRole("link", { name: "Pipeline" }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.getByText(opportunity)).toBeVisible();
    await capture(page, info, "19-mobile-kanban");
    await verifyLayout(page);

    await page.goto("/admin/onboarding");
    await expect(page.getByText("Revise sua configuração")).toBeVisible();
    await capture(page, info, "20-mobile-wizard-retomada");
    await verifyLayout(page);

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    await capture(page, info, "21-mobile-configuracoes");
    await verifyLayout(page);
  } finally {
    await phoneContext.close();
  }

  const tabletContext = await browser.newContext({
    viewport: { width: 820, height: 1100 },
    baseURL: "http://127.0.0.1:3202",
    locale: "pt-BR",
  });
  try {
    const page = await tabletContext.newPage();
    await login(page);
    await page.goto("/admin/crm/pipeline");
    await expect(page.getByText(opportunity)).toBeVisible();
    await capture(page, info, "22-tablet-kanban");
    await verifyLayout(page);
  } finally {
    await tabletContext.close();
  }
});

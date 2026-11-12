import { afterEach, describe, expect, it } from "vitest";
import { buildAdminTestApp } from "../management/test-support/admin-test-app.ts";

const opened: Array<Awaited<ReturnType<typeof buildAdminTestApp>>> = [];
afterEach(async () => { for (const test of opened.splice(0)) await test.close(); });
async function fixture() {
  const test = await buildAdminTestApp();
  opened.push(test);
  const cookie = await test.login();
  const request = (method: "GET" | "PUT" | "POST", path: string, payload?: unknown) =>
    test.app.inject({ method, url: "/admin/api" + path, headers: { cookie }, ...(payload === undefined ? {} : { payload }) });
  return { test, request };
}

describe("onboarding self-hosted do CRM", () => {
  it("não exige serviços pagos nem cria clientes de demonstração automaticamente", async () => {
    const { test, request } = await fixture();
    const response = await request("GET", "/onboarding/state");
    expect(response.statusCode).toBe(200);
    expect(response.json().setup.review).toBe("pending");
    expect(response.json().tour.status).toBe("not_started");
    expect(response.json().firstOperation).toBeNull();
    expect(test.db.prepare("SELECT COUNT(*) AS n FROM leads").get()).toMatchObject({ n: 0 });
  });

  it("não conclui perfil vazio; mantém progresso e permite pular integrações opcionais", async () => {
    const { request } = await fixture();
    expect((await request("PUT", "/onboarding/setup", { step: "business", status: "completed" })).statusCode).toBe(409);
    const profile = { name: "Loja de Teste", segment: "Serviços", description: "", openingHours: "",
      paymentMethods: "", deliveryPolicy: "", returnPolicy: "", additionalInstructions: "", products: [], faq: [] };
    expect((await request("PUT", "/business/profile", profile)).statusCode).toBe(200);
    expect((await request("PUT", "/onboarding/setup", { step: "business", status: "completed" })).statusCode).toBe(200);
    expect((await request("PUT", "/onboarding/setup", { step: "crm", status: "completed" })).statusCode).toBe(200);
    expect((await request("PUT", "/onboarding/setup", { step: "whatsapp", status: "skipped" })).statusCode).toBe(200);
    expect((await request("PUT", "/onboarding/setup", { step: "rules", status: "skipped" })).statusCode).toBe(200);
    expect((await request("PUT", "/onboarding/setup", { step: "review", status: "completed" })).statusCode).toBe(200);
    const state = (await request("GET", "/onboarding/state")).json();
    expect(state.setup).toMatchObject({ business: "completed", crm: "completed", whatsapp: "skipped", review: "completed" });
    expect(state.ready).toBe(true);
  });

  it("tour independente por usuário é retomável e nunca envia mensagens", async () => {
    const { test, request } = await fixture();
    expect((await request("PUT", "/onboarding/tour", { index: 3, status: "in_progress" })).statusCode).toBe(200);
    expect((await request("GET", "/onboarding/state")).json().tour).toMatchObject({ index: 3, status: "in_progress" });
    expect((await request("PUT", "/onboarding/tour", { index: 6, status: "completed" })).statusCode).toBe(200);
    expect((await request("GET", "/onboarding/state")).json().tour.status).toBe("completed");
    const count = test.db.prepare("SELECT COUNT(*) AS n FROM outbound_jobs").get() as {n:number};
    expect(count.n).toBe(0);
  });

  it("primeira operação só é concluída com oportunidade vinculada a lead canônico", async () => {
    const { request } = await fixture();
    const phone = "+5516999999999";
    const lead = await request("POST", "/leads", { phone, displayName: "Pessoa Exemplo", source: "Cadastro assistido" });
    expect(lead.statusCode).toBe(200);
    const company = await request("POST", "/crm/companies", { name: "Empresa Exemplo", city: "", segment: "Serviços" });
    expect(company.statusCode).toBe(201);
    const opportunity = await request("POST", "/crm/opportunities", { title: "Atendimento inicial", companyId: company.json().id, leadPhone: phone });
    expect(opportunity.statusCode).toBe(201);
    const payload = { leadPhone: phone, opportunityId: opportunity.json().id };
    const wrong = await request("POST", "/onboarding/first-operation", { ...payload, leadPhone: "+5516888888888" });
    expect(wrong.statusCode).toBe(422);
    expect((await request("POST", "/onboarding/first-operation", payload)).statusCode).toBe(200);
    expect((await request("POST", "/onboarding/first-operation", payload)).statusCode).toBe(200);
    const state = (await request("GET", "/onboarding/state")).json();
    expect(state.firstOperation).toMatchObject(payload);
    expect((await request("GET", "/onboarding/analytics")).json().firstOperations).toBe(1);
  });

  it("nega acesso sem sessão e recusa passos inválidos", async () => {
    const { test, request } = await fixture();
    expect((await test.app.inject({ method: "GET", url: "/admin/api/onboarding/state" })).statusCode).toBe(401);
    expect((await request("PUT", "/onboarding/setup", { step: "adminToken", status: "completed" })).statusCode).toBe(422);
    expect((await request("PUT", "/onboarding/tour", { index: 999, status: "completed" })).statusCode).toBe(422);
  });
});

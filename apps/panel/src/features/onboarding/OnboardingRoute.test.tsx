import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

afterEach(restoreFetch);
const state = () => ({ setup: { business: "pending", crm: "pending", whatsapp: "pending", rules: "pending", review: "pending" },
  ready: false, tour: { index: 0, status: "not_started" }, firstOperation: null, role: "admin" });
const profile = { name: "", segment: "", description: "", openingHours: "", paymentMethods: "",
  deliveryPolicy: "", returnPolicy: "", additionalInstructions: "", products: [], faq: [] };

describe("primeiro acesso CRM", () => {
  it("orienta o primeiro acesso, salva perfil na fonte canônica e permite continuar", async () => {
    const calls = installFetchMock({
      "GET /stats/overview": { body: overview() },
      "GET /onboarding/state": { body: state() },
      "GET /business/profile": { body: profile },
      "PUT /business/profile": { body: (body: unknown) => body },
      "PUT /onboarding/setup": { body: { ok: true } },
    });
    renderApp(["/onboarding"]);
    const user = userEvent.setup();
    expect(await screen.findByText("Configure sua empresa")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nome da empresa"), "Minha Empresa");
    await user.type(screen.getByLabelText("Segmento"), "Serviços");
    await user.click(screen.getByRole("button", { name: "Salvar e continuar" }));
    await waitFor(() => expect(calls.calls.some(c => c.method === "PUT" && c.url.endsWith("/business/profile"))).toBe(true));
    expect(await screen.findByText("Seu funil comercial")).toBeInTheDocument();
    expect(screen.getByText("Entender a necessidade do cliente")).toBeInTheDocument();
  });

  it("oferece perfil rápido de Clínica de Estética sem sobrepor serviços reais nem ativar automações", async () => {
    let currentState=state();
    const calls = installFetchMock({
      "GET /stats/overview": { body: overview() },
      "GET /onboarding/state": { body: () => currentState },
      "GET /business/profile": { body: profile },
      "PUT /business/profile": { body: (body: unknown) => body },
      "PUT /onboarding/setup": { body: (body: unknown) => {
        const payload=body as {step:keyof ReturnType<typeof state>["setup"];status:"completed"|"skipped"};
        currentState={...currentState,setup:{...currentState.setup,[payload.step]:payload.status}};
        return {ok:true};
      } },
    });
    renderApp(["/onboarding"]);
    const user = userEvent.setup();
    await screen.findByText("Configure sua empresa");
    await user.type(screen.getByLabelText("Nome da empresa"), "Clínica Exemplo");
    await user.type(screen.getByLabelText("Produtos e serviços"), "Limpeza de pele sob avaliação");
    await user.click(screen.getByRole("button",{name:"Adicionar serviço"}));
    await user.type(screen.getByLabelText("Serviço 1"),"Limpeza de pele");
    await user.type(screen.getByLabelText("Preço 1"),"R$ 150");
    await user.selectOptions(screen.getByLabelText("Sugestão por segmento (opcional)"), "Clínica de Estética");
    expect(screen.getByLabelText("Segmento")).toHaveValue("Clínica de Estética");
    expect(screen.getByLabelText("Produtos e serviços")).toHaveValue("Limpeza de pele sob avaliação");
    await user.click(screen.getByRole("button", { name: "Salvar e continuar" }));
    expect(await screen.findByText("Identificar o procedimento estético de interesse")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirmar e continuar" }));
    await user.click(screen.getByRole("button", { name: "Continuar sem conectar" }));
    expect(await screen.findByText("Atendimento manual — recomendado para começar")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar com atendimento manual" }));
    expect(await screen.findByText("Desligadas — atendimento manual")).toBeInTheDocument();
    const savedProfileRequest=calls.calls.find(c=>c.method==="PUT"&&c.url.endsWith("/business/profile"));
    expect(savedProfileRequest).toBeDefined();
    expect((await savedProfileRequest!.json()).products).toEqual([
      {name:"Limpeza de pele",price:"R$ 150",description:""},
    ]);
    expect(calls.calls.some(c => c.url.includes("/automation/"))).toBe(false);
  });

  it("prepara, simula e publica regras somente após aprovação expressa, sem WhatsApp real", async () => {
    let currentState = state();
    const calls = installFetchMock({
      "GET /stats/overview": {body: overview()},
      "GET /onboarding/state": {body: () => currentState},
      "GET /business/profile": {body: profile},
      "PUT /business/profile": {body: (body: unknown) => body},
      "PUT /onboarding/setup": {body: (body: unknown) => {
        const payload=body as {step:keyof ReturnType<typeof state>["setup"];status:"completed"|"skipped"};
        currentState={...currentState,setup:{...currentState.setup,[payload.step]:payload.status}};
        return {ok:true};
      }},
      "GET /business/studio": {body: {rulesDraft: {items: [],published: true}}},
      "PUT /business/studio/rules-draft": {body: (body: unknown) => body},
      "POST /business/studio/simulate": {body: {
        provider: "automation",rule: "Agendamento com avaliação",
        reply: "Vamos verificar o agendamento após avaliação.",sent: false,charged: false,
      }},
      "POST /business/studio/rules-publish": {body: {published: true}},
    });
    renderApp(["/onboarding"]);
    const user = userEvent.setup();
    await screen.findByText("Configure sua empresa");
    await user.type(screen.getByLabelText("Nome da empresa"),"Clínica QA");
    await user.selectOptions(screen.getByLabelText("Sugestão por segmento (opcional)"),"Clínica de Estética");
    await user.click(screen.getByRole("button",{name:"Salvar e continuar"}));
    await user.click(await screen.findByRole("button",{name:"Confirmar e continuar"}));
    await user.click(await screen.findByRole("button",{name:"Continuar sem conectar"}));
    await user.click(await screen.findByRole("radio",{name:/Preparar respostas automáticas/}));
    expect(calls.calls.some(c=>c.url.includes("/rules-draft"))).toBe(false);
    await user.click(screen.getByRole("button",{name:"Preparar regras em rascunho"}));
    expect(await screen.findByText("Agendamento com avaliação")).toBeInTheDocument();
    expect(calls.calls.some(c=>c.url.endsWith("/rules-publish"))).toBe(false);
    await user.click(screen.getByRole("button",{name:"Simular regras sugeridas"}));
    expect(await screen.findByText(/Resposta simulada: Agendamento com avaliação/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox",{name:/Revisei e aprovo o envio automático/}));
    await user.click(screen.getByRole("button",{name:"Aprovar e ativar respostas automáticas"}));
    expect(await screen.findByText("Motor local aprovado e ativo")).toBeInTheDocument();
    expect(calls.calls.some(c=>c.method==="POST"&&c.url.endsWith("/rules-publish"))).toBe(true);
  });

  it("mostra perfis setoriais adicionais mantendo a possibilidade de segmento personalizado", async () => {
    installFetchMock({
      "GET /stats/overview": { body: overview() },
      "GET /onboarding/state": { body: state() },
      "GET /business/profile": { body: profile },
    });
    renderApp(["/onboarding"]);
    const user = userEvent.setup();
    await screen.findByText("Configure sua empresa");
    const segment = screen.getByLabelText("Segmento");
    const selector = screen.getByLabelText("Sugestão por segmento (opcional)");
    expect(screen.getByRole("option", { name: "Oficina Mecânica" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Restaurante e Delivery" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pet Shop e Clínica Veterinária" })).toBeInTheDocument();
    await user.selectOptions(selector, "Oficina Mecânica");
    expect(segment).toHaveValue("Oficina Mecânica");
    await user.clear(segment);
    await user.type(segment, "Marcenaria personalizada");
    expect(segment).toHaveValue("Marcenaria personalizada");
    expect(selector).toHaveValue("");
  });

  it("exibe link de retomada sem exigir API paga", async () => {
    installFetchMock({
      "GET /stats/overview": { body: overview() },
      "GET /onboarding/state": { body: { ...state(), setup: { ...state().setup, review: "skipped" } } },
    });
    renderApp(["/settings"]);
    expect(await screen.findByRole("link", { name: /Retomar configuração guiada/i })).toBeInTheDocument();
  });
});

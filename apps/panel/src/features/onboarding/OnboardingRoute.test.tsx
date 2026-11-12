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
      "PUT /business/profile": { body: (body) => body },
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

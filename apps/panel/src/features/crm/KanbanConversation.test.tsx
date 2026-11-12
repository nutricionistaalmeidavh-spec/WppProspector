import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { conversationDetail } from "@/test/fixtures";
import { installFetchMock, renderWithProviders, restoreFetch } from "@/test/harness";
import { PipelineRoute } from "./CrmRoutes";

afterEach(restoreFetch);

describe("Kanban e WhatsApp", () => {
  it("abre e fecha o chat em um clique sem desmontar o Kanban", async () => {
    const phone = "+5516999999999";
    installFetchMock({
      "GET /capabilities": { body: { conversationActions: true, prospecting: true,
        crm: { opportunities: true, companies: true, campaigns: true } } },
      "GET /crm/opportunities": { body: { items: [{
        id: "00000000-0000-4000-8000-000000000001", title: "Venda teste",
        companyId: "company-1", companyName: "Empresa teste", leadName: "Contato teste",
        leadPhone: phone, stage: "new", estimatedValue: 100, owner: "Comercial",
        nextAction: "", nextActionAt: "", createdAt: "2026-11-12",
      }] } },
      "GET /crm/companies": { body: { items: [] } },
      "GET /crm/campaigns": { body: { items: [] } },
      ["GET /conversations/" + encodeURIComponent(phone)]: { body: conversationDetail({leadPhone:phone}) },
    });
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><PipelineRoute /></MemoryRouter>);
    expect(await screen.findByText("Empresa teste")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir conversa de Contato teste" }));
    expect(await screen.findByRole("dialog", { name: "Conversa do WhatsApp" })).toBeInTheDocument();
    expect(await screen.findByText("olá, quero saber mais")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fechar painel de conversa" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("Empresa teste")).toBeInTheDocument();
  });
});

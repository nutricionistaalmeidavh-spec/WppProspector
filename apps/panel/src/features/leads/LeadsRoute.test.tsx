import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeadListItem, LeadListPage } from "@/api/contracts";
import { installFetchMock, renderWithProviders, restoreFetch } from "@/test/harness";
import { LeadsRoute } from "./LeadsRoute";

afterEach(restoreFetch);

function lead(overrides: Partial<LeadListItem> = {}): LeadListItem {
  return {
    phone: "+5516990000001",
    displayName: "Obras SA",
    source: null,
    notes: null,
    company: "Obras SA",
    segment: "construção",
    city: "Ribeirão Preto",
    prospectingState: "pending",
    firstContactAt: null,
    repliedAt: null,
    ...overrides,
  };
}

function page(items: LeadListItem[]): LeadListPage {
  return { items, pageSize: 25, nextCursor: null };
}

const CAPS_ON = { conversationActions: true, prospecting: true };

describe("LeadsRoute", () => {
  it("estado vazio orienta a importar uma planilha", async () => {
    installFetchMock({
      "GET /capabilities": { body: CAPS_ON },
      "GET /leads": { body: page([]) },
    });

    renderWithProviders(<LeadsRoute />);

    expect(await screen.findByText("Nenhum lead por aqui ainda")).toBeInTheDocument();
    expect(screen.getByText("Importe uma planilha para iniciar sua base de prospecção.")).toBeInTheDocument();
  });

  it("checkbox desabilitado para leads em sent/replied, habilitado para pending/failed", async () => {
    installFetchMock({
      "GET /capabilities": { body: CAPS_ON },
      "GET /leads": {
        body: page([
          lead({ phone: "+5516990000001", prospectingState: "pending" }),
          lead({ phone: "+5516990000002", prospectingState: "sent" }),
          lead({ phone: "+5516990000003", prospectingState: "replied" }),
          lead({ phone: "+5516990000004", prospectingState: "failed" }),
        ]),
      },
    });

    renderWithProviders(<LeadsRoute />);

    expect(await screen.findByLabelText("Selecionar +5516990000001")).toBeEnabled();
    expect(screen.getByLabelText("Selecionar +5516990000002")).toBeDisabled();
    expect(screen.getByLabelText("Selecionar +5516990000003")).toBeDisabled();
    expect(screen.getByLabelText("Selecionar +5516990000004")).toBeEnabled();
  });

  it("disparo em lote chama o endpoint e mostra o desfecho parcial", async () => {
    const { calls } = installFetchMock({
      "GET /capabilities": { body: CAPS_ON },
      "GET /leads": {
        body: page([
          lead({ phone: "+5516990000001", prospectingState: "pending" }),
          lead({ phone: "+5516990000002", prospectingState: "failed" }),
        ]),
      },
      "POST /leads/prospect": {
        body: {
          results: [
            { phone: "+5516990000001", outcome: "sent", wamid: "w.1", lead: lead({ prospectingState: "sent" }) },
            { phone: "+5516990000002", outcome: "failed", reason: "gateway: recusado", lead: lead({ phone: "+5516990000002", prospectingState: "failed" }) },
          ],
        },
      },
    });

    renderWithProviders(<LeadsRoute />);

    await userEvent.click(await screen.findByLabelText("Selecionar +5516990000001"));
    await userEvent.click(screen.getByLabelText("Selecionar +5516990000002"));
    await userEvent.click(screen.getByRole("button", { name: /Disparar abertura \(2\)/ }));

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Disparar mensagem de abertura \(2\)/ }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "POST" && new URL(c.url).pathname.endsWith("/leads/prospect")),
      ).toBe(true),
    );
    expect(await within(dialog).findByText("Falhou")).toBeInTheDocument();
    expect(within(dialog).getByText("Enviado")).toBeInTheDocument();
    expect(within(dialog).getByText("gateway: recusado")).toBeInTheDocument();
  });

  it("reset chama o endpoint e a linha volta a pending pela invalidação", async () => {
    let leadState = "sent";
    const resetPath = `/leads/${encodeURIComponent("+5516990000001")}/reset`;
    const { calls } = installFetchMock({
      "GET /capabilities": { body: CAPS_ON },
      "GET /leads": { body: () => page([lead({ prospectingState: leadState as LeadListItem["prospectingState"] })]) },
      [`POST ${resetPath}`]: {
        body: () => {
          leadState = "pending";
          return lead({ prospectingState: "pending" });
        },
      },
    });

    renderWithProviders(<LeadsRoute />);

    await userEvent.click(await screen.findByRole("button", { name: "Resetar" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Resetar" }));

    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "POST" && new URL(c.url).pathname.endsWith(resetPath)),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() =>
      expect(within(screen.getByRole("table")).getByText("Pendente")).toBeInTheDocument(),
    );
  });

  it("sem prospecção no deploy, a ação de disparo não fica acionável", async () => {
    installFetchMock({
      "GET /capabilities": { body: { conversationActions: true, prospecting: false } },
      "GET /leads": { body: page([lead({ prospectingState: "pending" })]) },
    });

    renderWithProviders(<LeadsRoute />);

    await userEvent.click(await screen.findByLabelText("Selecionar +5516990000001"));

    expect(
      screen.queryByRole("button", { name: /Disparar abertura/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("disparo indisponível")).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { consumptionSeries, EMPTY_CONSUMPTION, overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

// Recharts precisa de layout; no jsdom o container tem 0x0. Stub leve mantém o
// teste focado na tabela/《contadores》.
vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: unknown }) => children ?? null;
  return {
    ResponsiveContainer: Passthrough,
    BarChart: Passthrough,
    Bar: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

afterEach(restoreFetch);

function consumptionUrls(calls: Request[]): URL[] {
  return calls
    .filter((call) => new URL(call.url).pathname.endsWith("/stats/consumption"))
    .map((call) => new URL(call.url));
}

describe("ConsumptionRoute", () => {
  it("agrupado por dia: uma linha por dia + total do período", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /stats/consumption": { body: () => consumptionSeries() },
    });

    renderApp(["/consumption"]);

    expect(await screen.findByText("2026-09-01")).toBeInTheDocument();
    expect(screen.getByText("2026-09-02")).toBeInTheDocument();
    expect(screen.getByText("Total do período")).toBeInTheDocument();
  });

  it("alterna o agrupamento e refaz a consulta com o novo groupBy", async () => {
    const { calls } = installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /stats/consumption": { body: () => consumptionSeries() },
    });

    renderApp(["/consumption"]);
    await screen.findByText("Total do período");

    await userEvent.click(screen.getByRole("button", { name: "Modelo" }));

    await waitFor(() =>
      expect(
        consumptionUrls(calls).some((url) => url.searchParams.get("groupBy") === "model"),
      ).toBe(true),
    );
  });

  it("sinaliza grupos com custo parcial", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /stats/consumption": { body: () => consumptionSeries() },
    });

    renderApp(["/consumption"]);

    expect((await screen.findAllByText("parcial")).length).toBeGreaterThan(0);
  });

  it("intervalo sem eventos mostra zeros, não erro", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /stats/consumption": { body: () => EMPTY_CONSUMPTION },
    });

    renderApp(["/consumption"]);

    expect(await screen.findByText("Sem eventos de consumo no período.")).toBeInTheDocument();
    expect(screen.queryByText("Erro ao carregar o consumo.")).not.toBeInTheDocument();
  });

  it("renderiza os contadores do 'agora' do overview", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview({ totalLeads: 7, pendingInbound: 2 }) },
      "GET /stats/consumption": { body: () => consumptionSeries() },
    });

    renderApp(["/consumption"]);

    const cards = await screen.findByTestId("overview-cards");
    const leads = within(cards).getByText("Leads");
    expect(leads.parentElement?.parentElement?.textContent).toContain("7");
  });
});

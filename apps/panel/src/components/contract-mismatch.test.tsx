import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { MANAGEMENT_CONTRACT_VERSION } from "@/api/contracts";
import { listPage, overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

afterEach(restoreFetch);

describe("aviso de incompatibilidade de contrato", () => {
  it("aparece quando uma resposta não valida e o dado divergente não é renderizado", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": { body: () => ({ items: "isto não é uma lista", pageSize: 25 }) },
    });

    renderApp(["/conversations"]);

    expect(await screen.findByText("Interface desatualizada em relação à API")).toBeInTheDocument();
    expect(screen.getByText(MANAGEMENT_CONTRACT_VERSION)).toBeInTheDocument();
    expect(screen.queryByText("5511999990000")).not.toBeInTheDocument();
  });

  it("não aparece quando as respostas batem com o contrato", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": { body: () => listPage() },
    });

    renderApp(["/conversations"]);

    await screen.findByText("5511999990000");
    await waitFor(() =>
      expect(
        screen.queryByText("Interface desatualizada em relação à API"),
      ).not.toBeInTheDocument(),
    );
  });
});

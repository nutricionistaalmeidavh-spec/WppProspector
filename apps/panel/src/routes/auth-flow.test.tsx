import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { listPage, overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

afterEach(restoreFetch);

describe("fluxo de autenticação", () => {
  it("com o segredo aceito revela o shell autenticado", async () => {
    let authed = false;
    installFetchMock({
      "GET /stats/overview": {
        get body() {
          return authed ? overview() : { error: "unauthorized" };
        },
        get status() {
          return authed ? 200 : 401;
        },
      },
      "POST /session": {
        body: () => {
          authed = true;
          return { ok: true };
        },
      },
      "GET /conversations": { body: () => listPage() },
    });

    renderApp(["/conversations"]);

    const input = await screen.findByLabelText("Segredo de acesso");
    await userEvent.type(input, "correct-secret");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByRole("button", { name: "Sair" })).toBeInTheDocument();
    expect(await screen.findByText("5511999990000")).toBeInTheDocument();
  });

  it("com o segredo recusado mantém o login e mostra a mensagem", async () => {
    installFetchMock({
      "GET /stats/overview": { status: 401, body: { error: "unauthorized" } },
      "POST /session": { status: 401, body: { error: "unauthorized" } },
    });

    renderApp(["/conversations"]);

    const input = await screen.findByLabelText("Segredo de acesso");
    await userEvent.type(input, "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Segredo inválido.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sair" })).not.toBeInTheDocument();
  });

  it("um 401 numa chamada autenticada volta ao login e some com os dados", async () => {
    let conversationsStatus = 200;
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": {
        get status() {
          return conversationsStatus;
        },
        get body() {
          return conversationsStatus === 200 ? listPage() : { error: "unauthorized" };
        },
      },
    });

    renderApp(["/conversations"]);

    expect(await screen.findByText("5511999990000")).toBeInTheDocument();

    conversationsStatus = 401;
    // força um refetch da listagem
    const { queryClient } = await import("@/api/query-client");
    await queryClient.refetchQueries({ queryKey: ["conversations"] });

    expect(await screen.findByLabelText("Segredo de acesso")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("5511999990000")).not.toBeInTheDocument();
    });
  });

  it("logout leva ao login e exige reautenticar", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": { body: () => listPage() },
      "DELETE /session": { status: 204 },
    });

    renderApp(["/conversations"]);

    await screen.findByRole("button", { name: "Sair" });
    await userEvent.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByLabelText("Segredo de acesso")).toBeInTheDocument();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { listItem, overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

afterEach(restoreFetch);

function urlsFor(calls: Request[], path: string): URL[] {
  return calls
    .filter((call) => new URL(call.url).pathname.endsWith(path))
    .map((call) => new URL(call.url));
}

describe("ConversationsRoute", () => {
  it("renderiza a primeira página na ordem devolvida pela API", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": {
        body: () => ({
          items: [
            listItem({ leadPhone: "5511111111111" }),
            listItem({ leadPhone: "5522222222222" }),
          ],
          pageSize: 25,
          nextCursor: null,
        }),
      },
    });

    renderApp(["/conversations/history"]);

    const rows = await screen.findAllByRole("row");
    // rows[0] é o cabeçalho
    expect(within(rows[1]!).getByText("5511111111111")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("5522222222222")).toBeInTheDocument();
  });

  it("repassa filtros combinados e a busca por telefone na chamada", async () => {
    const { calls } = installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": { body: () => ({ items: [], pageSize: 25, nextCursor: null }) },
    });

    renderApp(["/conversations/history"]);
    await screen.findByText("Nenhuma conversa corresponde aos filtros.");

    await userEvent.selectOptions(screen.getByLabelText("Estado"), "ended");
    await userEvent.type(screen.getByLabelText("Telefone contém"), "5511");

    await waitFor(() => {
      const match = urlsFor(calls, "/conversations").some(
        (url) =>
          url.searchParams.get("state") === "ended" && url.searchParams.get("phone") === "5511",
      );
      expect(match).toBe(true);
    });
  });

  it("carrega a próxima página usando o cursor e desabilita no fim", async () => {
    let page = 0;
    const { calls } = installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": {
        body: () => {
          page += 1;
          return page === 1
            ? {
                items: [listItem({ leadPhone: "5511111111111" })],
                pageSize: 1,
                nextCursor: "cursor-2",
              }
            : { items: [listItem({ leadPhone: "5522222222222" })], pageSize: 1, nextCursor: null };
        },
      },
    });

    renderApp(["/conversations/history"]);

    const nextButton = await screen.findByRole("button", { name: "Carregar próxima página" });
    await userEvent.click(nextButton);

    expect(await screen.findByText("5522222222222")).toBeInTheDocument();
    expect(
      urlsFor(calls, "/conversations").some((url) => url.searchParams.get("cursor") === "cursor-2"),
    ).toBe(true);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Fim da lista" })).toBeDisabled(),
    );
  });

  it("mostra estado vazio quando nenhuma conversa corresponde", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": { body: () => ({ items: [], pageSize: 25, nextCursor: null }) },
    });

    renderApp(["/conversations/history"]);

    expect(
      await screen.findByText("Nenhuma conversa corresponde aos filtros."),
    ).toBeInTheDocument();
  });
});

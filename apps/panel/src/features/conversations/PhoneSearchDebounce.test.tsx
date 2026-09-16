import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

afterEach(restoreFetch);

function conversationUrls(calls: Request[]): URL[] {
  return calls
    .filter((call) => new URL(call.url).pathname.endsWith("/conversations"))
    .map((call) => new URL(call.url));
}

describe("busca por telefone", () => {
  it("aguarda um pequeno intervalo antes de consultar a API", async () => {
    const { calls } = installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /conversations": { body: () => ({ items: [], pageSize: 25, nextCursor: null }) },
    });

    renderApp(["/conversations/history"]);
    await screen.findByText("Nenhuma conversa corresponde aos filtros.");

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Telefone contém"), "5511");

    const immediatePhoneCalls = conversationUrls(calls).filter((url) => url.searchParams.has("phone"));
    expect(immediatePhoneCalls).toHaveLength(0);

    await waitFor(
      () => {
        expect(
          conversationUrls(calls).some((url) => url.searchParams.get("phone") === "5511"),
        ).toBe(true);
      },
      { timeout: 1200 },
    );
  });
});

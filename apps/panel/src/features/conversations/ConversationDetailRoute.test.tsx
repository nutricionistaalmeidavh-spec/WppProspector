import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { conversationDetail, overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

afterEach(restoreFetch);

const PHONE = "5511999990000";

describe("ConversationDetailRoute", () => {
  it("mostra os turnos e os campos de uma conversa existente", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      [`GET /conversations/${PHONE}`]: {
        body: () =>
          conversationDetail({
            leadIntent: "interested",
            quotedPlan: "essencial",
            recommendedModules: ["universidade"],
          }),
      },
    });

    renderApp([`/conversations/${PHONE}`]);

    expect(await screen.findByText("olá, quero saber mais")).toBeInTheDocument();
    expect(screen.getByText("claro! posso te explicar")).toBeInTheDocument();
    expect(screen.getByText("interested")).toBeInTheDocument();
    expect(screen.getByText("universidade")).toBeInTheDocument();
  });

  it("um 404 mostra 'conversa não encontrada' com volta para a lista", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      [`GET /conversations/${PHONE}`]: { status: 404, body: { error: "not_found" } },
    });

    renderApp([`/conversations/${PHONE}`]);

    expect(await screen.findByText("Conversa não encontrada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para a listagem" })).toBeInTheDocument();
  });

  it("o polling atualiza a linha do tempo sem recarregar", async () => {
    let turnsExtra = false;
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      [`GET /conversations/${PHONE}`]: {
        body: () => {
          const base = conversationDetail();
          return turnsExtra
            ? {
                ...base,
                turnCount: 3,
                turns: [
                  ...base.turns,
                  {
                    direction: "inbound",
                    text: "novo turno do lead",
                    timestamp: "2026-09-02T12:05:00.000Z",
                  },
                ],
              }
            : base;
        },
      },
    });

    renderApp([`/conversations/${PHONE}`]);
    await screen.findByText("claro! posso te explicar");

    turnsExtra = true;
    const { queryClient } = await import("@/api/query-client");
    await queryClient.refetchQueries({ queryKey: ["conversations", "detail", PHONE] });

    await waitFor(() => expect(screen.getByText("novo turno do lead")).toBeInTheDocument());
  });
});

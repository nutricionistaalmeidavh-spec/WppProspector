import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationActions } from "./ConversationActions";
import { installFetchMock, renderWithProviders, restoreFetch } from "@/test/harness";

afterEach(restoreFetch);

const PHONE = "5511999990000";

describe("ConversationActions", () => {
  it("sem os endpoints de ação no deploy, nenhum controle é acionável", async () => {
    installFetchMock({
      "GET /capabilities": { status: 404, body: { error: "not_found" } },
    });

    renderWithProviders(<ConversationActions leadPhone={PHONE} state="active" />);

    expect(await screen.findByText("indisponível neste servidor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assumir atendimento" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("com o endpoint disponível, a ação é chamada", async () => {
    const { calls } = installFetchMock({
      "GET /capabilities": { body: { conversationActions: true, prospecting: false } },
      [`POST /conversations/${PHONE}/handoff`]: { body: { ok: true } },
    });

    renderWithProviders(<ConversationActions leadPhone={PHONE} state="active" />);

    const button = await screen.findByRole("button", { name: "Assumir atendimento" });
    await waitFor(() => expect(button).not.toBeDisabled());
    await userEvent.click(button);

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === "POST" &&
            new URL(call.url).pathname.endsWith(`/conversations/${PHONE}/handoff`),
        ),
      ).toBe(true),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uma recusa com motivo (409) é exibida sem descartar a tela", async () => {
    installFetchMock({
      "GET /capabilities": { body: { conversationActions: true, prospecting: false } },
      [`POST /conversations/${PHONE}/messages`]: {
        status: 409,
        body: { reason: "janela de 24 h fechada" },
      },
    });

    renderWithProviders(<ConversationActions leadPhone={PHONE} state="active" />);

    const field = await screen.findByLabelText("Mensagem avulsa (janela de 24 h)");
    await waitFor(() => expect(field).not.toBeDisabled());
    await userEvent.type(field, "oi de novo");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("janela de 24 h fechada");
    expect(screen.getByLabelText("Mensagem avulsa (janela de 24 h)")).toBeInTheDocument();
  });
});

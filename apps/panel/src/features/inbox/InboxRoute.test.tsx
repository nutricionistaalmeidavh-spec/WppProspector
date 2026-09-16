import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { conversationDetail, listItem, overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

function setViewport(desktop: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      matches: desktop,
      media: "(min-width: 1024px)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function installInboxApi(phone = "5511999990000") {
  installFetchMock({
    "GET /stats/overview": { body: () => overview() },
    "GET /capabilities": {
      body: () => ({ conversationActions: false, prospecting: false }),
    },
    "GET /conversations": {
      body: () => ({ items: [listItem({ leadPhone: phone })], pageSize: 25, nextCursor: null }),
    },
    [`GET /conversations/${phone}`]: {
      body: () => conversationDetail({ leadPhone: phone }),
    },
  });
}

afterEach(() => {
  restoreFetch();
  vi.unstubAllGlobals();
});

describe("InboxRoute", () => {
  it("abre o histórico no painel direito no desktop sem trocar de rota", async () => {
    const phone = "5511999990000";
    setViewport(true);
    installInboxApi(phone);
    const { router } = renderApp(["/conversations/inbox"]);
    const user = userEvent.setup();

    const phoneLabel = await screen.findByText(phone);
    const row = phoneLabel.closest("button");
    expect(row).not.toBeNull();
    await user.click(row!);

    expect(router.state.location.pathname).toBe("/conversations/inbox");
    expect(await screen.findByText("olá, quero saber mais")).toBeInTheDocument();
  });

  it("mantém a navegação para a tela de detalhe no celular", async () => {
    const phone = "5511999990000";
    setViewport(false);
    installInboxApi(phone);
    const { router } = renderApp(["/conversations/inbox"]);
    const user = userEvent.setup();

    const phoneLabel = await screen.findByText(phone);
    const row = phoneLabel.closest("button");
    expect(row).not.toBeNull();
    await user.click(row!);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/conversations/${phone}`);
    });
  });
});

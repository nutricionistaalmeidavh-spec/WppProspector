import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { overview } from "@/test/fixtures";
import { installFetchMock, renderApp, restoreFetch } from "@/test/harness";

afterEach(() => {
  restoreFetch();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

describe("AppShell mobile drawer", () => {
  it("trava a rolagem, move o foco, fecha com Escape e devolve o foco ao gatilho", async () => {
    installFetchMock({
      "GET /stats/overview": { body: () => overview() },
      "GET /capabilities": {
        body: () => ({ conversationActions: false, prospecting: false }),
      },
    });

    renderApp(["/overview"]);
    const user = userEvent.setup();
    const opener = await screen.findByRole("button", { name: "Abrir navegação" });

    await user.click(opener);

    const close = screen.getByRole("button", { name: "Fechar navegação" });
    await waitFor(() => expect(close).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Fechar navegação" })).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
  });
});

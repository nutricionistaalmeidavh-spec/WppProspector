import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError, onSessionLost } from "./client";

function mockFetchOnce(status: number, body: unknown): void {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
    new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devolve o JSON parseado num 200", async () => {
    mockFetchOnce(200, { ok: true });
    await expect(apiFetch("/stats/overview")).resolves.toEqual({ ok: true });
  });

  it("converte um 401 em ApiError e dispara os ouvintes de sessão perdida", async () => {
    const listener = vi.fn();
    const off = onSessionLost(listener);
    mockFetchOnce(401, { error: "unauthorized" });

    await expect(apiFetch("/stats/overview")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it("num 401 com emitSessionLost:false não dispara os ouvintes (rotas de sessão)", async () => {
    const listener = vi.fn();
    const off = onSessionLost(listener);
    mockFetchOnce(401, { error: "unauthorized" });

    await expect(
      apiFetch("/session", { method: "POST", body: { secret: "x" }, emitSessionLost: false }),
    ).rejects.toMatchObject({ status: 401 });
    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it("propaga o status e a mensagem do corpo em erros não-2xx", async () => {
    mockFetchOnce(409, { reason: "janela de 24 h fechada" });
    await expect(
      apiFetch("/conversations/x/messages", { method: "POST", body: {} }),
    ).rejects.toMatchObject({ status: 409, message: "janela de 24 h fechada" });
  });
});

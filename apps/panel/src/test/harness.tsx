import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { vi } from "vitest";
import { queryClient } from "@/api/query-client";
import { SessionProvider } from "@/auth/session";
import { appRoutes } from "@/routes/router";

export interface RouteHandler {
  status?: number;
  /** JSON body; a function receives the parsed request body. */
  body?: unknown | ((requestBody: unknown) => unknown);
}

export type RouteTable = Record<string, RouteHandler>;

/**
 * Substitui `fetch` por um roteador `"<METHOD> <path>"` → resposta. Sem match →
 * 404. Chame `restoreFetch()` no `afterEach`.
 */
export function installFetchMock(routes: RouteTable): { calls: Request[] } {
  const calls: Request[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = new URL(url, "http://localhost").pathname.replace(/^\/admin\/api/, "");
    calls.push(new Request(url, init ?? undefined));

    const handler = routes[`${method} ${path}`];
    if (!handler) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }
    const status = handler.status ?? 200;
    let body = handler.body;
    if (typeof body === "function") {
      const parsed = init?.body ? JSON.parse(String(init.body)) : undefined;
      body = (body as (b: unknown) => unknown)(parsed);
    }
    const nullBody = status === 204 || status === 205 || status === 304;
    return new Response(nullBody || body === undefined ? null : JSON.stringify(body), {
      status,
      headers: nullBody ? undefined : { "content-type": "application/json" },
    });
  });
  return { calls };
}

export function restoreFetch(): void {
  vi.restoreAllMocks();
  queryClient.clear();
}

/** Renderiza a app inteira (providers + rotas em memória) numa rota inicial. */
export function renderApp(
  initialEntries: string[] = ["/conversations"],
  routes: RouteObject[] = appRoutes,
): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  queryClient.clear();
  queryClient.setDefaultOptions({
    queries: { retry: false, refetchInterval: false, gcTime: 0 },
  });
  const router = createMemoryRouter(routes, { initialEntries });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>,
  );
  return Object.assign(result, { router });
}

/** Renderiza um único elemento com os providers (sem rotas). */
export function renderWithProviders(ui: ReactElement): RenderResult {
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false, refetchInterval: false } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/**
 * Cliente HTTP da API de gestão. Todas as chamadas vão para `/admin/api` na
 * mesma origem (em dev o Vite faz proxy para o bot), com o cookie de sessão
 * (`credentials: "include"`).
 *
 * Um `401` é tratado centralmente: dispara os ouvintes de "sessão perdida"
 * (o roteador reage voltando ao login e limpando o cache) — exceto quando a
 * chamada opta por `emitSessionLost: false` (as próprias rotas de sessão).
 */

const BASE_PATH = "/admin/api";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type SessionLostListener = () => void;
const sessionLostListeners = new Set<SessionLostListener>();

/** Registra um ouvinte de "sessão perdida" (401). Retorna a função de remoção. */
export function onSessionLost(listener: SessionLostListener): () => void {
  sessionLostListeners.add(listener);
  return () => sessionLostListeners.delete(listener);
}

function emitSessionLost(): void {
  for (const listener of sessionLostListeners) {
    listener();
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: QueryParams;
  signal?: AbortSignal;
  /** `false` para não disparar "sessão perdida" num 401 (rotas de sessão). */
  emitSessionLost?: boolean;
}

function buildUrl(path: string, query?: QueryParams): string {
  const url = new URL(BASE_PATH + path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "error", "reason", "detail"]) {
      if (typeof record[key] === "string") {
        return record[key] as string;
      }
    }
  }
  return fallback;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const hasBody = options.body !== undefined;
  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? "GET",
    credentials: "include",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const raw = await response.text();
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : undefined;
  } catch {
    parsed = raw;
  }

  if (response.status === 401 && options.emitSessionLost !== false) {
    emitSessionLost();
  }

  if (!response.ok) {
    throw new ApiError(response.status, messageFromBody(parsed, response.statusText), parsed);
  }

  return parsed as T;
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

import type { z } from "zod";
import { MANAGEMENT_CONTRACT_VERSION } from "./contracts";

type ContractIssues = z.ZodError["issues"];

/**
 * Uma resposta da API de gestão não bateu com o contrato que esta build da
 * interface conhece (`MANAGEMENT_CONTRACT_VERSION`). O consumidor deve exibir um
 * aviso de incompatibilidade em vez de renderizar o dado.
 */
export class ContractMismatchError extends Error {
  readonly expectedContractVersion = MANAGEMENT_CONTRACT_VERSION;

  constructor(
    readonly issues: ContractIssues,
    readonly received?: unknown,
  ) {
    super(`Resposta da API de gestão incompatível com o contrato ${MANAGEMENT_CONTRACT_VERSION}`);
    this.name = "ContractMismatchError";
  }
}

export function isContractMismatchError(error: unknown): error is ContractMismatchError {
  return error instanceof ContractMismatchError;
}

/**
 * Valida `payload` contra `schema` e devolve o dado parseado; lança
 * `ContractMismatchError` na divergência.
 *
 * `S extends z.ZodType` (em vez de `z.ZodType<T>`) evita a inferência estrutural
 * cara do tipo do schema zod v4 a cada chamada.
 */
export function parseWithContract<S extends z.ZodType>(schema: S, payload: unknown): z.output<S> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ContractMismatchError(result.error.issues, payload);
  }
  return result.data;
}

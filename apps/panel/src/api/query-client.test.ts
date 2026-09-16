import { describe, expect, it } from "vitest";
import { ApiError } from "./client";
import { ContractMismatchError } from "./parse";
import { queryClient } from "./query-client";

describe("queryClient defaults", () => {
  it("não faz polling com a aba oculta", () => {
    expect(queryClient.getDefaultOptions().queries?.refetchIntervalInBackground).toBe(false);
  });

  it("não tenta novamente em 4xx nem em incompatibilidade de contrato", () => {
    const retry = queryClient.getDefaultOptions().queries?.retry;
    expect(typeof retry).toBe("function");
    const fn = retry as (count: number, error: Error) => boolean;

    expect(fn(0, new ApiError(404, "not found"))).toBe(false);
    expect(fn(0, new ApiError(401, "unauthorized"))).toBe(false);
    expect(fn(0, new ContractMismatchError([]))).toBe(false);
    expect(fn(0, new ApiError(500, "boom"))).toBe(true);
  });
});

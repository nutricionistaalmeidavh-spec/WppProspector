import { describe, expect, it } from "vitest";
import { MANAGEMENT_CONTRACT_VERSION, overviewSchema } from "./contracts";
import { ContractMismatchError, parseWithContract } from "./parse";

const validOverview = {
  conversationsByState: { active: 2, ended: 1, awaitingHuman: 0 },
  totalLeads: 3,
  pendingInbound: 1,
};

describe("parseWithContract", () => {
  it("devolve o dado parseado quando o payload bate com o contrato", () => {
    expect(parseWithContract(overviewSchema, validOverview)).toEqual(validOverview);
  });

  it("lança ContractMismatchError com a versão esperada quando o payload diverge", () => {
    const wrong = { ...validOverview, totalLeads: "3" };
    try {
      parseWithContract(overviewSchema, wrong);
      expect.unreachable("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(ContractMismatchError);
      expect((error as ContractMismatchError).expectedContractVersion).toBe(
        MANAGEMENT_CONTRACT_VERSION,
      );
      expect((error as ContractMismatchError).issues.length).toBeGreaterThan(0);
    }
  });
});

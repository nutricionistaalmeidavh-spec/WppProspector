import { describe, expect, it } from "vitest";
import { resolveCrmRuntime } from "./runtime";

describe("resolveCrmRuntime", () => {
  it("usa HTTP e habilita somente módulos anunciados pela API em produção", () => {
    const runtime = resolveCrmRuntime(
      {
        conversationActions: true,
        prospecting: true,
        crm: { opportunities: true, companies: false, campaigns: true },
      },
      false,
    );

    expect(runtime.source).toBe("http");
    expect(runtime.modules).toEqual({
      opportunities: true,
      companies: false,
      campaigns: true,
    });
  });

  it("não expõe CRM em produção quando a API não anuncia suporte", () => {
    const runtime = resolveCrmRuntime(
      { conversationActions: true, prospecting: true },
      false,
    );

    expect(runtime.source).toBe("disabled");
    expect(runtime.modules).toEqual({
      opportunities: false,
      companies: false,
      campaigns: false,
    });
  });

  it("mantém mock automático apenas em desenvolvimento", () => {
    const runtime = resolveCrmRuntime(null, true);

    expect(runtime.source).toBe("mock");
    expect(runtime.modules).toEqual({
      opportunities: true,
      companies: true,
      campaigns: true,
    });
  });
});

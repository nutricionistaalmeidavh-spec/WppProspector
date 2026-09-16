import { describe, expect, it } from "vitest";
import { getNavigationGroups } from "@/components/navigation";

describe("navegação CRM", () => {
  it("esconde módulos que a API não anunciou e mantém Conversas explícito", () => {
    const labels = getNavigationGroups({
      opportunities: false,
      companies: false,
      campaigns: false,
    }).flatMap((group) => group.items.map((item) => item.label));

    expect(labels).toContain("Leads");
    expect(labels).toContain("Conversas");
    expect(labels).not.toContain("Inbox");
    expect(labels).toContain("Custos");
    expect(labels).not.toContain("Pipeline");
    expect(labels).not.toContain("Oportunidades");
    expect(labels).not.toContain("Empresas");
    expect(labels).not.toContain("Campanhas");
  });

  it("coloca Conversas imediatamente depois de Pipeline quando o pipeline existe", () => {
    const crmGroup = getNavigationGroups({
      opportunities: true,
      companies: false,
      campaigns: true,
    }).find((group) => group.label === "CRM");

    expect(crmGroup?.items.map((item) => item.label)).toEqual([
      "Pipeline",
      "Conversas",
      "Oportunidades",
      "Leads",
    ]);
  });

  it("mostra somente os módulos CRM anunciados", () => {
    const labels = getNavigationGroups({
      opportunities: true,
      companies: false,
      campaigns: true,
    }).flatMap((group) => group.items.map((item) => item.label));

    expect(labels).toContain("Pipeline");
    expect(labels).toContain("Oportunidades");
    expect(labels).toContain("Campanhas");
    expect(labels).not.toContain("Empresas");
  });
});

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
      "Contatos WhatsApp",
    ]);
  });

  it("expõe o CRM comercial somente quando as oportunidades e empresas estão disponíveis", () => {
    const full = getNavigationGroups({opportunities:true,companies:true,campaigns:false})
      .flatMap(group => group.items.map(item => item.label));
    expect(full).toContain("Comercial");
    const partial = getNavigationGroups({opportunities:true,companies:false,campaigns:false})
      .flatMap(group => group.items.map(item => item.label));
    expect(partial).not.toContain("Comercial");
  });

  it("oculta gestão de equipe para agentes e gestores",()=>{
    const modules={opportunities:true,companies:true,campaigns:false};
    const agent=getNavigationGroups(modules,"agent").flatMap(g=>g.items.map(i=>i.label));
    const manager=getNavigationGroups(modules,"manager").flatMap(g=>g.items.map(i=>i.label));
    const admin=getNavigationGroups(modules,"admin").flatMap(g=>g.items.map(i=>i.label));
    expect(agent).not.toContain("Equipe");
    expect(manager).not.toContain("Equipe");
    expect(admin).toContain("Equipe");
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

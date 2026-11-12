import { describe, expect, it } from "vitest";
import { buildSectorRules } from "./sector-rule-templates";

describe("modelos de regras do primeiro acesso", () => {
  it("gera regras reais em rascunho para clínica de estética sem inventar informações", () => {
    const rules = buildSectorRules({
      name: "Clínica Fictícia", segment: "Clínica de Estética",
      openingHours: "Seg–sex, 9h às 18h", paymentMethods: "Pix",
    });
    expect(rules.length).toBeGreaterThanOrEqual(2);
    expect(rules.every(rule => rule.eventType === "message.received" && rule.enabled)).toBe(true);
    expect(rules.some(rule => rule.trigger === "agendar")).toBe(true);
    expect(rules.some(rule => rule.response.includes("9h às 18h"))).toBe(true);
    expect(rules.some(rule => rule.response.includes("avaliação"))).toBe(true);
    expect(rules.some(rule => /garantido|diagnóstico|promessa/i.test(rule.response))).toBe(false);
  });

  it("usa respostas conservadoras e não pressupõe preços ou dados da loja", () => {
    const rules = buildSectorRules({name: "Oficina QA",segment: "Oficina Mecânica",openingHours: "",paymentMethods:""});
    expect(rules.some(rule => rule.trigger === "orçamento")).toBe(true);
    expect(rules.every(rule => rule.response.trim().length > 0)).toBe(true);
    expect(rules.some(rule => /R\$\s*\d/.test(rule.response))).toBe(false);
  });
});

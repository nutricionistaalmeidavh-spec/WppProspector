import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseLeadsSheet, UnrecognizedSheetError } from "./parse-leads-sheet";

/** Monta um `.xlsx` em memória e devolve o ArrayBuffer, como o `File` do browser daria. */
function buildXlsx(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const HEADER = ["Empresa", "Telefone", "Segmento", "Cidade"];

describe("parseLeadsSheet", () => {
  it("extrai os válidos e separa os rejeitados com a linha de origem", async () => {
    const buffer = buildXlsx({
      "03_Leads_CRM": [
        HEADER,
        ["Obras SA", "(16) 99117-8924", "construção", "Ribeirão Preto"],
        ["Sem Fone", "", "varejo", "São Paulo"],
        ["Fixo Ltda", "(16) 3913-4635", "serviços", "Campinas"],
        ["Bugado", "12", "indústria", "Bauru"],
        ["Marcenaria", "16997379471", "madeira", "Sorocaba"],
      ],
    });

    const { valid, rejected } = await parseLeadsSheet(buffer);

    expect(valid).toEqual([
      {
        phone: "+5516991178924",
        displayName: "Obras SA",
        company: "Obras SA",
        segment: "construção",
        city: "Ribeirão Preto",
      },
      {
        phone: "+5516997379471",
        displayName: "Marcenaria",
        company: "Marcenaria",
        segment: "madeira",
        city: "Sorocaba",
      },
    ]);

    expect(rejected).toEqual([
      { row: 3, raw: "", reason: "sem telefone" },
      { row: 4, raw: "(16) 3913-4635", reason: "telefone fixo (não celular)" },
      { row: 5, raw: "12", reason: "telefone incompleto" },
    ]);
  });

  it("colapsa telefone duplicado: última ocorrência vence", async () => {
    const buffer = buildXlsx({
      "03_Leads_CRM": [
        HEADER,
        ["Primeira", "16991178924", "a", "A"],
        ["Última", "(16) 99117-8924", "b", "B"],
      ],
    });

    const { valid } = await parseLeadsSheet(buffer);

    expect(valid).toHaveLength(1);
    expect(valid[0]).toMatchObject({ phone: "+5516991178924", company: "Última", segment: "b" });
  });

  it("reconhece a aba pela heurística de cabeçalho quando não há 03_Leads_CRM", async () => {
    const buffer = buildXlsx({
      Plan1: [["lixo"], ["mais lixo"]],
      Contatos: [
        ["Razão Social", "WhatsApp", "Ramo", "Município"],
        ["Alfa", "16991178924", "obras", "RP"],
      ],
    });

    const { valid } = await parseLeadsSheet(buffer);
    expect(valid).toEqual([
      { phone: "+5516991178924", displayName: "Alfa", company: "Alfa", segment: "obras", city: "RP" },
    ]);
  });

  it("aba não reconhecida → UnrecognizedSheetError", async () => {
    const buffer = buildXlsx({
      Resumo: [
        ["Mês", "Faturamento"],
        ["Janeiro", "1000"],
      ],
    });

    await expect(parseLeadsSheet(buffer)).rejects.toBeInstanceOf(UnrecognizedSheetError);
  });
});

describe("parseLeadsSheet — via File (jsdom)", () => {
  it("lê um File real (não só ArrayBuffer) e reconhece a aba", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([HEADER, ["Obras SA", "(16) 99117-8924", "obras", "RP"]]),
      "03_Leads_CRM",
    );
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const parsed = await parseLeadsSheet(new File([data], "leads.xlsx"));
    expect(parsed.valid).toEqual([
      { phone: "+5516991178924", displayName: "Obras SA", company: "Obras SA", segment: "obras", city: "RP" },
    ]);
  });
});

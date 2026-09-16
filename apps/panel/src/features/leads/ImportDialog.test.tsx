import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as XLSX from "xlsx";
import { installFetchMock, renderWithProviders, restoreFetch } from "@/test/harness";
import { ImportDialog } from "./ImportDialog";

afterEach(restoreFetch);

function xlsxFile(rows: unknown[][], name = "leads.xlsx"): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "03_Leads_CRM");
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([data], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const SHEET = [
  ["Empresa", "Telefone", "Segmento", "Cidade"],
  ["Obras SA", "(16) 99117-8924", "construção", "Ribeirão Preto"],
  ["Sem Fone", "", "varejo", "SP"],
  ["Fixo Ltda", "(16) 3913-4635", "serviços", "Campinas"],
];

describe("ImportDialog", () => {
  it("mostra o preview com rejeitados e não grava antes de confirmar", async () => {
    const { calls } = installFetchMock({
      "POST /leads/import": { body: { imported: 1, updated: 0, rejected: [] } },
    });

    renderWithProviders(<ImportDialog open onClose={() => {}} />);

    await userEvent.upload(screen.getByLabelText("Arquivo .xlsx"), xlsxFile(SHEET));

    expect(await screen.findByText("1", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("telefone fixo (não celular)")).toBeInTheDocument();
    expect(screen.getByText("sem telefone")).toBeInTheDocument();
    // Nada gravado ainda.
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("confirmar envia só os válidos e mostra os totais", async () => {
    const { calls } = installFetchMock({
      "POST /leads/import": {
        body: (body: unknown) => {
          expect((body as { leads: unknown[] }).leads).toHaveLength(1);
          return { imported: 1, updated: 0, rejected: [] };
        },
      },
    });

    renderWithProviders(<ImportDialog open onClose={() => {}} />);

    await userEvent.upload(screen.getByLabelText("Arquivo .xlsx"), xlsxFile(SHEET));
    await userEvent.click(await screen.findByRole("button", { name: /Importar 1/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("1 criado(s), 0 atualizado(s)");
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "POST" && new URL(c.url).pathname.endsWith("/leads/import")),
      ).toBe(true),
    );
  });

  it("planilha sem aba de leads reconhecível → erro e nada enviado", async () => {
    const { calls } = installFetchMock({
      "POST /leads/import": { body: { imported: 0, updated: 0, rejected: [] } },
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Mês", "Total"], ["Jan", 1]]), "Resumo");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const file = new File([data], "resumo.xlsx");

    renderWithProviders(<ImportDialog open onClose={() => {}} />);
    await userEvent.upload(screen.getByLabelText("Arquivo .xlsx"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent("03_Leads_CRM");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});

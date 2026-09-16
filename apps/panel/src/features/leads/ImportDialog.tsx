import { useRef, useState } from "react";
import type { ImportLeadsInput } from "@/api/contracts";
import { Button } from "@/components/ui/button";
import { Dialog } from "./Dialog";
import {
  parseLeadsSheet,
  UnrecognizedSheetError,
  type ParsedLeadsSheet,
} from "./parse-leads-sheet";
import { useImportLeads } from "./useImportLeads";

function toPayload(parsed: ParsedLeadsSheet): ImportLeadsInput {
  return {
    leads: parsed.valid.map((draft) => ({
      phone: draft.phone,
      ...(draft.displayName ? { displayName: draft.displayName } : {}),
      ...(draft.company ? { company: draft.company } : {}),
      ...(draft.segment ? { segment: draft.segment } : {}),
      ...(draft.city ? { city: draft.city } : {}),
    })),
  };
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedLeadsSheet | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const importLeads = useImportLeads();

  function reset() {
    setParsed(null);
    setParseError(null);
    importLeads.reset();
    if (fileInput.current) fileInput.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setParsed(null);
    setParseError(null);
    importLeads.reset();
    if (!file) return;
    try {
      setParsed(await parseLeadsSheet(file));
    } catch (error) {
      setParseError(
        error instanceof UnrecognizedSheetError
          ? "Não reconhecemos a aba de leads. Use a planilha de trabalho com a aba “03_Leads_CRM” " +
            "(colunas de empresa/nome, telefone, segmento e cidade)."
          : "Não foi possível ler o arquivo. Verifique se é um .xlsx válido.",
      );
    }
  }

  const result = importLeads.data;

  return (
    <Dialog open={open} onClose={close} title="Importar leads de planilha">
      {result ? (
        <div className="space-y-3">
          <p role="status">
            Importação concluída: <strong>{result.imported}</strong> criado(s),{" "}
            <strong>{result.updated}</strong> atualizado(s)
            {result.rejected.length > 0 ? `, ${result.rejected.length} ignorado(s)` : ""}.
          </p>
          <div className="flex justify-end">
            <Button size="sm" onClick={close}>
              Fechar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label htmlFor="leads-file" className="text-sm font-medium">
              Arquivo .xlsx
            </label>
            <input
              ref={fileInput}
              id="leads-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFileChange}
              className="block w-full text-sm"
            />
          </div>

          {parseError ? (
            <p role="alert" className="text-sm text-destructive">
              {parseError}
            </p>
          ) : null}

          {parsed ? (
            <div className="space-y-2">
              <p>
                <strong>{parsed.valid.length}</strong> lead(s) válido(s) para importar.
              </p>
              {parsed.rejected.length > 0 ? (
                <div className="max-h-48 overflow-auto rounded border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-2 py-1 text-left">Linha</th>
                        <th className="px-2 py-1 text-left">Telefone</th>
                        <th className="px-2 py-1 text-left">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.rejected.map((row) => (
                        <tr key={`${row.row}-${row.raw}`} className="border-t">
                          <td className="px-2 py-1">{row.row}</td>
                          <td className="px-2 py-1">{row.raw || "—"}</td>
                          <td className="px-2 py-1">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhuma linha rejeitada.</p>
              )}
            </div>
          ) : null}

          {importLeads.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {importLeads.error instanceof Error
                ? importLeads.error.message
                : "Falha ao importar."}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={close}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={
                !parsed || parsed.valid.length === 0 || importLeads.isPending
              }
              onClick={() => parsed && importLeads.mutate(toPayload(parsed))}
            >
              {importLeads.isPending ? "Importando…" : `Importar ${parsed?.valid.length ?? 0}`}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

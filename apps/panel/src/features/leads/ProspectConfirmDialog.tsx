import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "./Dialog";
import { BULK_OUTCOME_LABEL } from "./lead-display";
import { useBulkProspect } from "./useBulkProspect";

export function ProspectConfirmDialog({
  open,
  phones,
  onClose,
  onCompleted,
}: {
  open: boolean;
  phones: string[];
  onClose: () => void;
  /** Chamado ao fechar após um disparo bem-sucedido (a rota limpa a seleção). */
  onCompleted: () => void;
}) {
  const bulk = useBulkProspect();
  const results = bulk.data?.results ?? [];

  function close() {
    const done = bulk.isSuccess;
    bulk.reset();
    onClose();
    if (done) onCompleted();
  }

  return (
    <Dialog open={open} onClose={close} title="Disparar mensagem de abertura">
      {results.length > 0 ? (
        <div className="space-y-3">
          <ul className="max-h-64 space-y-1 overflow-auto text-sm">
            {results.map((item) => (
              <li key={item.phone} className="flex items-center justify-between gap-2">
                <span>{item.phone}</span>
                <span className="flex items-center gap-2">
                  <Badge
                    variant={
                      item.outcome === "failed"
                        ? "destructive"
                        : item.outcome === "skipped"
                          ? "secondary"
                          : "default"
                    }
                  >
                    {BULK_OUTCOME_LABEL[item.outcome] ?? item.outcome}
                  </Badge>
                  {item.reason ? (
                    <span className="text-xs text-muted-foreground">{item.reason}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button size="sm" onClick={close}>
              Fechar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p>
            A mensagem de abertura será enviada para <strong>{phones.length}</strong> lead(s)
            selecionado(s). Esta ação dispara mensagens reais.
          </p>
          {bulk.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {bulk.error instanceof Error ? bulk.error.message : "Falha ao disparar."}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={close}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={phones.length === 0 || bulk.isPending}
              onClick={() => bulk.mutate({ phones })}
            >
              {bulk.isPending ? "Disparando…" : `Disparar mensagem de abertura (${phones.length})`}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}

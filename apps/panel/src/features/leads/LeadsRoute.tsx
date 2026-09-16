import { useMemo, useState } from "react";
import { FileUp, Search, Send } from "lucide-react";
import { PROSPECTING_STATES } from "@/api/contracts";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/SectionState";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useActionAvailability } from "@/features/actions/useActionAvailability";
import { Dialog } from "./Dialog";
import { ImportDialog } from "./ImportDialog";
import { LeadsTable } from "./LeadsTable";
import { PROSPECTING_STATE_LABEL, isSelectable } from "./lead-display";
import { ProspectConfirmDialog } from "./ProspectConfirmDialog";
import { useLeadList, type LeadFilters } from "./useLeadList";
import { useResetLead } from "./useResetLead";

export function LeadsRoute() {
  const [filters, setFilters] = useState<LeadFilters>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [prospectOpen, setProspectOpen] = useState(false);
  const [resetPhone, setResetPhone] = useState<string | null>(null);

  const { prospecting } = useActionAvailability();
  const query = useLeadList(filters);
  const resetLead = useResetLead();
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const selectablePhones = useMemo(() => new Set(items.filter((lead) => isSelectable(lead.prospectingState)).map((lead) => lead.phone)), [items]);
  const effectiveSelected = useMemo(() => new Set([...selected].filter((phone) => selectablePhones.has(phone))), [selected, selectablePhones]);

  function patch(next: Partial<LeadFilters>) {
    setFilters((current) => {
      const merged = { ...current, ...next };
      for (const key of Object.keys(merged) as (keyof LeadFilters)[]) {
        if (merged[key] === "" || merged[key] === undefined) delete merged[key];
      }
      return merged;
    });
  }

  function toggle(phone: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }

  function toggleAllSelectable() {
    setSelected((current) => {
      const allChecked = selectablePhones.size > 0 && [...selectablePhones].every((phone) => current.has(phone));
      return allChecked ? new Set() : new Set(selectablePhones);
    });
  }

  const selectedPhones = [...effectiveSelected];
  const showEmpty = !query.isLoading && !query.isError && items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Base operacional para importação, filtros e prospecção. Os dados desta tela já vêm do backend real."
        actions={<Button onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importar planilha</Button>}
      />

      <div className="surface-panel grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="f-state">Estado</Label>
          <Select id="f-state" value={filters.state ?? ""} onChange={(event) => patch({ state: event.target.value || undefined })}>
            <option value="">Todos</option>
            {PROSPECTING_STATES.map((value) => <option key={value} value={value}>{PROSPECTING_STATE_LABEL[value] ?? value}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-phone">Telefone</Label>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="f-phone" className="pl-9" value={filters.phone ?? ""} onChange={(event) => patch({ phone: event.target.value })} placeholder="5516…" /></div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-segment">Segmento</Label>
          <Input id="f-segment" value={filters.segment ?? ""} onChange={(event) => patch({ segment: event.target.value })} placeholder="construção" />
        </div>
      </div>

      {selectedPhones.length > 0 ? (
        <div className="sticky top-3 z-10 flex flex-col gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:top-4">
          <div className="flex items-center gap-2"><StatusPill tone="info">{selectedPhones.length} selecionado(s)</StatusPill><span className="text-xs text-muted-foreground">prontos para ação em lote</span></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
            {prospecting ? <Button size="sm" onClick={() => setProspectOpen(true)}><Send className="h-4 w-4" />Disparar abertura ({selectedPhones.length})</Button> : <StatusPill>disparo indisponível</StatusPill>}
          </div>
        </div>
      ) : null}

      {query.isError ? <ErrorState onRetry={() => query.refetch()} description="Erro ao carregar os leads." /> : null}
      {query.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-11" />)}</div> : null}
      {showEmpty ? <EmptyState title="Nenhum lead por aqui ainda" description="Importe uma planilha para iniciar sua base de prospecção." action={<Button size="sm" onClick={() => setImportOpen(true)}>Importar planilha</Button>} /> : null}

      {!query.isLoading && !query.isError && items.length > 0 ? (
        <div className="space-y-4">
          <div className="surface-panel overflow-x-auto"><LeadsTable items={items} selected={effectiveSelected} onToggle={toggle} onToggleAllSelectable={toggleAllSelectable} onRequestReset={setResetPhone} prospectingAvailable={prospecting} /></div>
          <div className="flex justify-center"><Button variant="outline" size="sm" disabled={!query.hasNextPage || query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? "Carregando…" : query.hasNextPage ? "Carregar próxima página" : "Fim da lista"}</Button></div>
        </div>
      ) : null}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ProspectConfirmDialog open={prospectOpen} phones={selectedPhones} onClose={() => setProspectOpen(false)} onCompleted={() => setSelected(new Set())} />

      <Dialog open={resetPhone !== null} onClose={() => { setResetPhone(null); resetLead.reset(); }} title="Resetar prospecção">
        <p>O lead <strong>{resetPhone}</strong> volta para <em>pendente</em> e fica selecionável para um novo disparo. A conversa e o histórico são mantidos.</p>
        {resetLead.isError ? <p role="alert" className="text-sm text-destructive">{resetLead.error instanceof Error ? resetLead.error.message : "Falha ao resetar."}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => { setResetPhone(null); resetLead.reset(); }}>Cancelar</Button>
          <Button size="sm" disabled={resetLead.isPending} onClick={() => { if (!resetPhone) return; resetLead.mutate(resetPhone, { onSuccess: () => setResetPhone(null) }); }}>{resetLead.isPending ? "Resetando…" : "Resetar"}</Button>
        </div>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { conversationStateSchema, leadIntentSchema } from "@/api/contracts";
import { formatDateTime } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConversationList, type ConversationFilters } from "./useConversationList";

const STATE_OPTIONS = conversationStateSchema.options;
const INTENT_OPTIONS = leadIntentSchema.options;

const STATE_LABEL: Record<string, string> = {
  active: "Ativa",
  ended: "Encerrada",
  awaitingHuman: "Aguardando humano",
};

export function ConversationsRoute() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ConversationFilters>({});
  const [phone, setPhone] = useState("");
  const debouncedPhone = useDebouncedValue(phone, 300);
  const queryFilters = useMemo<ConversationFilters>(
    () => ({ ...filters, phone: debouncedPhone || undefined }),
    [debouncedPhone, filters],
  );

  const query = useConversationList(queryFilters);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  function patch(next: Partial<ConversationFilters>) {
    setFilters((current) => {
      const merged = { ...current, ...next };
      for (const key of Object.keys(merged) as (keyof ConversationFilters)[]) {
        if (merged[key] === "" || merged[key] === undefined) delete merged[key];
      }
      return merged;
    });
  }

  const showEmpty = !query.isLoading && !query.isError && items.length === 0;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Conversas</h1>

      <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="f-state">Estado</Label>
          <Select
            id="f-state"
            value={filters.state ?? ""}
            onChange={(event) => patch({ state: event.target.value || undefined })}
          >
            <option value="">Todos</option>
            {STATE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {STATE_LABEL[value] ?? value}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="f-intent">Intent</Label>
          <Select
            id="f-intent"
            value={filters.leadIntent ?? ""}
            onChange={(event) => patch({ leadIntent: event.target.value || undefined })}
          >
            <option value="">Todos</option>
            {INTENT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="f-phone">Telefone contém</Label>
          <Input
            id="f-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="5511…"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="f-from">Última atividade de</Label>
          <Input
            id="f-from"
            type="date"
            value={filters.activityFrom ?? ""}
            onChange={(event) => patch({ activityFrom: event.target.value })}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="f-to">até</Label>
          <Input
            id="f-to"
            type="date"
            value={filters.activityTo ?? ""}
            onChange={(event) => patch({ activityTo: event.target.value })}
          />
        </div>
      </div>

      {query.isError ? (
        <div className="rounded-lg border border-destructive/40 p-6 text-sm">
          <p className="text-destructive">Erro ao carregar as conversas.</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      ) : null}

      {showEmpty ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Nenhuma conversa corresponde aos filtros.
        </div>
      ) : null}

      {!query.isLoading && !query.isError && items.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Telefone</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead>Qualificação</TableHead>
                <TableHead className="text-right">Turnos</TableHead>
                <TableHead>Última atividade</TableHead>
                <TableHead>Mensagens recebidas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.leadPhone}
                  className="cursor-pointer"
                  onClick={() => navigate(`/conversations/${encodeURIComponent(item.leadPhone)}`)}
                >
                  <TableCell className="font-medium">{item.leadPhone}</TableCell>
                  <TableCell>{STATE_LABEL[item.state] ?? item.state}</TableCell>
                  <TableCell>{item.leadIntent}</TableCell>
                  <TableCell>{item.leadQualification ?? "—"}</TableCell>
                  <TableCell className="text-right">{item.turnCount}</TableCell>
                  <TableCell>{formatDateTime(item.lastActivityAt)}</TableCell>
                  <TableCell>
                    {item.hasPendingInbound ? <Badge variant="secondary">pendente</Badge> : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-center">
            <Button
              variant="outline"
              size="sm"
              disabled={!query.hasNextPage || query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            >
              {query.isFetchingNextPage
                ? "Carregando…"
                : query.hasNextPage
                  ? "Carregar próxima página"
                  : "Fim da lista"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

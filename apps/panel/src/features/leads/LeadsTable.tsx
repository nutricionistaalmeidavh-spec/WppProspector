import type { LeadListItem } from "@/api/contracts";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  canReset,
  isSelectable,
  PROSPECTING_STATE_BADGE,
  PROSPECTING_STATE_LABEL,
} from "./lead-display";

export interface LeadsTableProps {
  items: LeadListItem[];
  selected: Set<string>;
  onToggle: (phone: string) => void;
  onToggleAllSelectable: () => void;
  /** Pede confirmação de reset para o lead (a confirmação é resolvida na rota). */
  onRequestReset: (phone: string) => void;
  /** Disparo/reset acoplados à disponibilidade da prospecção no deploy. */
  prospectingAvailable: boolean;
}

export function LeadsTable({
  items,
  selected,
  onToggle,
  onToggleAllSelectable,
  onRequestReset,
  prospectingAvailable,
}: LeadsTableProps) {
  const selectablePhones = items.filter((l) => isSelectable(l.prospectingState)).map((l) => l.phone);
  const allSelectableChecked =
    selectablePhones.length > 0 && selectablePhones.every((p) => selected.has(p));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <input
              type="checkbox"
              aria-label="Selecionar todos os leads disponíveis"
              checked={allSelectableChecked}
              disabled={selectablePhones.length === 0}
              onChange={onToggleAllSelectable}
            />
          </TableHead>
          <TableHead>Nome / empresa</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead>Segmento</TableHead>
          <TableHead>Cidade</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead>Primeiro contato</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((lead) => {
          const selectable = isSelectable(lead.prospectingState);
          const resettable = canReset(lead.prospectingState);
          return (
            <TableRow key={lead.phone}>
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Selecionar ${lead.phone}`}
                  checked={selected.has(lead.phone)}
                  disabled={!selectable}
                  onChange={() => onToggle(lead.phone)}
                />
              </TableCell>
              <TableCell className="font-medium">
                {lead.displayName ?? lead.company ?? "—"}
                {lead.company && lead.displayName && lead.company !== lead.displayName ? (
                  <span className="block text-xs text-muted-foreground">{lead.company}</span>
                ) : null}
              </TableCell>
              <TableCell>{lead.phone}</TableCell>
              <TableCell>{lead.segment ?? "—"}</TableCell>
              <TableCell>{lead.city ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={PROSPECTING_STATE_BADGE[lead.prospectingState] ?? "outline"}>
                  {PROSPECTING_STATE_LABEL[lead.prospectingState] ?? lead.prospectingState}
                </Badge>
              </TableCell>
              <TableCell>{formatDateTime(lead.firstContactAt)}</TableCell>
              <TableCell className="text-right">
                {resettable && prospectingAvailable ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRequestReset(lead.phone)}
                  >
                    Resetar
                  </Button>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

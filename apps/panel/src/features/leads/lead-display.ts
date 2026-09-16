import type { BadgeProps } from "@/components/ui/badge";

/** Rótulos em pt-BR dos estados de prospecção. */
export const PROSPECTING_STATE_LABEL: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  replied: "Respondeu",
  failed: "Falhou",
};

export const PROSPECTING_STATE_BADGE: Record<string, BadgeProps["variant"]> = {
  pending: "secondary",
  sent: "default",
  replied: "default",
  failed: "destructive",
};

/** Um lead nesse estado pode ser selecionado para disparo da abertura. */
export function isSelectable(state: string): boolean {
  return state === "pending" || state === "failed";
}

/** Um lead nesse estado (já contatado) pode ter a prospecção resetada. */
export function canReset(state: string): boolean {
  return state === "sent" || state === "replied";
}

/** Rótulo curto para o desfecho do disparo em lote. */
export const BULK_OUTCOME_LABEL: Record<string, string> = {
  sent: "Enviado",
  skipped: "Ignorado",
  failed: "Falhou",
};

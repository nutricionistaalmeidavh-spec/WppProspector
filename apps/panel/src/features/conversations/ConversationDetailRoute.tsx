import { Link, useParams } from "react-router-dom";
import type { ConversationDetail } from "@/api/contracts";
import { ConversationActions } from "@/features/actions/ConversationActions";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationDetail } from "./useConversationDetail";

const STATE_LABEL: Record<string, string> = {
  active: "Ativa",
  ended: "Encerrada",
  awaitingHuman: "Aguardando humano",
};

export function ConversationDetailRoute() {
  const { leadPhone = "" } = useParams();
  return <ConversationDetailPanel leadPhone={decodeURIComponent(leadPhone)} showBackLink />;
}

export function ConversationDetailPanel({
  leadPhone,
  showBackLink = false,
}: {
  leadPhone: string;
  showBackLink?: boolean;
}) {
  const query = useConversationDetail(leadPhone);

  if (query.isNotFound) {
    return (
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">Conversa não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          Nenhuma conversa persistida para <code>{leadPhone}</code>.
        </p>
        {showBackLink ? (
          <Link to="/conversations" className="text-sm text-primary underline-offset-4 hover:underline">
            Voltar para a listagem
          </Link>
        ) : null}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">Erro ao carregar a conversa.</p>
        <button
          className="text-sm text-primary underline-offset-4 hover:underline"
          onClick={() => query.refetch()}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const detail: ConversationDetail = query.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {showBackLink ? (
          <Link to="/conversations" className="text-sm text-primary underline-offset-4 hover:underline">
            ← Conversas
          </Link>
        ) : null}
        <h1 className="text-lg font-semibold">{detail.leadPhone}</h1>
        <Badge variant="secondary">{STATE_LABEL[detail.state] ?? detail.state}</Badge>
        {detail.hasPendingInbound ? <Badge>mensagem recebida pendente</Badge> : null}
        {detail.hasAbandonedInbound ? <Badge variant="outline">mensagem recebida abandonada</Badge> : null}
      </div>

      <dl className="grid gap-x-6 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <Field label="Intent" value={detail.leadIntent} />
        <Field label="Qualificação" value={detail.leadQualification ?? "—"} />
        <Field label="Plano citado" value={detail.quotedPlan ?? "—"} />
        <Field label="Turnos" value={String(detail.turnCount)} />
        <Field label="Módulos recomendados" value={detail.recommendedModules.join(", ") || "—"} />
        <Field label="Módulos de interesse" value={detail.interestedModules.join(", ") || "—"} />
        <Field label="Última atividade" value={formatDateTime(detail.lastActivityAt)} />
      </dl>

      <ConversationActions leadPhone={detail.leadPhone} state={detail.state} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Linha do tempo</h2>
        <ol className="space-y-2">
          {detail.turns.map((turn, index) => (
            <li
              key={`${turn.timestamp}-${index}`}
              className={
                turn.direction === "inbound"
                  ? "rounded-lg border bg-muted/40 p-3"
                  : "rounded-lg border p-3"
              }
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium uppercase">
                  {turn.direction === "inbound" ? "Lead" : "Bot"}
                </span>
                <span>{formatDateTime(turn.timestamp)}</span>
                {turn.direction === "inbound" && turn.abandoned ? (
                  <Badge variant="outline">abandonado</Badge>
                ) : null}
              </div>
              <p className="whitespace-pre-wrap text-sm">{turn.text}</p>
              {turn.direction === "outbound" && turn.reasoning ? (
                <p className="mt-1 text-xs text-muted-foreground">{turn.reasoning}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

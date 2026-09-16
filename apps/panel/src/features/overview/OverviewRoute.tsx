import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Bot, MessageCircleMore, MessageSquareWarning, Target, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/SectionState";
import { StatusPill } from "@/components/StatusPill";
import { useOverview } from "@/features/consumption/useOverview";
import { useConversationList } from "@/features/conversations/useConversationList";
import { getCrmRepository } from "@/features/crm/repository";
import { useCrmRuntime } from "@/features/crm/runtime";
import { formatDateTime } from "@/lib/format";

export function buildAttentionItems(data: {
  awaitingHuman: number;
  pendingInbound: number;
  failedProspecting?: number;
}) {
  const receivedMessages =
    data.pendingInbound === 1
      ? "1 mensagem recebida pendente"
      : `${data.pendingInbound} mensagens recebidas pendentes`;

  return [
    data.awaitingHuman > 0
      ? { label: `${data.awaitingHuman} conversa(s) aguardando humano`, to: "/conversations/handoff" }
      : null,
    data.pendingInbound > 0
      ? { label: receivedMessages, to: "/conversations/inbox" }
      : null,
    data.failedProspecting && data.failedProspecting > 0
      ? { label: `${data.failedProspecting} falha(s) de prospecção`, to: "/crm/leads" }
      : null,
  ].filter(Boolean) as Array<{ label: string; to: string }>;
}

export function buildRecentConversations<T extends { lastActivityAt: string | null }>(
  items: readonly T[] | undefined,
  limit = 4,
): T[] {
  return [...(items ?? [])]
    .sort((left, right) => {
      const leftTime = Date.parse(left.lastActivityAt ?? "");
      const rightTime = Date.parse(right.lastActivityAt ?? "");
      const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
      const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
      return safeRight - safeLeft;
    })
    .slice(0, Math.max(0, limit));
}

export function OverviewRoute() {
  const overview = useOverview();
  const conversations = useConversationList({});
  const crmRuntime = useCrmRuntime();
  const crmEnabled = crmRuntime.source !== "disabled";
  const crmRepository = getCrmRepository(crmRuntime.source === "http" ? "http" : "mock");
  const opportunities = useQuery({
    queryKey: ["crm", crmRuntime.source, "opportunities"],
    queryFn: () => crmRepository.listOpportunities(),
    enabled: crmEnabled && crmRuntime.modules.opportunities,
    staleTime: Infinity,
  });
  const campaigns = useQuery({
    queryKey: ["crm", crmRuntime.source, "campaigns"],
    queryFn: () => crmRepository.listCampaigns(),
    enabled: crmEnabled && crmRuntime.modules.campaigns,
    staleTime: Infinity,
  });

  if (overview.isError) {
    return <ErrorState onRetry={() => overview.refetch()} description="Não foi possível carregar a visão operacional." />;
  }

  if (overview.isLoading || !overview.data) {
    return (
      <div className="space-y-6">
        <PageHeader title="Visão geral" description="Saúde da operação e prioridades comerciais." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28" />)}
        </div>
      </div>
    );
  }

  const data = overview.data;
  const attention = buildAttentionItems({
    awaitingHuman: data.conversationsByState.awaitingHuman,
    pendingInbound: data.pendingInbound,
  });
  const conversationItems = conversations.data?.pages.flatMap((page) => page.items) ?? [];
  const recentConversations = buildRecentConversations(conversationItems);
  const crmOpportunities = opportunities.data ?? [];
  const crmCampaigns = campaigns.data ?? [];
  const activePipeline = crmOpportunities
    .filter((item) => item.stage !== "won" && item.stage !== "lost")
    .reduce((total, item) => total + item.estimatedValue, 0);
  const showCommercial = crmRuntime.modules.opportunities || crmRuntime.modules.campaigns;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Operação"
        title="Visão geral"
        description="Acompanhe o que exige atenção agora e entre direto no próximo trabalho."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Bot} label="Conversas ativas" value={data.conversationsByState.active} helper="bot operando" />
        <MetricCard icon={MessageSquareWarning} label="Aguardando humano" value={data.conversationsByState.awaitingHuman} helper="prioridade operacional" />
        <MetricCard icon={Users} label="Leads" value={data.totalLeads} helper="base disponível" />
        <MetricCard icon={AlertTriangle} label="Mensagens recebidas" value={data.pendingInbound} helper="pendentes" />
      </div>

      <div className={showCommercial ? "grid gap-5 xl:grid-cols-[1.15fr_0.85fr]" : "grid gap-5"}>
        <Card className="shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Fila de trabalho</p>
              <CardTitle className="mt-1 text-base">Precisa de atenção</CardTitle>
            </div>
            <StatusPill tone={attention.length > 0 ? "warning" : "success"}>
              {attention.length > 0 ? `${attention.length} prioridade(s)` : "Tudo em dia"}
            </StatusPill>
          </CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                Nenhuma prioridade pendente no momento.
              </div>
            ) : (
              attention.map((item) => (
                <Link key={item.label} to={item.to} className="group flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors hover:bg-muted/50">
                  <span className="font-medium">{item.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {showCommercial ? (
          <Card className="shadow-sm">
            <CardHeader>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Comercial</p>
                <CardTitle className="mt-1 text-base">Pipeline</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {crmRuntime.modules.opportunities ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Oportunidades</p>
                      <p className="mt-1 text-2xl font-semibold">{crmOpportunities.length}</p>
                    </div>
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground">Valor em aberto</p>
                      <p className="mt-1 text-lg font-semibold">R$ {activePipeline.toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                ) : null}
                {crmRuntime.modules.campaigns ? (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Campanhas ativas</span>
                    <span className="font-medium">{crmCampaigns.filter((item) => item.status === "running").length}</span>
                  </div>
                ) : null}
                {crmRuntime.modules.opportunities ? (
                  <Link to="/crm/pipeline" className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
                    <Target className="h-4 w-4" />Abrir pipeline
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Atendimento</p>
            <CardTitle className="mt-1 text-base">Conversas recentes</CardTitle>
          </div>
          <Link to="/conversations/inbox" className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            Ver todas as conversas
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {conversations.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-16" />)}
            </div>
          ) : conversations.isError ? (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed p-4 text-sm">
              <span className="text-muted-foreground">Não foi possível carregar as conversas agora.</span>
              <button className="shrink-0 font-medium text-primary hover:underline" onClick={() => conversations.refetch()} type="button">
                Tentar novamente
              </button>
            </div>
          ) : recentConversations.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
              Nenhuma conversa recente.
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {recentConversations.map((item) => (
                <div key={item.leadPhone} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <MessageCircleMore className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.leadPhone}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.leadIntent} · {item.leadQualification ?? "sem qualificação"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {item.hasPendingInbound ? <StatusPill tone="info">mensagem recebida</StatusPill> : null}
                    <StatusPill tone={item.state === "awaitingHuman" ? "warning" : item.state === "active" ? "success" : "neutral"}>
                      {item.state === "awaitingHuman" ? "aguardando humano" : item.state === "active" ? "bot ativo" : "encerrada"}
                    </StatusPill>
                    {item.lastActivityAt ? <span className="hidden text-xs text-muted-foreground md:inline">{formatDateTime(item.lastActivityAt)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Bot;
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
          </div>
          <span className="rounded-lg bg-accent p-2.5 text-accent-foreground"><Icon className="h-4 w-4" /></span>
        </div>
      </CardContent>
    </Card>
  );
}

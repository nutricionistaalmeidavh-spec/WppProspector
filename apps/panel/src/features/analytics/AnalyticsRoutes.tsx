import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CircleDollarSign, TrendingUp } from "lucide-react";
import { FeatureAvailability } from "@/components/FeatureAvailability";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCrmRepository } from "@/features/crm/repository";
import { useCrmRuntime } from "@/features/crm/runtime";
import { OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABEL } from "@/features/crm/types";

function useAnalyticsCrm() {
  const runtime = useCrmRuntime();
  const repository = useMemo(
    () => getCrmRepository(runtime.source === "http" ? "http" : "mock"),
    [runtime.source],
  );
  return { runtime, repository };
}

export function FunnelRoute() {
  const { runtime, repository } = useAnalyticsCrm();
  const supported = runtime.source !== "disabled" && runtime.modules.opportunities;
  const query = useQuery({
    queryKey: ["crm", runtime.source, "analytics", "opportunities"],
    queryFn: () => repository.listOpportunities(),
    enabled: supported,
    staleTime: Infinity,
  });
  const total = query.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="Funil" description="Volume e passagem das oportunidades entre etapas comerciais." />
      <FeatureAvailability feature="Analytics de funil" supported={supported}>
        {query.isLoading ? <Skeleton className="h-80" /> : (
          <div className="surface-panel p-5">
            <div className="space-y-3">
              {OPPORTUNITY_STAGES.filter((stage) => stage !== "lost").map((stage) => {
                const count = (query.data ?? []).filter((item) => item.stage === stage).length;
                const width = total > 0 ? Math.max(8, (count / total) * 100) : 0;
                return (
                  <div key={stage} className="grid gap-2 sm:grid-cols-[170px_1fr_42px] sm:items-center">
                    <span className="text-sm font-medium">{OPPORTUNITY_STAGE_LABEL[stage]}</span>
                    <div className="h-8 overflow-hidden rounded-md bg-muted"><div className="flex h-full items-center rounded-md bg-primary/85 px-3 text-xs font-medium text-primary-foreground" style={{ width: `${width}%` }}>{count > 0 ? `${count} opp.` : ""}</div></div>
                    <span className="text-right text-xs text-muted-foreground">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </FeatureAvailability>
    </div>
  );
}

export function ConversionsRoute() {
  const { runtime, repository } = useAnalyticsCrm();
  const supported = runtime.source !== "disabled" && runtime.modules.opportunities;
  const query = useQuery({
    queryKey: ["crm", runtime.source, "analytics", "opportunities"],
    queryFn: () => repository.listOpportunities(),
    enabled: supported,
    staleTime: Infinity,
  });
  const items = query.data ?? [];
  const won = items.filter((item) => item.stage === "won").length;
  const qualified = items.filter((item) => ["qualified", "meeting", "proposal", "negotiation", "won"].includes(item.stage)).length;
  const proposal = items.filter((item) => ["proposal", "negotiation", "won"].includes(item.stage)).length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="Conversões" description="Indicadores de avanço das oportunidades ao longo do processo comercial." />
      <FeatureAvailability feature="Analytics de conversão" supported={supported}>
        {query.isLoading ? <Skeleton className="h-64" /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ConversionCard icon={TrendingUp} label="Oportunidades" value={items.length} helper="base atual" />
            <ConversionCard icon={BarChart3} label="Qualificadas+" value={qualified} helper={percent(qualified, items.length)} />
            <ConversionCard icon={CircleDollarSign} label="Proposta+" value={proposal} helper={percent(proposal, items.length)} />
            <ConversionCard icon={TrendingUp} label="Ganhos" value={won} helper={percent(won, items.length)} />
          </div>
        )}
      </FeatureAvailability>
    </div>
  );
}

export function CampaignAnalyticsRoute() {
  const { runtime, repository } = useAnalyticsCrm();
  const supported = runtime.source !== "disabled" && runtime.modules.campaigns;
  const query = useQuery({
    queryKey: ["crm", runtime.source, "analytics", "campaigns"],
    queryFn: () => repository.listCampaigns(),
    enabled: supported,
    staleTime: Infinity,
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="Performance de campanhas" description="Comparativo de resposta, qualificação e oportunidades por campanha." />
      <FeatureAvailability feature="Analytics de campanhas" supported={supported}>
        {query.isLoading ? <Skeleton className="h-72" /> : (
          <div className="surface-panel divide-y overflow-hidden">
            {(query.data ?? []).map((campaign) => (
              <div key={campaign.id} className="grid gap-4 p-4 md:grid-cols-[1fr_repeat(4,100px)] md:items-center">
                <div><div className="flex items-center gap-2"><p className="font-semibold">{campaign.name}</p><StatusPill tone={campaign.status === "running" ? "success" : "warning"}>{campaign.status === "running" ? "rodando" : "pausada"}</StatusPill></div><p className="mt-1 text-xs text-muted-foreground">{campaign.audience} leads</p></div>
                <MiniMetric label="Respostas" value={campaign.replied} />
                <MiniMetric label="Qualif." value={campaign.qualified} />
                <MiniMetric label="Opps" value={campaign.opportunities} />
                <MiniMetric label="Ganhos" value={campaign.won} />
              </div>
            ))}
          </div>
        )}
      </FeatureAvailability>
    </div>
  );
}

function percent(value: number, total: number) {
  return total > 0 ? `${Math.round((value / total) * 100)}% da base` : "0% da base";
}

function ConversionCard({ icon: Icon, label, value, helper }: { icon: typeof TrendingUp; label: string; value: number; helper: string }) {
  return <Card className="shadow-sm"><CardContent className="p-5"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground"><Icon className="h-4 w-4" /></span><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></CardContent></Card>;
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-muted/45 p-2 text-center"><p className="text-sm font-semibold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>;
}

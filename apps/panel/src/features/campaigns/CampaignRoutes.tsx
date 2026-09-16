import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FileSpreadsheet, UsersRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { FeatureAvailability } from "@/components/FeatureAvailability";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/SectionState";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ImportDialog } from "@/features/leads/ImportDialog";
import { getCrmRepository } from "@/features/crm/repository";
import { useCrmRuntime } from "@/features/crm/runtime";
import type { CampaignSummary } from "@/features/crm/types";

const statusLabel: Record<CampaignSummary["status"], string> = {
  draft: "Rascunho",
  running: "Em execução",
  paused: "Pausada",
  completed: "Concluída",
};

function useCampaignRepository() {
  const runtime = useCrmRuntime();
  const repository = useMemo(
    () => getCrmRepository(runtime.source === "http" ? "http" : "mock"),
    [runtime.source],
  );
  return {
    repository,
    source: runtime.source,
    supported: runtime.source !== "disabled" && runtime.modules.campaigns,
  };
}

export function CampaignsRoute() {
  const crm = useCampaignRepository();
  const query = useQuery({ queryKey: ["crm", crm.source, "campaigns"], queryFn: () => crm.repository.listCampaigns(), enabled: crm.supported, staleTime: Infinity });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Prospecção" title="Campanhas" description="Acompanhe públicos, execução e resultado das ações de prospecção." />
      <FeatureAvailability feature="Campanhas CRM" supported={crm.supported}>
        {query.isLoading ? <Skeleton className="h-72" /> : (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {(query.data ?? []).map((campaign) => (
              <Link key={campaign.id} to={`/prospecting/campaigns/${campaign.id}`} className="group block">
                <Card className="h-full shadow-sm transition group-hover:border-primary/30 group-hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><CardTitle className="text-base">{campaign.name}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{campaign.audience} leads no público</p></div>
                      <StatusPill tone={campaign.status === "running" ? "success" : campaign.status === "paused" ? "warning" : "neutral"}>{statusLabel[campaign.status]}</StatusPill>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-4 gap-2 text-center text-xs">
                      <Metric label="Enviados" value={campaign.sent} />
                      <Metric label="Respostas" value={campaign.replied} />
                      <Metric label="Qualif." value={campaign.qualified} />
                      <Metric label="Ganhos" value={campaign.won} />
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                      <span>{campaign.failed} falha(s)</span>
                      <span className="inline-flex items-center gap-1 font-medium text-foreground">Detalhes <ArrowRight className="h-3.5 w-3.5" /></span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </FeatureAvailability>
    </div>
  );
}

export function CampaignDetailRoute() {
  const crm = useCampaignRepository();
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: ["crm", crm.source, "campaigns"], queryFn: () => crm.repository.listCampaigns(), enabled: crm.supported, staleTime: Infinity });
  const campaign = query.data?.find((item) => item.id === id);

  return (
    <FeatureAvailability feature="Detalhe da campanha" supported={crm.supported}>
      {query.isLoading ? <Skeleton className="h-96" /> : !campaign ? (
        <EmptyState title="Campanha não encontrada" description="Não foi possível encontrar esta campanha." />
      ) : (
        <div className="space-y-6">
          <PageHeader eyebrow="Campanha" title={campaign.name} description={`${campaign.audience} leads · ${statusLabel[campaign.status]}`} actions={<StatusPill tone={campaign.status === "running" ? "success" : "warning"}>{statusLabel[campaign.status]}</StatusPill>} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CampaignMetric label="Enviados" value={campaign.sent} helper={`${Math.round((campaign.sent / campaign.audience) * 100)}% do público`} />
            <CampaignMetric label="Respostas" value={campaign.replied} helper={`${Math.round((campaign.replied / Math.max(campaign.sent, 1)) * 100)}% dos enviados`} />
            <CampaignMetric label="Qualificados" value={campaign.qualified} helper={`${campaign.opportunities} oportunidades`} />
            <CampaignMetric label="Ganhos" value={campaign.won} helper={`${campaign.failed} falha(s)`} />
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Execução</CardTitle></CardHeader><CardContent><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (campaign.sent / Math.max(campaign.audience, 1)) * 100)}%` }} /></div><p className="mt-3 text-sm text-muted-foreground">{campaign.sent} de {campaign.audience} leads processados.</p></CardContent></Card>
            <Card className="shadow-sm"><CardHeader><CardTitle className="text-base">Resumo comercial</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><SummaryRow label="Oportunidades" value={campaign.opportunities} /><SummaryRow label="Ganhos" value={campaign.won} /><SummaryRow label="Falhas" value={campaign.failed} /></CardContent></Card>
          </div>
        </div>
      )}
    </FeatureAvailability>
  );
}

export function ImportsRoute() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Prospecção" title="Importações" description="Importe sua base XLSX, valide os dados e confirme antes de salvar." actions={<Button onClick={() => setOpen(true)}><FileSpreadsheet className="h-4 w-4" />Importar planilha</Button>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-sm lg:col-span-2"><CardHeader><CardTitle className="text-base">Como funciona</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3"><Step number="1" title="Selecionar" description="Escolha o arquivo XLSX com sua base." /><Step number="2" title="Validar" description="A interface normaliza telefones e separa rejeitados." /><Step number="3" title="Confirmar" description="Revise os dados antes de salvar." /></CardContent></Card>
        <Card className="shadow-sm"><CardContent className="flex h-full flex-col justify-between p-5"><div><span className="inline-flex rounded-lg bg-accent p-2 text-accent-foreground"><UsersRound className="h-5 w-5" /></span><h2 className="mt-4 font-semibold">Base atual</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">A importação cria ou atualiza leads e não inicia disparos automaticamente.</p></div><Link to="/crm/leads" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary">Ver leads <ArrowRight className="h-4 w-4" /></Link></CardContent></Card>
      </div>
      <ImportDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-muted/50 p-2.5"><p className="text-base font-semibold">{value}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p></div>;
}

function CampaignMetric({ label, value, helper }: { label: string; value: number; helper: string }) {
  return <Card className="shadow-sm"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{helper}</p></CardContent></Card>;
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span><span className="font-semibold">{value}</span></div>;
}

function Step({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="rounded-xl border p-4"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{number}</span><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>;
}

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { consumptionGroupBySchema, type ConsumptionGroupBy } from "@/api/contracts";
import { formatNumber, formatUsd } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/SectionState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useConsumption } from "./useConsumption";
import { useOverview } from "./useOverview";
import { usePeriod, type PeriodPreset } from "./usePeriod";

const GROUP_BY_OPTIONS = consumptionGroupBySchema.options;
const GROUP_BY_LABEL: Record<ConsumptionGroupBy, string> = { day: "Dia", lead: "Lead", model: "Modelo", category: "Categoria" };
const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "custom", label: "Personalizado" },
];

export function ConsumptionRoute() {
  const period = usePeriod("7d");
  const [groupBy, setGroupBy] = useState<ConsumptionGroupBy>("day");
  const consumption = useConsumption({ from: period.from, to: period.to, groupBy });
  const series = consumption.data;
  const rows = series?.rows ?? [];
  const total = series?.total;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Analytics" title="Consumo e custos" description="Acompanhe uso do LLM, custos estimados e volume operacional por período." />
      <OverviewCards />

      <div className="surface-panel flex flex-col gap-4 p-4 xl:flex-row xl:items-end">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Período</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => <Button key={preset.value} variant={period.preset === preset.value ? "default" : "outline"} size="sm" onClick={() => period.setPreset(preset.value)}>{preset.label}</Button>)}
          </div>
        </div>

        {period.preset === "custom" ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input aria-label="Data inicial" type="date" onChange={(event) => period.setCustom({ from: event.target.value, to: period.to.slice(0, 10) })} />
            <Input aria-label="Data final" type="date" onChange={(event) => period.setCustom({ from: period.from.slice(0, 10), to: event.target.value })} />
          </div>
        ) : null}

        <div className="xl:ml-auto">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Agrupar por</p>
          <div className="flex flex-wrap gap-1.5">
            {GROUP_BY_OPTIONS.map((value) => <Button key={value} variant={groupBy === value ? "default" : "outline"} size="sm" onClick={() => setGroupBy(value)}>{GROUP_BY_LABEL[value]}</Button>)}
          </div>
        </div>
      </div>

      {consumption.isError ? <ErrorState onRetry={() => consumption.refetch()} description="Erro ao carregar o consumo." /> : consumption.isLoading ? <Skeleton className="h-72 w-full" /> : (
        <div className="grid gap-5 2xl:grid-cols-[1fr_1.05fr]">
          <Card className="shadow-sm">
            <CardHeader><CardTitle className="text-sm">Custo estimado por {GROUP_BY_LABEL[groupBy].toLowerCase()}</CardTitle></CardHeader>
            <CardContent>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="key" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(value: number) => formatUsd(value)} />
                    <Bar dataKey="estimatedCostUsd" fill="hsl(var(--primary))" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="surface-panel overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{GROUP_BY_LABEL[groupBy]}</TableHead><TableHead className="text-right">Input</TableHead><TableHead className="text-right">Output</TableHead><TableHead className="text-right">Cache leitura</TableHead><TableHead className="text-right">Cache escrita</TableHead><TableHead className="text-right">Custo estimado</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Sem eventos de consumo no período.</TableCell></TableRow> : rows.map((row) => (
                  <TableRow key={row.key}><TableCell className="font-medium">{row.key}</TableCell><TableCell className="text-right">{formatNumber(row.inputTokens)}</TableCell><TableCell className="text-right">{formatNumber(row.outputTokens)}</TableCell><TableCell className="text-right">{formatNumber(row.cacheReadTokens)}</TableCell><TableCell className="text-right">{formatNumber(row.cacheWriteTokens)}</TableCell><TableCell className="text-right">{formatUsd(row.estimatedCostUsd)}{row.costPartial ? <Badge variant="outline" className="ml-2">parcial</Badge> : null}</TableCell></TableRow>
                ))}
                {total ? <TableRow className="font-semibold"><TableCell>Total do período</TableCell><TableCell className="text-right">{formatNumber(total.inputTokens)}</TableCell><TableCell className="text-right">{formatNumber(total.outputTokens)}</TableCell><TableCell className="text-right">{formatNumber(total.cacheReadTokens)}</TableCell><TableCell className="text-right">{formatNumber(total.cacheWriteTokens)}</TableCell><TableCell className="text-right">{formatUsd(total.estimatedCostUsd)}{total.costPartial ? <Badge variant="outline" className="ml-2">parcial</Badge> : null}</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewCards() {
  const { data, isLoading } = useOverview();
  if (isLoading || !data) return <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-24 w-full" />)}</div>;
  const cards = [
    { label: "Ativas", value: data.conversationsByState.active },
    { label: "Encerradas", value: data.conversationsByState.ended },
    { label: "Aguardando humano", value: data.conversationsByState.awaitingHuman },
    { label: "Leads", value: data.totalLeads },
    { label: "Inbound pendente", value: data.pendingInbound },
  ];
  return <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="overview-cards">{cards.map((card) => <Card key={card.label} className="shadow-sm"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{card.label}</p><p className="mt-2 text-2xl font-semibold">{card.value}</p></CardContent></Card>)}</div>;
}

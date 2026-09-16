import { Bot, CheckCircle2, CircleDashed, MessageSquare, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@/components/StatusPill";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionAvailability } from "@/features/actions/useActionAvailability";
import { isCrmPreviewEnabled } from "@/features/crm/preview";

export function SettingsRoute() {
  const capabilities = useActionAvailability();
  const preview = isCrmPreviewEnabled();

  const rows = [
    { label: "Ações de conversa", enabled: capabilities.conversationActions, icon: MessageSquare, detail: "handoff, retomada e mensagem manual" },
    { label: "Prospecção", enabled: capabilities.prospecting, icon: UploadCloud, detail: "importação e disparo em lote" },
    { label: "CRM avançado", enabled: false, icon: Bot, detail: preview ? "visível em preview com adapters mockados" : "aguardando contratos de oportunidades/campanhas" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Sistema" title="Configurações" description="Estado das integrações que a interface consegue consumir neste deploy." />
      <Card className="max-w-3xl shadow-sm">
        <CardHeader><CardTitle className="text-base">Capabilities</CardTitle></CardHeader>
        <CardContent className="divide-y p-0">
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <div key={row.label} className="flex items-center gap-4 px-5 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{row.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p></div>
                <StatusPill tone={row.enabled ? "success" : preview && row.label === "CRM avançado" ? "info" : "neutral"}>
                  {row.enabled ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />ativo</span> : preview && row.label === "CRM avançado" ? "preview" : <span className="inline-flex items-center gap-1"><CircleDashed className="h-3 w-3" />pendente</span>}
                </StatusPill>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

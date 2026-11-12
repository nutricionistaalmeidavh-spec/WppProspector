import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { apiFetch } from "@/api/client";
import { useSession } from "@/auth/session";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type OnboardingAnalytics } from "./api";

const descriptions:Record<string,string> = {
  business:"Empresa",crm:"Funil comercial",whatsapp:"WhatsApp",rules:"Motor de regras / IA",review:"Revisão final",
};
export function OnboardingAnalyticsRoute() {
  const {role}=useSession();
  const query=useQuery({queryKey:["onboarding","analytics"],
    queryFn:()=>apiFetch<OnboardingAnalytics>("/onboarding/analytics"),enabled:role==="admin",retry:false});
  if(role && role!=="admin")return <Navigate to="/settings" replace/>;
  return <div className="space-y-5">
    <PageHeader eyebrow="Configurações" title="Progresso do primeiro acesso"
      description="Indicadores armazenados localmente. Nenhum serviço de analytics externo é necessário." />
    {query.isLoading?<p role="status" className="text-sm">Carregando indicadores…</p>:null}
    {query.isError?<p role="alert" className="text-sm text-destructive">Não foi possível consultar o progresso. Verifique o servidor e tente novamente.</p>:null}
    {query.data?<><div className="grid gap-3 sm:grid-cols-3">
      {[
        ["Configuração",query.data.ready?"Concluída":"Pendente"],
        ["Primeira operação",String(query.data.firstOperations)],
        ["Tours concluídos",String(query.data.tours.completed??0)],
      ].map(([label,value])=><Card key={label}><CardHeader><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{value}</CardContent></Card>)}
    </div>
    <Card><CardHeader><CardTitle className="text-base">Etapas da configuração</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {Object.entries(query.data.setup).map(([step,status])=><div key={step} className="flex justify-between gap-4 border-b py-2 text-sm last:border-0"><span>{descriptions[step]??step}</span><span className="text-muted-foreground">{status==="completed"?"Concluída":status==="skipped"?"Adiada":"Pendente"}</span></div>)}
      </CardContent></Card>
    <p className="text-xs text-muted-foreground">Esses números refletem a instalação local, não uma taxa de conversão populacional. Para avaliar abandono, compare as etapas pendentes e adiada(s) e repita testes reais com usuários.</p>
    </>:null}
    <Link to="/onboarding" className="inline-block rounded-md border px-3 py-2 text-sm hover:bg-muted">Abrir configuração guiada</Link>
  </div>;
}

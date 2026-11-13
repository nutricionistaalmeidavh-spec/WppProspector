import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { useSession } from "@/auth/session";
type Agent={ownerId:string;name:string;assigned:number;waiting:number;opportunities:number;won:number;transfersReceived:number};
type Metrics={unassigned:number;byAgent:Agent[]};
export function TeamMetricsRoute(){
  const {role}=useSession();
  const query=useQuery({queryKey:["engagement","metrics"],queryFn:()=>apiFetch<Metrics>("/engagement/metrics"),refetchInterval:30000});
  if(role==="agent")return <p className="rounded-lg border p-4 text-sm">Indicadores gerenciais disponíveis para gestores e administradores.</p>;
  return <div className="space-y-5">
    <PageHeader eyebrow="Analytics" title="Atendimento por equipe" description="Indicadores do estado canônico, sem estimativas de mensagens ou tempos de resposta."/>
    {query.isError?<p role="alert" className="rounded-md border p-3 text-sm text-destructive">Não foi possível carregar os indicadores.</p>:null}
    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Conversas sem operador</p><p className="mt-1 text-3xl font-semibold">{query.data?.unassigned??"—"}</p></div>
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[650px] text-left text-sm">
        <thead className="border-b bg-muted/40 text-xs"><tr>
          <th className="p-3">Operador</th><th className="p-3 text-right">Atribuídas</th>
          <th className="p-3 text-right">Aguardando humano</th><th className="p-3 text-right">Oportunidades</th>
          <th className="p-3 text-right">Ganhos</th><th className="p-3 text-right">Transferências recebidas</th>
        </tr></thead>
        <tbody>{(query.data?.byAgent??[]).map(agent=><tr key={agent.ownerId} className="border-b last:border-0">
          <td className="p-3 font-medium">{agent.name}</td><td className="p-3 text-right">{agent.assigned}</td>
          <td className="p-3 text-right">{agent.waiting}</td><td className="p-3 text-right">{agent.opportunities}</td>
          <td className="p-3 text-right">{agent.won}</td><td className="p-3 text-right">{agent.transfersReceived}</td>
        </tr>)}</tbody>
      </table>
      {query.data?.byAgent.length===0?<p className="p-4 text-sm text-muted-foreground">Cadastre operadores na seção Equipe para acompanhar os indicadores.</p>:null}
    </div>
    <p className="text-xs text-muted-foreground">As métricas acima contabilizam atribuições e negócios reais do SQLite local. Tempo de primeira resposta e SLA não são exibidos até existir captura confiável de eventos de mensagens.</p>
  </div>;
}

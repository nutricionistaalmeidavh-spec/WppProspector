import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { MessageCircleMore, Search, UserRoundCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState, ErrorState } from "@/components/SectionState";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { ConversationDetailPanel } from "@/features/conversations/ConversationDetailRoute";
import { useConversationList, type ConversationFilters } from "@/features/conversations/useConversationList";

type Assignment={phone:string;ownerId:string|null;ownerName:string|null;department:string};
type Operator={id:string;username:string};

export function InboxRoute({ awaitingHuman = false }: { awaitingHuman?: boolean }) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [ownerFilter,setOwnerFilter]=useState("all");
  const [departmentFilter,setDepartmentFilter]=useState("all");
  const [notificationStatus,setNotificationStatus]=useState<"off"|"on"|"blocked">("off");
  const knownActivity=useRef<Map<string,string>>(new Map());
  const initialized=useRef(false);
  const assignments=useQuery({queryKey:["engagement","assignments"],queryFn:()=>apiFetch<{items:Assignment[]}>("/engagement/assignments"),refetchInterval:12000});
  const operators=useQuery({queryKey:["crm","team"],queryFn:()=>apiFetch<{items:Operator[]}>("/crm/team")});
  const debouncedPhone = useDebouncedValue(phone, 300);
  const filters = useMemo<ConversationFilters>(() => ({
    state: awaitingHuman ? "awaitingHuman" : undefined,
    phone: debouncedPhone || undefined,
  }), [awaitingHuman, debouncedPhone]);
  const query = useConversationList(filters);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const assignedByPhone=useMemo(()=>new Map((assignments.data?.items??[]).map(a=>[a.phone,a])),[assignments.data]);
  const visibleItems=useMemo(()=>items.filter(item=>{
    const a=assignedByPhone.get(item.leadPhone);
    if(ownerFilter==="unassigned"&&a?.ownerId)return false;
    if(ownerFilter!=="all"&&ownerFilter!=="unassigned"&&a?.ownerId!==ownerFilter)return false;
    if(departmentFilter!=="all"&&(a?.department??"Geral")!==departmentFilter)return false;
    return true;
  }),[items,assignedByPhone,ownerFilter,departmentFilter]);
  const departments=useMemo(()=>[...new Set((assignments.data?.items??[]).map(x=>x.department).concat("Geral"))].sort(),[assignments.data]);
  useEffect(()=>{
    const latest=new Map(items.map(item=>[item.leadPhone,item.lastActivityAt??""]));
    if(initialized.current&&notificationStatus==="on"&&typeof Notification!=="undefined"&&Notification.permission==="granted"){
      for(const item of items){
        const previous=knownActivity.current.get(item.leadPhone);
        if(item.hasPendingInbound&&previous!==undefined&&previous!==(item.lastActivityAt??"")){
          new Notification("Nova mensagem no WPP CRM",{body:"Contato "+item.leadPhone+" requer atenção."});
        }
      }
    }
    knownActivity.current=latest;
    initialized.current=true;
  },[items,notificationStatus]);
  async function enableNotifications(){
    if(typeof Notification==="undefined"){setNotificationStatus("blocked");return;}
    try{setNotificationStatus(await Notification.requestPermission()==="granted"?"on":"blocked");}
    catch{setNotificationStatus("blocked");}
  }

  function openConversation(leadPhone: string) {
    const desktop =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 1024px)").matches
        : window.innerWidth >= 1024;

    if (desktop) {
      setSelectedPhone(leadPhone);
      return;
    }
    navigate(`/conversations/${encodeURIComponent(leadPhone)}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conversas"
        actions={<Link className="text-sm font-medium text-primary hover:underline" to="/conversations/history">Histórico e filtros</Link>}
        title={awaitingHuman ? "Aguardando humano" : "Inbox"}
        description={awaitingHuman ? "Conversas que pedem intervenção do operador." : "Priorize respostas e abra o contexto completo de cada lead."}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <label className="text-xs">Responsável
          <select aria-label="Filtrar responsável" value={ownerFilter} onChange={e=>setOwnerFilter(e.target.value)} className="ml-2 h-9 rounded-md border bg-background px-2">
            <option value="all">Todos</option><option value="unassigned">Não atribuídos</option>
            {(operators.data?.items??[]).map(op=><option key={op.id} value={op.id}>{op.username}</option>)}
          </select>
        </label>
        <label className="text-xs">Setor
          <select aria-label="Filtrar setor" value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)} className="ml-2 h-9 rounded-md border bg-background px-2">
            <option value="all">Todos</option>{departments.map(dept=><option key={dept} value={dept}>{dept}</option>)}
          </select>
        </label>
        <span className="text-xs text-muted-foreground">{visibleItems.length} conversas nesta lista</span>
        <Button variant="outline" size="sm" disabled={notificationStatus==="on"} onClick={()=>void enableNotifications()}>{notificationStatus==="on"?"Alertas ativados":notificationStatus==="blocked"?"Alertas indisponíveis":"Ativar alertas"}</Button>
      </div>
      <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[380px_1fr]">
        <section className="border-b lg:border-b-0 lg:border-r">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar telefone" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </div>
          </div>

          <div className="app-scrollbar max-h-[560px] overflow-y-auto">
            {query.isError ? <div className="p-3"><ErrorState onRetry={() => query.refetch()} description="Falha ao carregar a Inbox." /></div> : null}
            {query.isLoading ? <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-20" />)}</div> : null}
            {!query.isLoading && !query.isError && visibleItems.length === 0 ? <div className="p-3"><EmptyState title="Nada por aqui" description={awaitingHuman ? "Nenhuma conversa está aguardando humano." : "Nenhuma conversa corresponde aos filtros."} /></div> : null}
            {visibleItems.map((item) => (
              <button
                key={item.leadPhone}
                className={`flex w-full items-start gap-3 border-b px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-muted/45 ${selectedPhone === item.leadPhone ? "bg-muted/45" : ""}`}
                onClick={() => openConversation(item.leadPhone)}
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {item.leadPhone.slice(-2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{item.leadPhone}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(item.lastActivityAt)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={item.state === "awaitingHuman" ? "warning" : item.state === "active" ? "success" : "neutral"}>
                      {item.state === "awaitingHuman" ? "aguardando humano" : item.state === "active" ? "bot ativo" : "encerrada"}
                    </StatusPill>
                    {item.hasPendingInbound ? <StatusPill tone="info">mensagem recebida</StatusPill> : null}
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">{assignedByPhone.get(item.leadPhone)?.ownerName??"Sem responsável"} · {assignedByPhone.get(item.leadPhone)?.department??"Geral"}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.leadIntent} · {item.leadQualification ?? "sem qualificação"}</p>
                </div>
              </button>
            ))}
          </div>
          {query.hasNextPage ? (
            <div className="border-t p-3">
              <Button variant="outline" size="sm" className="w-full" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
                {query.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
              </Button>
            </div>
          ) : null}
        </section>

        <section className="hidden bg-muted/15 lg:block">
          {selectedPhone ? (
            <div className="app-scrollbar max-h-[620px] overflow-y-auto p-6">
              <ConversationDetailPanel leadPhone={selectedPhone} />
            </div>
          ) : (
            <div className="flex min-h-[620px] items-center justify-center p-10">
              <div className="max-w-sm text-center">
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  {awaitingHuman ? <UserRoundCheck className="h-5 w-5" /> : <MessageCircleMore className="h-5 w-5" />}
                </span>
                <h2 className="mt-4 font-semibold">Selecione uma conversa</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">O histórico e as ações da conversa aparecem aqui.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
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

export function InboxRoute({ awaitingHuman = false }: { awaitingHuman?: boolean }) {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const debouncedPhone = useDebouncedValue(phone, 300);
  const filters = useMemo<ConversationFilters>(() => ({
    state: awaitingHuman ? "awaitingHuman" : undefined,
    phone: debouncedPhone || undefined,
  }), [awaitingHuman, debouncedPhone]);
  const query = useConversationList(filters);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

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
            {!query.isLoading && !query.isError && items.length === 0 ? <div className="p-3"><EmptyState title="Nada por aqui" description={awaitingHuman ? "Nenhuma conversa está aguardando humano." : "Nenhuma conversa corresponde aos filtros."} /></div> : null}
            {items.map((item) => (
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
                  <p className="mt-1.5 truncate text-xs text-muted-foreground">{item.leadIntent} · {item.leadQualification ?? "sem qualificação"}</p>
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

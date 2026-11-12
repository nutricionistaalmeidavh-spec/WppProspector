import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Company, Opportunity } from "@/features/crm/types";

interface ConversationContext {
  phone: string;
  exists: boolean;
  lead: null | { phone: string; displayName?: string | null; source?: string | null; company?: string | null; city?: string | null; segment?: string | null; notes?: string | null };
  opportunities: Opportunity[];
  suggestions: Opportunity[];
}
type ContactFields = { displayName: string; company: string; city: string; segment: string; notes: string };
const EMPTY: ContactFields = { displayName: "", company: "", city: "", segment: "", notes: "" };
const wrap = (value: unknown) => value instanceof Error ? value.message : "Não foi possível salvar.";

export function ConversationCrmPanel({ leadPhone }: { leadPhone: string }) {
  const client = useQueryClient();
  const phone = leadPhone.startsWith("+") ? leadPhone : "+" + leadPhone;
  const context = useQuery({ queryKey: ["crm", "conversation", phone],
    queryFn: () => apiFetch<ConversationContext>("/crm/conversations/" + encodeURIComponent(phone) + "/context"),
    retry: false });
  const companies = useQuery({ queryKey: ["crm", "companies"], queryFn: () =>
    apiFetch<{ items: Company[] }>("/crm/companies"), enabled: Boolean(context.data) });
  const all = useQuery({ queryKey: ["crm", "all-opportunities"], queryFn: () =>
    apiFetch<{ items: Opportunity[] }>("/crm/opportunities"), enabled: Boolean(context.data) });
  const directory = useQuery({queryKey:["whatsapp","contact",phone],queryFn:()=>
    apiFetch<{items:Array<{phone:string;displayName:string}>}>("/whatsapp/contacts",{query:{search:phone}}),enabled:Boolean(context.data)});
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<ContactFields>(EMPTY);
  const [companyId, setCompanyId] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [oppTitle, setOppTitle] = useState("");
  const [linkedId, setLinkedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const lead = context.data?.lead;
  const synced = directory.data?.items.find(c => c.phone === phone);
  useEffect(() => {
    if (editing) return;
    setFields({
      displayName: lead?.displayName || synced?.displayName || "", company: lead?.company ?? "",
      city: lead?.city ?? "", segment: lead?.segment ?? "", notes: lead?.notes ?? "",
    });
  }, [editing, lead?.displayName, lead?.company, lead?.city, lead?.segment, lead?.notes, synced?.displayName, phone]);

  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["crm"] }),
      client.invalidateQueries({ queryKey: ["conversations"] }),
    ]);
  };
  const action = async (task: () => Promise<unknown>, message: string) => {
    if (busy) return false;
    setBusy(true); setError(""); setSuccess("");
    try { await task(); await refresh(); setSuccess(message); return true; }
    catch (err) { setError(wrap(err)); return false; }
    finally { setBusy(false); }
  };

  if (context.isLoading) return <div className="text-xs text-muted-foreground">Carregando contexto CRM…</div>;
  if (context.isError || !context.data?.exists) return null;
  const related = context.data.opportunities;
  const available = (all.data?.items ?? []).filter(opp => !related.some(item => item.id === opp.id));
  const name = lead?.displayName?.trim();
  const incomplete = !name;

  return <section className="space-y-3 rounded-lg border p-4" aria-label="Contato e oportunidades CRM">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-sm font-semibold">Contato e oportunidades</h2>
        <p className="text-xs text-muted-foreground">{name || synced?.displayName || "Contato sem nome"} · {phone}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => setEditing(!editing)}>
        {editing ? "Cancelar" : incomplete ? "Completar cadastro" : "Editar contato"}
      </Button>
    </div>
    {synced?.displayName && !name ? <p className="text-xs text-muted-foreground">Nome encontrado na agenda: {synced.displayName}. Confirme antes de salvar.</p> : null}
    {editing ? <form className="grid gap-2 sm:grid-cols-2" onSubmit={e => {
      e.preventDefault();
      void action(() => apiFetch("/crm/conversations/" + encodeURIComponent(phone) + "/contact",
        { method: "PATCH", body: fields }), "Contato atualizado.").then(ok => { if (ok) setEditing(false); });
    }}>
      {(["displayName","company","city","segment"] as const).map(key =>
        <label key={key} className="text-xs">{({displayName:"Nome",company:"Empresa",city:"Cidade",segment:"Segmento"} as const)[key]}
          <Input value={fields[key]} maxLength={key==="displayName"||key==="company"?160:100}
            onChange={e=>setFields(previous=>({...previous,[key]:e.target.value}))}/>
        </label>)}
      <label className="text-xs sm:col-span-2">Observações
        <Input value={fields.notes} maxLength={3000} onChange={e=>setFields(previous=>({...previous,notes:e.target.value}))}/>
      </label>
      <div className="sm:col-span-2"><Button size="sm" disabled={busy} type="submit">Salvar contato</Button></div>
    </form> : null}

    <div className="border-t pt-3 space-y-2">
      <h3 className="text-xs font-semibold">Oportunidades vinculadas ({related.length})</h3>
      {related.length===0 ? <p className="text-xs text-muted-foreground">Nenhuma oportunidade vinculada a este número.</p> : null}
      {related.map(opp => <div key={opp.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 p-2 text-xs">
        <div className="min-w-0"><Link className="font-medium text-primary hover:underline" to={`/crm/opportunities/${opp.id}`}>{opp.title}</Link>
          <p className="truncate text-muted-foreground">{opp.companyName} · {opp.stage}</p>
        </div>
        {opp.leadPhone!==phone ? <Button size="sm" variant="ghost" disabled={busy}
          onClick={() => void action(() => apiFetch("/crm/conversations/" + encodeURIComponent(phone) +
            "/opportunities/" + opp.id,{method:"DELETE"}),"Vínculo removido.")}>Desvincular</Button> :
          <span className="shrink-0 text-muted-foreground">Principal</span>}
      </div>)}
      {context.data.suggestions.length>0 ? <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Sugestões por empresa (confirmar vínculo):</p>
        {context.data.suggestions.map(opp=><Button key={opp.id} variant="outline" size="sm" disabled={busy}
          onClick={()=>void action(()=>apiFetch("/crm/conversations/"+encodeURIComponent(phone)+"/opportunities/"+opp.id,{method:"POST"}),"Oportunidade vinculada.")}>
          Vincular: {opp.title}</Button>)}
      </div>:null}
      {available.length>0 ? <div className="flex flex-wrap gap-2">
        <select aria-label="Oportunidade existente" className="h-9 max-w-full flex-1 rounded-md border bg-background px-2 text-xs"
          value={linkedId} onChange={e=>setLinkedId(e.target.value)}>
          <option value="">Selecionar oportunidade existente</option>
          {available.map(opp=><option key={opp.id} value={opp.id}>{opp.companyName} · {opp.title}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={busy||!linkedId} onClick={()=>void action(
          ()=>apiFetch("/crm/conversations/"+encodeURIComponent(phone)+"/opportunities/"+linkedId,{method:"POST"}),
          "Oportunidade vinculada.").then(ok=>{if(ok)setLinkedId("");})}>Vincular</Button>
      </div>:null}
    </div>
    <form className="space-y-2 border-t pt-3" onSubmit={event=>{
      event.preventDefault();
      void action(async ()=>{
        let selected=companyId;
        if(!selected && newCompany.trim()){
          const created=await apiFetch<Company>("/crm/companies",{method:"POST",body:{name:newCompany.trim()}});
          selected=created.id;
        }
        if(!selected) throw new Error("Selecione ou cadastre uma empresa.");
        await apiFetch("/crm/opportunities",{method:"POST",body:{title:oppTitle.trim(),companyId:selected,leadPhone:phone}});
      },"Nova oportunidade criada no Kanban.").then(ok=>{if(ok){setOppTitle("");setNewCompany("");}});
    }}>
      <h3 className="text-xs font-semibold">Criar oportunidade a partir desta conversa</h3>
      <Input aria-label="Título da oportunidade" required minLength={2} maxLength={180}
        placeholder="Título da oportunidade" value={oppTitle} onChange={e=>setOppTitle(e.target.value)}/>
      <select aria-label="Empresa da oportunidade" className="h-9 w-full rounded-md border bg-background px-2 text-xs"
        value={companyId} onChange={e=>setCompanyId(e.target.value)}>
        <option value="">Selecionar empresa</option>
        {(companies.data?.items??[]).map(company=><option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
      {!companyId ? <Input aria-label="Nova empresa" maxLength={160} placeholder="Ou cadastrar nova empresa"
        value={newCompany} onChange={e=>setNewCompany(e.target.value)}/> : null}
      <Button size="sm" disabled={busy||oppTitle.trim().length<2||(!companyId&&newCompany.trim().length<2)}
        type="submit">Criar no Kanban</Button>
    </form>
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    {success ? <p role="status" className="text-xs text-muted-foreground">{success}</p> : null}
  </section>;
}

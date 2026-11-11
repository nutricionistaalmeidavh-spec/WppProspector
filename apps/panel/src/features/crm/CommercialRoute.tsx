import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { FeatureAvailability } from "@/components/FeatureAvailability";
import { useCrmRuntime } from "./runtime";
import type { Opportunity } from "./types";

type Customer={id:string;name:string;leadPhone:string;companyId:string|null};
type Quote={id:string;opportunityId:string;customerId:string;totalCents:number;status:string;
  items:Array<{description:string;quantity:number;unitCents:number;lineCents:number}>};
type Activity={id:string;opportunityId:string;kind:string;subject:string;dueAt:string;
  owner:string;status:"OPEN"|"DONE";completedAt:string|null};
type Summary={total:number;won:number;openValue:number;weightedValue:number;overdueActivities:number;
  byOwner:Array<{name:string;total:number;won:number;value:number}>;
  bySource:Array<{name:string;total:number;won:number;value:number}>};
type Item={description:string;quantity:string;unitPrice:string};
const money=(n:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(n);

function Field({label,id,children}:{label:string;id:string;children:ReactNode}) {
  return <div className="min-w-0 space-y-1"><label className="block text-sm font-medium" htmlFor={id}>{label}</label>{children}</div>;
}
const inputClass="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
const buttonClass="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";
const plainButton="rounded-md border px-3 py-2 text-sm font-medium";
const card="space-y-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5";

export function CommercialRoute() {
  const runtime=useCrmRuntime();
  const enabled=runtime.source==="http"&&runtime.modules.opportunities&&runtime.modules.companies;
  const client=useQueryClient();
  const opportunities=useQuery({queryKey:["crm","commercial","opportunities"],queryFn:()=>apiFetch<{items:Opportunity[]}>("/crm/opportunities"),enabled});
  const customers=useQuery({queryKey:["crm","commercial","customers"],queryFn:()=>apiFetch<{items:Customer[]}>("/crm/customers"),enabled});
  const quotes=useQuery({queryKey:["crm","commercial","quotes"],queryFn:()=>apiFetch<{items:Quote[]}>("/crm/quotes"),enabled});
  const activities=useQuery({queryKey:["crm","commercial","activities"],queryFn:()=>apiFetch<{items:Activity[]}>("/crm/activities"),enabled});
  const summary=useQuery({queryKey:["crm","commercial","summary"],queryFn:()=>apiFetch<Summary>("/crm/analytics/commercial"),enabled});
  const [chosen,setChosen]=useState("");
  const [items,setItems]=useState<Item[]>([{description:"",quantity:"1",unitPrice:"0"}]);
  const [notes,setNotes]=useState("");
  const [activity,setActivity]=useState({kind:"CALL",subject:"",dueAt:new Date().toISOString().slice(0,10),owner:""});
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const selected=useMemo(()=>
    opportunities.data?.items.find(o=>o.id===chosen)??opportunities.data?.items[0],
  [opportunities.data,chosen]);
  const available=Boolean(selected)&&enabled;
  async function action(fn:()=>Promise<unknown>,success:string) {
    setBusy(true);setError("");setNotice("");
    try {await fn();await client.invalidateQueries({queryKey:["crm"]});setNotice(success);}
    catch(err){setError(err instanceof Error?err.message:"Falha na operação");}
    finally {setBusy(false);}
  }
  const setItem=(index:number,patch:Partial<Item>)=>
    setItems(list=>list.map((item,i)=>i===index?{...item,...patch}:item));
  const quotesOfSelected=quotes.data?.items.filter(q=>q.opportunityId===selected?.id)??[];
  const tasksOfSelected=activities.data?.items.filter(a=>a.opportunityId===selected?.id)??[];

  return <div className="space-y-5">
    <PageHeader eyebrow="CRM" title="CRM comercial"
      description="Clientes, propostas, tarefas e indicadores locais, sem cobrança ou mensagens automáticas."/>
    <FeatureAvailability feature="CRM comercial" supported={enabled}>
      {error?<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>:null}
      {notice?<p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>:null}
      <div className={card}>
        <Field id="crm-commercial-opp" label="Oportunidade ativa">
          <select id="crm-commercial-opp" className={inputClass} value={selected?.id??""}
            onChange={e=>setChosen(e.target.value)} disabled={!opportunities.data?.items.length}>
            {(opportunities.data?.items??[]).map(o=><option key={o.id} value={o.id}>{o.companyName} — {o.title}</option>)}
          </select>
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">{selected?selected.leadName+" · "+selected.leadPhone:"Cadastre uma oportunidade para iniciar."}</p>
          <button type="button" className={plainButton} disabled={!available||busy} onClick={()=>void action(
            ()=>apiFetch("/crm/customers/convert",{method:"POST",body:{leadPhone:selected!.leadPhone}}),
            "Lead convertido em cliente; histórico original preservado."
          )}>Converter lead selecionado</button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className={card} aria-label="Orçamentos locais">
          <div><h2 className="font-semibold">Orçamentos</h2><p className="text-xs text-muted-foreground">Propostas comerciais, sem emissão fiscal ou cobrança.</p></div>
          {items.map((item,i)=><div className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_90px_120px_auto]" key={i}>
            <Field id={"quote-desc-"+i} label={"Descrição do item "+(i+1)}>
              <input className={inputClass} id={"quote-desc-"+i} value={item.description}
                onChange={e=>setItem(i,{description:e.target.value})} maxLength={200}/>
            </Field>
            <Field id={"quote-quantity-"+i} label={"Quantidade do item "+(i+1)}>
              <input className={inputClass} id={"quote-quantity-"+i} type="number" min="0.01" step="any"
                value={item.quantity} onChange={e=>setItem(i,{quantity:e.target.value})}/>
            </Field>
            <Field id={"quote-price-"+i} label={"Valor unitário do item "+(i+1)}>
              <input className={inputClass} id={"quote-price-"+i} type="number" min="0" step="0.01"
                value={item.unitPrice} onChange={e=>setItem(i,{unitPrice:e.target.value})}/>
            </Field>
            <button className={plainButton+" self-end"} type="button" disabled={items.length===1||busy}
              aria-label={"Remover item "+(i+1)}
              onClick={()=>setItems(list=>list.filter((_,n)=>n!==i))}>Remover</button>
          </div>)}
          <button type="button" className={plainButton} disabled={items.length>=100||busy}
            onClick={()=>setItems(list=>[...list,{description:"",quantity:"1",unitPrice:"0"}])}>Adicionar item</button>
          <Field id="quote-notes" label="Observações">
            <textarea id="quote-notes" className={inputClass+" min-h-20 py-2"} maxLength={3000}
              value={notes} onChange={e=>setNotes(e.target.value)}/>
          </Field>
          <button type="button" className={buttonClass} disabled={!available||busy||!items.every(i=>
            i.description.trim()&&Number(i.quantity)>0&&Number(i.unitPrice)>=0)}
            onClick={()=>void action(()=>apiFetch("/crm/quotes",{method:"POST",body:{
              opportunityId:selected!.id,notes,items:items.map(i=>({description:i.description,
                quantity:Number(i.quantity),unitPrice:Number(i.unitPrice)})),
            }}),"Orçamento registrado. Uma oportunidade possui uma proposta local única.")}>Criar orçamento</button>
          {quotesOfSelected.map(q=><div className="flex items-center justify-between rounded-lg border p-3 text-sm" key={q.id}>
            <span>Proposta {q.id.slice(0,8)} · {q.status}</span><strong>{money(q.totalCents/100)}</strong>
          </div>)}
        </section>
        <section className={card} aria-label="Agenda de atividades">
          <div><h2 className="font-semibold">Agenda comercial</h2><p className="text-xs text-muted-foreground">Ações internas; não enviam WhatsApp automaticamente.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="crm-task-kind" label="Tipo">
              <select id="crm-task-kind" className={inputClass} value={activity.kind}
                onChange={e=>setActivity(a=>({...a,kind:e.target.value}))}>
                {["CALL","EMAIL","WHATSAPP","MEETING","TASK"].map(x=><option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
            <Field id="crm-task-due" label="Vencimento">
              <input id="crm-task-due" className={inputClass} type="date" value={activity.dueAt}
                onChange={e=>setActivity(a=>({...a,dueAt:e.target.value}))}/>
            </Field>
            <Field id="crm-task-subject" label="Assunto">
              <input id="crm-task-subject" className={inputClass} maxLength={300} value={activity.subject}
                onChange={e=>setActivity(a=>({...a,subject:e.target.value}))}/>
            </Field>
            <Field id="crm-task-owner" label="Responsável">
              <input id="crm-task-owner" className={inputClass} maxLength={120} value={activity.owner}
                onChange={e=>setActivity(a=>({...a,owner:e.target.value}))}/>
            </Field>
          </div>
          <button type="button" className={buttonClass} disabled={!available||busy||!activity.subject.trim()||!activity.dueAt}
            onClick={()=>void action(async()=>{
              await apiFetch("/crm/activities",{method:"POST",body:{...activity,opportunityId:selected!.id}});
              setActivity(a=>({...a,subject:""}));
            },"Atividade registrada.")}>Criar atividade</button>
          <div className="space-y-2">
            {tasksOfSelected.map(task=><div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div><p className="font-medium">{task.subject}</p><p className="text-xs text-muted-foreground">{task.kind} · {task.dueAt} · {task.owner||"Sem responsável"} · {task.status}</p></div>
              {task.status==="OPEN"?<button type="button" className={plainButton} disabled={busy} onClick={()=>void action(
                ()=>apiFetch("/crm/activities/"+encodeURIComponent(task.id)+"/complete",{method:"POST"}),
                "Atividade concluída.")}>Concluir</button>:null}
            </div>)}
          </div>
        </section>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores comerciais">
        {[
          ["Oportunidades",summary.data?.total??0],
          ["Negócios ganhos",summary.data?.won??0],
          ["Pipeline aberto",money(summary.data?.openValue??0)],
          ["Atividades atrasadas",summary.data?.overdueActivities??0],
        ].map(([label,value])=><div className="rounded-xl border bg-card p-4" key={label}>
          <p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p>
        </div>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className={card}><h2 className="font-semibold">Clientes convertidos ({customers.data?.items.length??0})</h2>
          <div className="space-y-2 text-sm">{(customers.data?.items??[]).map(customer=>
            <p key={customer.id} className="rounded-lg border p-2">{customer.name} · {customer.leadPhone}</p>)}</div>
        </section>
        <section className={card}><h2 className="font-semibold">Resultados por responsável</h2>
          <p className="text-xs text-muted-foreground">Pipeline ponderado: {money(summary.data?.weightedValue??0)}</p>
          {(summary.data?.byOwner??[]).map(row=><div className="flex justify-between gap-2 text-sm" key={row.name}>
            <span>{row.name}</span><span>{row.total} oportunidades · {row.won} ganhos</span>
          </div>)}
        </section>
      </div>
    </FeatureAvailability>
  </div>;
}

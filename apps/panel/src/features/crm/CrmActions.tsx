import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Company, CampaignSummary, Opportunity, OpportunityStage } from "./types";
import { OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABEL } from "./types";

function Field({id,label,children}:{id:string;label:string;children:ReactNode}) {
  return <div className="space-y-1"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
function Notice({error,success}:{error:string;success:string}) {
  return <>{error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
    {success?<p role="status" className="text-sm text-muted-foreground">{success}</p>:null}</>;
}

export function CompanyEditor({company}:{company?:Company}) {
  const queryClient=useQueryClient();
  const [open,setOpen]=useState(false);
  const [name,setName]=useState(company?.name??"");
  const [city,setCity]=useState(company?.city??"");
  const [segment,setSegment]=useState(company?.segment??"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[success,setSuccess]=useState("");
  async function save(e:FormEvent) {
    e.preventDefault();setError("");setSuccess("");setBusy(true);
    try {
      await apiFetch(company?"/crm/companies/"+company.id:"/crm/companies",{
        method:company?"PATCH":"POST",body:{name,city,segment},
      });
      await queryClient.invalidateQueries({queryKey:["crm"]});
      setSuccess(company?"Empresa atualizada.":"Empresa cadastrada.");
      if(!company){setName("");setCity("");setSegment("");}
      setOpen(false);
    }catch(err){setError(err instanceof Error?err.message:"Erro ao salvar empresa");}
    finally{setBusy(false);}
  }
  return <div className="space-y-2">
    <Button size="sm" variant="outline" onClick={()=>setOpen(!open)}>{company?"Editar empresa":open?"Cancelar":"Cadastrar empresa"}</Button>
    {open?<form className="grid gap-3 rounded-lg border bg-card p-3 sm:grid-cols-3" onSubmit={e=>void save(e)}>
      <Field id={"co-name-"+(company?.id??"new")} label="Empresa"><Input id={"co-name-"+(company?.id??"new")} required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></Field>
      <Field id={"co-city-"+(company?.id??"new")} label="Cidade"><Input id={"co-city-"+(company?.id??"new")} maxLength={100} value={city} onChange={e=>setCity(e.target.value)}/></Field>
      <Field id={"co-segment-"+(company?.id??"new")} label="Segmento"><Input id={"co-segment-"+(company?.id??"new")} maxLength={100} value={segment} onChange={e=>setSegment(e.target.value)}/></Field>
      <div className="sm:col-span-3"><Button type="submit" disabled={busy}>{busy?"Salvando…":"Salvar empresa"}</Button></div>
    </form>:null}
    <Notice error={error} success={success}/>
  </div>;
}

export function OpportunityCreateForm() {
  const client=useQueryClient();
  const companies=useQuery({queryKey:["crm","companies"],queryFn:()=>apiFetch<{items:Company[]}>("/crm/companies")});
  const campaigns=useQuery({queryKey:["crm","campaigns"],queryFn:()=>apiFetch<{items:CampaignSummary[]}>("/crm/campaigns")});
  const [open,setOpen]=useState(false);
  const [title,setTitle]=useState(""),[companyId,setCompanyId]=useState("");
  const [leadPhone,setLeadPhone]=useState(""),[owner,setOwner]=useState("");
  const [amount,setAmount]=useState("0"),[campaignId,setCampaignId]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  async function save(e:FormEvent) {
    e.preventDefault();setBusy(true);setError("");setSuccess("");
    try {
      await apiFetch("/crm/opportunities",{method:"POST",body:{
        title,companyId,leadPhone,owner,estimatedValue:Number(amount),campaignId:campaignId||null,
      }});
      await client.invalidateQueries({queryKey:["crm"]});
      setSuccess("Oportunidade cadastrada.");setOpen(false);setTitle("");setLeadPhone("");
    }catch(err){setError(err instanceof Error?err.message:"Erro ao salvar oportunidade");}
    finally{setBusy(false);}
  }
  return <div className="space-y-2">
    <Button onClick={()=>setOpen(!open)} size="sm">{open?"Cancelar":"Nova oportunidade"}</Button>
    {open?<form onSubmit={e=>void save(e)} className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 xl:grid-cols-3">
      <Field id="opp-name" label="Negócio"><Input id="opp-name" required value={title} maxLength={180} onChange={e=>setTitle(e.target.value)} placeholder="Implantação de sistema"/></Field>
      <Field id="opp-company" label="Empresa">
        <select id="opp-company" className="h-9 w-full rounded-md border bg-background px-3 text-sm" required value={companyId} onChange={e=>setCompanyId(e.target.value)}>
          <option value="">Selecione a empresa</option>{companies.data?.items.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field id="opp-phone" label="Telefone do lead cadastrado">
        <Input id="opp-phone" required placeholder="+5516999999999" value={leadPhone} onChange={e=>setLeadPhone(e.target.value)}/>
      </Field>
      <Field id="opp-value" label="Valor estimado (R$)">
        <Input id="opp-value" type="number" min={0} max={1e9} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/>
      </Field>
      <Field id="opp-owner" label="Responsável"><Input id="opp-owner" value={owner} onChange={e=>setOwner(e.target.value)}/></Field>
      <Field id="opp-campaign" label="Campanha (opcional)">
        <select id="opp-campaign" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={campaignId} onChange={e=>setCampaignId(e.target.value)}>
          <option value="">Sem campanha</option>{campaigns.data?.items.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <p className="sm:col-span-2 xl:col-span-3 text-xs text-muted-foreground">O lead precisa existir na base de Leads. Cadastre a empresa antes de criar a oportunidade.</p>
      <div className="sm:col-span-2 xl:col-span-3"><Button type="submit" disabled={busy||!companyId||!leadPhone}>{busy?"Salvando…":"Criar oportunidade"}</Button></div>
    </form>:null}
    <Notice error={error} success={success}/>
  </div>;
}

export function OpportunityEditor({opportunity}:{opportunity:Opportunity}) {
  const client=useQueryClient();
  const [stage,setStage]=useState<OpportunityStage>(opportunity.stage);
  const [nextAction,setNextAction]=useState(opportunity.nextAction);
  const [value,setValue]=useState(String(opportunity.estimatedValue));
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  async function update(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setSuccess("");
    try{
      await apiFetch("/crm/opportunities/"+opportunity.id,{
        method:"PATCH",body:{stage,nextAction,estimatedValue:Number(value)},
      });
      await client.invalidateQueries({queryKey:["crm"]});
      setSuccess("Oportunidade atualizada e etapa registrada no histórico.");
    }catch(err){setError(err instanceof Error?err.message:"Falha ao salvar");}
    finally{setBusy(false);}
  }
  return <form onSubmit={e=>void update(e)} className="space-y-3 rounded-lg border bg-card p-4">
    <strong className="text-sm">Atualizar pipeline</strong>
    <Field id="opp-stage" label="Etapa">
      <select id="opp-stage" value={stage} onChange={e=>setStage(e.target.value as OpportunityStage)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
        {OPPORTUNITY_STAGES.map(s=><option key={s} value={s}>{OPPORTUNITY_STAGE_LABEL[s]}</option>)}
      </select>
    </Field>
    <Field id="opp-next" label="Próxima ação"><Input id="opp-next" value={nextAction} onChange={e=>setNextAction(e.target.value)} maxLength={500}/></Field>
    <Field id="opp-estimate" label="Estimativa (R$)"><Input id="opp-estimate" type="number" min="0" step="0.01" value={value} onChange={e=>setValue(e.target.value)}/></Field>
    <Button type="submit" disabled={busy}>{busy?"Salvando…":"Atualizar oportunidade"}</Button>
    <Notice error={error} success={success}/>
  </form>;
}

export function CampaignCreateForm(){
  const client=useQueryClient();
  const [name,setName]=useState(""),[open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setSuccess("");
    try{
      await apiFetch("/crm/campaigns",{method:"POST",body:{name,status:"draft"}});
      await client.invalidateQueries({queryKey:["crm"]});
      setOpen(false);setName("");setSuccess("Campanha criada sem realizar disparos.");
    }catch(err){setError(err instanceof Error?err.message:"Falha ao criar campanha");}
    finally{setBusy(false);}
  }
  return <div className="space-y-2">
    <Button size="sm" onClick={()=>setOpen(!open)}>{open?"Cancelar":"Criar campanha"}</Button>
    {open?<form onSubmit={e=>void submit(e)} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <Field id="campaign-name" label="Nome da campanha"><Input id="campaign-name" required maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></Field>
      <Button type="submit" disabled={busy}>Salvar rascunho</Button>
    </form>:null}
    <Notice error={error} success={success}/>
  </div>;
}

export function CampaignManager({campaign}:{campaign:CampaignSummary}){
  const client=useQueryClient();
  const [status,setStatus]=useState(campaign.status);
  const [phones,setPhones]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
  const members=useQuery({queryKey:["crm","campaign-members",campaign.id],
    queryFn:()=>apiFetch<{items:string[]}>("/crm/campaigns/"+campaign.id+"/members")});
  async function perform(work:()=>Promise<unknown>){
    setBusy(true);setError("");setSuccess("");
    try{await work();await client.invalidateQueries({queryKey:["crm"]});}
    catch(err){setError(err instanceof Error?err.message:"Erro de operação");}
    finally{setBusy(false);}
  }
  return <div className="space-y-3 rounded-xl border bg-card p-4">
    <strong className="text-sm">Gestão desta campanha</strong>
    <p className="text-xs text-muted-foreground">Status e público são registros de CRM. Nenhum envio automático é iniciado aqui. A inclusão de leads não constitui consentimento.</p>
    <div className="flex flex-wrap items-end gap-3">
      <Field id="campaign-status" label="Status">
        <select id="campaign-status" className="h-9 rounded-md border bg-background px-3 text-sm" value={status} onChange={e=>setStatus(e.target.value as CampaignSummary["status"])}>
          <option value="draft">Rascunho</option><option value="running">Em acompanhamento</option>
          <option value="paused">Pausada</option><option value="completed">Concluída</option>
        </select>
      </Field>
      <Button variant="outline" size="sm" disabled={busy} onClick={()=>void perform(async()=>{
        await apiFetch("/crm/campaigns/"+campaign.id,{method:"PATCH",body:{status}});
        setSuccess("Status atualizado sem disparos.");
      })}>Atualizar status</Button>
    </div>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void perform(async()=>{
      const list=phones.split(/[,\s]+/).filter(Boolean);
      const result=await apiFetch<{added:number;missing:string[]}>("/crm/campaigns/"+campaign.id+"/members",{method:"POST",body:{phones:list}});
      setSuccess(String(result.added)+" contatos associados; "+String(result.missing.length)+" não encontrados.");
      setPhones("");
    });}}>
      <Field id="campaign-phones" label="Telefones de leads existentes (E.164)">
        <Input id="campaign-phones" placeholder="+5516999999999" value={phones} onChange={e=>setPhones(e.target.value)} className="min-w-64"/>
      </Field>
      <Button disabled={busy||!phones.trim()} type="submit" size="sm">Adicionar ao público</Button>
    </form>
    <p className="text-xs text-muted-foreground">Público registrado: {members.data?.items.length??campaign.audience} leads. Os indicadores refletem o estado atual desses leads, não envios causados pela campanha.</p>
    {members.data?.items.length?<div className="flex flex-wrap gap-2">{members.data.items.slice(0,100).map(phone=>
      <span key={phone} className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
        {phone}<button aria-label={"Retirar "+phone} disabled={busy} className="text-destructive" onClick={()=>void perform(async()=>{
          await apiFetch("/crm/campaigns/"+campaign.id+"/members/"+encodeURIComponent(phone),{method:"DELETE"});
        })}>×</button>
      </span>)}</div>:null}
    <Notice error={error} success={success}/>
  </div>;
}

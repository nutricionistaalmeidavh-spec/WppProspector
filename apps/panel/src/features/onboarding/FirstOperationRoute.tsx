import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeFirstOperation, onboardingKey, updateFirstOperationProgress, useOnboardingState } from "./api";

type Company = {id:string;name:string};
type Opportunity = {id:string;title:string;leadPhone:string;companyId:string};

export function FirstOperationRoute() {
  const query=useOnboardingState();
  const client=useQueryClient();
  const [phone,setPhone]=useState("");
  const [name,setName]=useState("");
  const [company,setCompany]=useState("");
  const [title,setTitle]=useState("Primeiro atendimento");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [progress,setProgress]=useState("");
  const [finishedId,setFinishedId]=useState<string|null>(null);
  useEffect(()=>{if(query.data?.draft.leadPhone)setPhone(query.data.draft.leadPhone);},[query.data?.draft.leadPhone]);

  async function submit(event:FormEvent) {
    event.preventDefault();
    if(!/^\+[1-9]\d{1,14}$/.test(phone)) {setError("Informe o telefone no formato internacional, como +5516999999999.");return;}
    setBusy(true);setError("");setProgress("");
    try {
      const draft=query.data?.draft;
      const leadPhone=draft?.leadPhone??phone;
      if(!draft?.leadPhone) {
        setProgress("Salvando lead na base canônica…");
        await apiFetch("/leads",{method:"POST",body:{phone:leadPhone,displayName:name.trim(),source:"Cadastro assistido"}});
        await updateFirstOperationProgress({leadPhone});
      }
      let companyId=draft?.companyId??null;
      if(!companyId) {
        if(!company.trim())throw new Error("Informe a empresa ou organização do lead.");
        setProgress("Vinculando empresa…");
        const existing=await apiFetch<{items:Company[]}>("/crm/companies");
        const match=existing.items.find(c=>c.name.toLocaleLowerCase("pt-BR")===company.trim().toLocaleLowerCase("pt-BR"));
        companyId=match?.id??(await apiFetch<Company>("/crm/companies",{method:"POST",body:{name:company.trim(),city:"",segment:""}})).id;
        await updateFirstOperationProgress({leadPhone,companyId});
      }
      let opportunityId=draft?.opportunityId??null;
      if(!opportunityId) {
        setProgress("Criando ou recuperando oportunidade…");
        const existing=await apiFetch<{items:Opportunity[]}>("/crm/opportunities");
        const match=existing.items.find(o=>o.leadPhone===leadPhone&&o.companyId===companyId&&o.title===title.trim());
        opportunityId=match?.id??(await apiFetch<Opportunity>("/crm/opportunities",{method:"POST",body:{title:title.trim(),leadPhone,companyId}})).id;
        await updateFirstOperationProgress({leadPhone,companyId,opportunityId});
      }
      setProgress("Confirmando vínculo e gravação no CRM…");
      await completeFirstOperation(leadPhone,opportunityId);
      setFinishedId(opportunityId);
      await client.invalidateQueries({queryKey:onboardingKey});
      await client.invalidateQueries({queryKey:["crm"]});
      await client.invalidateQueries({queryKey:["leads"]});
      setProgress("");
    }catch(e){
      setError((e instanceof Error?e.message:"Operação não concluída.")+" Os dados já salvos foram preservados. Você pode tentar novamente.");
      void client.invalidateQueries({queryKey:onboardingKey});
    }finally{setBusy(false);}
  }
  const completedId=finishedId??query.data?.firstOperation?.opportunityId;
  const draft=query.data?.draft;
  return <div className="mx-auto max-w-3xl space-y-5">
    <PageHeader eyebrow="Primeira operação" title="Crie sua primeira oportunidade"
      description="Aprenda o fluxo real: lead → empresa → oportunidade. Nenhum WhatsApp será enviado." />
    {completedId?<Card><CardContent className="space-y-4 py-6">
      <div className="flex items-start gap-3"><CheckCircle2 className="h-6 w-6 text-primary"/>
        <div><p className="font-semibold">Primeira operação confirmada</p><p className="text-sm text-muted-foreground">O backend validou a oportunidade e sua associação ao lead.</p></div>
      </div>
      <div className="flex flex-wrap gap-2"><Link to={"/crm/opportunities/"+completedId} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Abrir oportunidade <ArrowRight className="h-4 w-4"/></Link>
        <Link to="/crm/pipeline" className="rounded-md border px-4 py-2 text-sm">Ver Kanban</Link></div>
    </CardContent></Card>:<Card><CardHeader><CardTitle className="text-base">Atendimento assistido</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Use informações que você tem autorização para cadastrar. Não criamos contatos ou campanhas de demonstração automaticamente.</p>
        {draft?.leadPhone?<p className="rounded-md border p-2 text-xs">Lead já salvo: {draft.leadPhone}. Retomando etapa seguinte.</p>:null}
        {draft?.companyId?<p className="rounded-md border p-2 text-xs">Empresa já vinculada. Retomando criação da oportunidade.</p>:null}
        <form onSubmit={e=>void submit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="first-name">Nome do contato</Label>
              <Input id="first-name" value={name} disabled={busy||Boolean(draft?.leadPhone)} required={!draft?.leadPhone}
                onChange={e=>setName(e.target.value)} placeholder="Nome real do contato"/></div>
            <div className="space-y-1.5"><Label htmlFor="first-phone">Telefone internacional (E.164)</Label>
              <Input id="first-phone" value={phone} disabled={busy||Boolean(draft?.leadPhone)} required
                onChange={e=>setPhone(e.target.value)} placeholder="+5516999999999"/></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="first-company">Empresa vinculada</Label>
            <Input id="first-company" value={company} disabled={busy||Boolean(draft?.companyId)}
              required={!draft?.companyId} onChange={e=>setCompany(e.target.value)} placeholder="Empresa ou organização"/></div>
          <div className="space-y-1.5"><Label htmlFor="first-title">Título da oportunidade</Label>
            <Input id="first-title" value={title} disabled={busy||Boolean(draft?.opportunityId)} required
              minLength={2} onChange={e=>setTitle(e.target.value)}/></div>
          {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
          {progress?<p role="status" className="text-sm text-muted-foreground">{progress}</p>:null}
          <Button type="submit" disabled={busy||query.isLoading}>{busy?"Concluindo e verificando…":"Cadastrar no CRM"}</Button>
        </form>
      </CardContent></Card>}
    <Link to="/overview" className="inline-flex text-sm text-muted-foreground hover:underline">Voltar à visão geral</Link>
  </div>;
}

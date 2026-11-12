import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { onboardingKey, updateTour, useOnboardingState } from "./api";

const tour = [
  {target:"/overview",title:"Visão geral",text:"Acompanhe atendimentos, leads e os indicadores comerciais em um só lugar."},
  {target:"/crm/leads",title:"Leads",text:"Aqui você consulta os cadastros canônicos, identifica contatos existentes e importa listas com autorização."},
  {target:"/conversations/inbox",title:"Conversas",text:"Quando um canal estiver conectado, acompanhe conversas e vincule contatos ao CRM."},
  {target:"/crm/pipeline",title:"Funil comercial",text:"Movimente oportunidades entre etapas e abra suas conversas a partir dos cartões."},
  {target:"/automations",title:"Motor de regras",text:"Configure regras determinísticas locais e revise as ações antes de habilitar automações."},
  {target:"/settings",title:"Configurações e ajuda",text:"Gerencie canais e motor de IA opcional e retorne a este tour quando quiser."},
];

export function TourGuide() {
  const location=useLocation();
  const navigate=useNavigate();
  const query=useOnboardingState();
  const client=useQueryClient();
  const requested=new URLSearchParams(location.search).get("tour")==="1";
  const stored=query.data?.tour;
  const [opened,setOpened]=useState(false);
  const [index,setIndex]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(requested){setOpened(true);setIndex(0);}
    else if(stored?.status==="in_progress"){setOpened(true);setIndex(stored.index);}
  },[requested,stored?.status,stored?.index]);
  useEffect(()=>{
    if(!opened)return;
    const selector='[data-tour="'+tour[index]!.target+'"]';
    const target=document.querySelector<HTMLElement>(selector);
    target?.classList.add("ring-2","ring-primary","ring-offset-1");
    return ()=>target?.classList.remove("ring-2","ring-primary","ring-offset-1");
  },[opened,index,location.pathname]);
  if(!opened || !query.data)return null;
  const step=tour[index]!;
  async function advance(next:number,status:"in_progress"|"skipped"|"completed") {
    if(busy)return;
    setBusy(true);setError("");
    try{
      await updateTour(next,status);
      await client.invalidateQueries({queryKey:onboardingKey});
      if(status!=="in_progress"){setOpened(false);navigate("/overview",{replace:true});}
      else {setIndex(next);navigate(tour[next]!.target,{replace:true});}
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar o progresso do tour.");}
    finally{setBusy(false);}
  }
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="tour-title" className="w-full max-w-lg rounded-2xl border bg-card p-5 shadow-2xl" onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();void advance(index,"skipped");}}}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Apresentação · {index+1} de {tour.length}</p>
        <Button aria-label="Pular apresentação" size="icon" variant="ghost" disabled={busy} onClick={()=>void advance(index,"skipped")}><X className="h-4 w-4"/></Button>
      </div>
      <div className="mb-4 grid grid-cols-6 gap-1.5">{tour.map((item,n)=><div key={item.target} className={"h-1.5 rounded-full "+(n<=index?"bg-primary":"bg-muted")}/>)}</div>
      <h2 id="tour-title" className="text-lg font-semibold">{step.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
      <p className="mt-3 rounded-lg border p-3 text-xs">Área desta etapa: {step.target}. A navegação funciona mesmo em telas pequenas.</p>
      {error?<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>:null}
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button variant="outline" disabled={busy||index===0} onClick={()=>void advance(index-1,"in_progress")}><ArrowLeft className="h-4 w-4"/> Voltar</Button>
        <Button disabled={busy} onClick={()=>void advance(Math.min(index+1,tour.length-1),index===tour.length-1?"completed":"in_progress")}>
          {busy?"Salvando…":index===tour.length-1?"Concluir tour":"Próximo"}<ArrowRight className="h-4 w-4"/>
        </Button>
      </div>
    </section>
  </div>;
}

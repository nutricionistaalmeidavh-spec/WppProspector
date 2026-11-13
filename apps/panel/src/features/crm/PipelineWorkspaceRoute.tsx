import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/client";
import { useSession } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/PageHeader";
import { ConversationDetailPanel } from "@/features/conversations/ConversationDetailRoute";
import { OpportunityCreateForm } from "./CrmActions";
import { getCrmRepository } from "./repository";
import { OPPORTUNITY_STAGES, OPPORTUNITY_STAGE_LABEL, type Opportunity, type OpportunityStage } from "./types";

type Stage={id:string;pipelineId:string;name:string;baseStage:OpportunityStage;position:number};
type Pipeline={id:string;name:string;isDefault:boolean;stages:Stage[]};
type Placement={id:string;pipelineId:string;pipelineStageId:string;stage:OpportunityStage};
const money=(value:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(value);

export function PipelineWorkspaceRoute(){
  const cache=useQueryClient();
  const {role}=useSession();
  const [pipelineId,setPipelineId]=useState("default");
  const [newPipeline,setNewPipeline]=useState("");
  const [newStage,setNewStage]=useState("");
  const [baseStage,setBaseStage]=useState<OpportunityStage>("qualified");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [chatPhone,setChatPhone]=useState<string|null>(null);
  const [renaming,setRenaming]=useState("");
  const [renameValue,setRenameValue]=useState("");
  const canConfigure=role==="admin"||role==="manager";
  const pipelines=useQuery({queryKey:["engagement","pipelines"],queryFn:()=>apiFetch<{items:Pipeline[]}>("/engagement/pipelines")});
  const opportunities=useQuery({queryKey:["crm","http","opportunities"],queryFn:()=>getCrmRepository("http").listOpportunities()});
  const placements=useQuery({queryKey:["engagement","pipeline-placement",pipelineId],queryFn:()=>apiFetch<{items:Placement[]}>("/engagement/pipelines/"+encodeURIComponent(pipelineId)+"/opportunities")});
  const selected=pipelines.data?.items.find(p=>p.id===pipelineId);
  const byId=useMemo(()=>new Map((opportunities.data??[]).map(o=>[o.id,o])),[opportunities.data]);
  const placed=useMemo(()=>new Map((placements.data?.items??[]).map(p=>[p.id,p])),[placements.data]);
  async function action(work:()=>Promise<void>,successMessage:string){
    setError("");setSuccess("");setBusy(true);
    try{await work();await Promise.all([
      cache.invalidateQueries({queryKey:["engagement"]}),
      cache.invalidateQueries({queryKey:["crm"]})
    ]);setSuccess(successMessage);}
    catch(e){setError(e instanceof Error?e.message:"Falha ao salvar.");}
    finally{setBusy(false);}
  }
  async function createPipeline(){
    await action(async()=>{
      const result=await apiFetch<Pipeline>("/engagement/pipelines",{method:"POST",body:{name:newPipeline}});
      setNewPipeline("");setPipelineId(result.id);
    },"Funil criado com etapas independentes.");
  }
  async function addStage(){
    await action(async()=>{
      await apiFetch("/engagement/pipelines/"+encodeURIComponent(pipelineId)+"/stages",{method:"POST",body:{name:newStage,baseStage}});
      setNewStage("");
    },"Etapa adicionada.");
  }
  async function rename(id:string){
    await action(async()=>{
      await apiFetch("/engagement/stages/"+encodeURIComponent(id),{method:"PATCH",body:{name:renameValue}});
      setRenaming("");
    },"Etapa renomeada.");
  }
  async function move(id:string,stageId:string){
    const existing=placed.get(id);
    if(!existing||existing.pipelineStageId===stageId||busy)return;
    await action(async()=>{
      await apiFetch("/engagement/opportunities/"+encodeURIComponent(id)+"/stage",
        {method:"PATCH",body:{pipelineId,stageId}});
    },"Etapa atualizada no registro comercial.");
  }
  return <div className="space-y-5">
    <PageHeader eyebrow="CRM" title="Funis de vendas" description="Cada funil tem suas próprias etapas. As transições preservam a etapa comercial canônica e seu histórico."/>
    <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4">
      <label className="space-y-1 text-xs font-medium">Funil de trabalho
        <select aria-label="Escolher funil" className="block h-9 min-w-48 rounded-md border bg-background px-2 text-sm" value={pipelineId} onChange={e=>setPipelineId(e.target.value)}>
          {(pipelines.data?.items??[{id:"default",name:"Funil principal",isDefault:true,stages:[]}]).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {canConfigure?<div className="flex min-w-48 flex-1 items-end gap-2">
        <Input aria-label="Novo funil" value={newPipeline} maxLength={100} placeholder="Nome do novo funil" onChange={e=>setNewPipeline(e.target.value)}/>
        <Button size="sm" variant="outline" disabled={busy||newPipeline.trim().length<2} onClick={()=>void createPipeline()}>Criar funil</Button>
      </div>:null}
    </div>
    {canConfigure&&selected?<div className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_180px_auto]">
      <Input aria-label="Nome da nova etapa" value={newStage} maxLength={100} placeholder="Adicionar etapa" onChange={e=>setNewStage(e.target.value)}/>
      <select aria-label="Categoria comercial da etapa" value={baseStage} onChange={e=>setBaseStage(e.target.value as OpportunityStage)}
        className="h-9 rounded-md border bg-background px-2 text-xs">
        {OPPORTUNITY_STAGES.map(s=><option value={s} key={s}>{OPPORTUNITY_STAGE_LABEL[s]}</option>)}
      </select>
      <Button disabled={busy||newStage.trim().length<2} variant="outline" size="sm" onClick={()=>void addStage()}>Adicionar etapa</Button>
    </div>:null}
    <OpportunityCreateForm pipelineId={pipelineId}/>
    {error?<p role="alert" className="rounded-lg border p-3 text-sm text-destructive">{error}</p>:null}
    {success?<p role="status" className="text-sm text-muted-foreground">{success}</p>:null}
    {pipelines.isError||opportunities.isError||placements.isError?<p role="alert" className="text-sm text-destructive">Falha ao carregar o funil. Verifique a conexão e atualize a página.</p>:null}
    {!selected&&!pipelines.isLoading?<p className="text-sm text-muted-foreground">Funil não encontrado.</p>:null}
    {selected?<div className="overflow-x-auto pb-4"><div className="flex min-w-max gap-3">
      {selected.stages.map(stage=>{
        const items=(placements.data?.items??[]).filter(p=>p.pipelineStageId===stage.id).map(p=>byId.get(p.id)).filter((p):p is Opportunity=>Boolean(p));
        return <section key={stage.id} className="w-72 shrink-0 rounded-xl border bg-muted/20 p-3"
          aria-label={"Etapa "+stage.name} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";}}
          onDrop={e=>{e.preventDefault();void move(e.dataTransfer.getData("text/plain"),stage.id);}}>
          <div className="mb-3 flex items-center justify-between gap-2">
            {renaming===stage.id?<div className="flex gap-1">
              <Input aria-label="Novo nome da etapa" value={renameValue} maxLength={100} onChange={e=>setRenameValue(e.target.value)}/>
              <Button size="sm" disabled={busy||renameValue.trim().length<2} onClick={()=>void rename(stage.id)}>OK</Button>
            </div>:<h2 className="truncate text-sm font-semibold">{stage.name}</h2>}
            {canConfigure&&renaming!==stage.id?<button type="button" className="text-xs text-muted-foreground hover:underline" onClick={()=>{setRenaming(stage.id);setRenameValue(stage.name);}}>Renomear</button>:null}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">{items.length} oportunidades · {money(items.reduce((sum,item)=>sum+item.estimatedValue,0))}</p>
          <div className="space-y-2">{items.map(item=><article key={item.id} draggable
            onDragStart={e=>{e.dataTransfer.setData("text/plain",item.id);e.dataTransfer.effectAllowed="move";}}
            className="space-y-2 rounded-lg border bg-card p-3 text-sm">
            <Link className="block font-semibold hover:underline" to={"/crm/opportunities/"+item.id}>{item.title}</Link>
            <p className="truncate text-xs text-muted-foreground">{item.companyName} · {item.leadName}</p>
            <p className="text-xs font-medium">{money(item.estimatedValue)}</p>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setChatPhone(item.leadPhone)}>Conversa</Button></div>
            <select aria-label={"Mover "+item.title} className="h-9 w-full rounded-md border bg-background px-2 text-xs"
              value={stage.id} disabled={busy} onChange={e=>void move(item.id,e.target.value)}>
              {selected.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </article>)}
          {!items.length?<p className="rounded-md border border-dashed bg-card p-4 text-center text-xs text-muted-foreground">Nenhuma oportunidade</p>:null}</div>
        </section>;
      })}
    </div></div>:null}
    {chatPhone?<div className="fixed inset-0 z-50">
      <button className="absolute inset-0 w-full bg-black/40" aria-label="Fechar conversa" onClick={()=>setChatPhone(null)}/>
      <section role="dialog" aria-modal="true" aria-label="Atendimento do contato" className="absolute inset-y-0 right-0 w-full max-w-2xl overflow-auto border-l bg-background p-4 shadow-xl">
        <Button size="sm" variant="outline" onClick={()=>setChatPhone(null)}>Fechar</Button>
        <ConversationDetailPanel leadPhone={chatPhone}/>
      </section>
    </div>:null}
  </div>;
}

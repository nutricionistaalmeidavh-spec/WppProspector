import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { useOptionalSession } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Operator={id:string;username:string;role:"manager"|"agent"};
type Assignment={phone:string;ownerId:string|null;ownerName:string|null;department:string;updatedAt:string};
type Label={id:string;name:string};
type CustomField={id:string;entity:"lead"|"opportunity";name:string;kind:"text"|"number"|"date"};
type Value={fieldId:string;name:string;kind:string;value:string};

export function ConversationOpsPanel({phone}:{phone:string}){
  const {role}=useSession();
  const cache=useQueryClient();
  const [department,setDepartment]=useState("Geral");
  const [ownerId,setOwnerId]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [newLabel,setNewLabel]=useState("");
  const [customField,setCustomField]=useState("");
  const [customValue,setCustomValue]=useState("");
  const [newField,setNewField]=useState("");
  const [newFieldKind,setNewFieldKind]=useState<"text"|"number"|"date">("text");

  const assignments=useQuery({queryKey:["engagement","assignments"],queryFn:()=>apiFetch<{items:Assignment[]}>("/engagement/assignments"),refetchInterval:12000});
  const operators=useQuery({queryKey:["crm","team"],queryFn:()=>apiFetch<{items:Operator[]}>("/crm/team")});
  const labels=useQuery({queryKey:["engagement","labels"],queryFn:()=>apiFetch<{items:Label[]}>("/engagement/labels")});
  const tagged=useQuery({queryKey:["engagement","contact-labels",phone],queryFn:()=>apiFetch<{items:Label[]}>("/engagement/contacts/"+encodeURIComponent(phone)+"/labels"),enabled:!!phone});
  const fields=useQuery({queryKey:["engagement","fields","lead"],queryFn:()=>apiFetch<{items:CustomField[]}>("/engagement/fields",{query:{entity:"lead"}})});
  const values=useQuery({queryKey:["engagement","values",phone],queryFn:()=>apiFetch<{items:Value[]}>("/engagement/values",{query:{entity:"lead",id:phone}}),enabled:!!phone});
  const history=useQuery({queryKey:["engagement","history",phone],queryFn:()=>apiFetch<{items:Array<{fromUserId:string|null;toUserId:string|null;department:string;occurredAt:string}>}>("/engagement/assignments/"+encodeURIComponent(phone)+"/history"),enabled:!!phone});
  const actor=useQuery({queryKey:["engagement","session"],queryFn:()=>apiFetch<{role:string;userId:string|null}>("/session/me")});
  const assigned=assignments.data?.items.find(a=>a.phone===phone);
  const canAssignOthers=role==="admin"||role==="manager";
  const currentLabelIds=new Set((tagged.data?.items??[]).map(x=>x.id));
  useEffect(()=>{
    setOwnerId(assigned?.ownerId??"");
    setDepartment(assigned?.department??"Geral");
  },[phone,assigned?.ownerId,assigned?.department]);
  useEffect(()=>{setError("");setNotice("");},[phone]);
  async function action(work:()=>Promise<unknown>,success:string){
    setBusy(true);setError("");setNotice("");
    try{await work();await cache.invalidateQueries({queryKey:["engagement"]});setNotice(success);}
    catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir a ação.");}
    finally{setBusy(false);}
  }
  async function saveAssignment(){
    await action(()=>apiFetch("/engagement/assignments/"+encodeURIComponent(phone),{
      method:"PUT",body:{ownerId:ownerId||null,department}
    }),"Atendimento atribuído e registrado no histórico.");
  }
  async function saveLabel(id:string,enabled:boolean){
    const ids=[...currentLabelIds].filter(x=>x!==id);
    if(enabled)ids.push(id);
    await action(()=>apiFetch("/engagement/contacts/"+encodeURIComponent(phone)+"/labels",
      {method:"PUT",body:{ids}}),"Etiquetas salvas.");
  }
  async function saveCustom(){
    if(!customField)return;
    await action(()=>apiFetch("/engagement/values",{method:"PUT",body:{entity:"lead",entityId:phone,fieldId:customField,value:customValue}}),"Informação adicional salva.");
  }

  return <section className="space-y-4 rounded-xl border bg-card p-4" aria-label="Operação do atendimento">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Responsável, setor e contexto</h2>
      {assigned?.ownerName?<span className="rounded-full bg-muted px-2 py-1 text-xs">{assigned.ownerName}</span>:<span className="text-xs text-muted-foreground">Não atribuído</span>}
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="space-y-1 text-xs">Responsável
        <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={ownerId} disabled={busy||!canAssignOthers}
          onChange={e=>setOwnerId(e.target.value)}>
          <option value="">Não atribuído</option>
          {(operators.data?.items??[]).map(op=><option key={op.id} value={op.id}>{op.username}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-xs">Setor
        <Input value={department} onChange={e=>setDepartment(e.target.value)} disabled={busy||!canAssignOthers} maxLength={80}/>
      </label>
    </div>
    <div className="flex flex-wrap gap-2">
      {canAssignOthers?<Button size="sm" variant="outline" disabled={busy} onClick={()=>void saveAssignment()}>Salvar / transferir</Button>:
        <Button size="sm" variant="outline" disabled={busy||Boolean(assigned?.ownerId&&assigned.ownerId!==actor.data?.userId)}
          onClick={()=>void action(()=>apiFetch("/engagement/assignments/"+encodeURIComponent(phone),{
            method:"PUT",body:{ownerId:assigned?.ownerId===actor.data?.userId?null:actor.data?.userId??null,department:assigned?.department??"Geral"}}),
            assigned?.ownerId===actor.data?.userId?"Atendimento liberado.":"Atendimento assumido.")}>
          {assigned?.ownerId===actor.data?.userId?"Liberar atendimento":"Assumir atendimento"}
        </Button>}
    </div>
    <div className="space-y-2">
      <h3 className="text-xs font-semibold">Etiquetas do contato</h3>
      <div className="flex flex-wrap gap-2">{(labels.data?.items??[]).map(label=>
        <label key={label.id} className="flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
          <input type="checkbox" checked={currentLabelIds.has(label.id)} disabled={busy} onChange={e=>void saveLabel(label.id,e.target.checked)}/>
          {label.name}
        </label>)}
      {!labels.data?.items.length?<span className="text-xs text-muted-foreground">Sem etiquetas cadastradas.</span>:null}</div>
      {canAssignOthers?<div className="flex gap-2">
        <Input aria-label="Nova etiqueta" placeholder="Nova etiqueta" value={newLabel} maxLength={60} onChange={e=>setNewLabel(e.target.value)}/>
        <Button variant="outline" size="sm" disabled={busy||newLabel.trim().length<2} onClick={()=>void action(async()=>{
          await apiFetch("/engagement/labels",{method:"POST",body:{name:newLabel}});setNewLabel("");
        },"Etiqueta criada.")}>Criar</Button>
      </div>:null}
    </div>
    <div className="space-y-2">
      <h3 className="text-xs font-semibold">Campos personalizados</h3>
      {(values.data?.items??[]).map(item=><p key={item.fieldId} className="text-xs">{item.name}: <strong>{item.value}</strong></p>)}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select aria-label="Campo personalizado" value={customField} onChange={e=>{setCustomField(e.target.value);setCustomValue(values.data?.items.find(x=>x.fieldId===e.target.value)?.value??"");}}
          className="h-9 rounded-md border bg-background px-2 text-xs">
          <option value="">Selecione um campo</option>{(fields.data?.items??[]).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <Input aria-label="Valor do campo" value={customValue} maxLength={2000} disabled={!customField||busy} onChange={e=>setCustomValue(e.target.value)}/>
        <Button size="sm" variant="outline" disabled={!customField||busy} onClick={()=>void saveCustom()}>Salvar</Button>
      </div>
      {canAssignOthers?<div className="grid gap-2 sm:grid-cols-[1fr_100px_auto]">
        <Input placeholder="Novo campo" aria-label="Nome do novo campo" value={newField} onChange={e=>setNewField(e.target.value)} maxLength={80}/>
        <select aria-label="Tipo do campo" className="h-9 rounded-md border bg-background px-1 text-xs" value={newFieldKind} onChange={e=>setNewFieldKind(e.target.value as typeof newFieldKind)}>
          <option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option>
        </select>
        <Button size="sm" variant="outline" disabled={newField.trim().length<2||busy}
          onClick={()=>void action(async()=>{await apiFetch("/engagement/fields",{method:"POST",body:{entity:"lead",name:newField,kind:newFieldKind}});setNewField("");},"Campo criado.")}>Adicionar</Button>
      </div>:null}
    </div>
    <details><summary className="cursor-pointer text-xs font-medium">Histórico de transferências</summary>
      <ol className="mt-2 space-y-1 text-xs text-muted-foreground">{(history.data?.items??[]).map((h,i)=>
        <li key={h.occurredAt+i}>{new Date(h.occurredAt).toLocaleString("pt-BR")} — {h.department}: {h.fromUserId?"Transferência":"Atribuição"} → {operators.data?.items.find(x=>x.id===h.toUserId)?.username??"fila"}</li>)}
      {!history.data?.items.length?<li>Sem transferências registradas.</li>:null}</ol>
    </details>
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
    {notice?<p role="status" className="text-xs text-muted-foreground">{notice}</p>:null}
  </section>;
}

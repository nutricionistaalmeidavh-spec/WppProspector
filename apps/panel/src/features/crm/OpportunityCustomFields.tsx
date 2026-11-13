import { useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { useSession } from "@/auth/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Field={id:string;name:string;kind:"text"|"number"|"date"};
type Value={fieldId:string;name:string;kind:string;value:string};
export function OpportunityCustomFields({opportunityId}:{opportunityId:string}){
  const {role}=useSession();
  const cache=useQueryClient();
  const [fieldId,setFieldId]=useState("");
  const [value,setValue]=useState("");
  const [fieldName,setFieldName]=useState("");
  const [kind,setKind]=useState<Field["kind"]>("text");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const definitions=useQuery({queryKey:["engagement","fields","opportunity"],queryFn:()=>apiFetch<{items:Field[]}>("/engagement/fields",{query:{entity:"opportunity"}})});
  const existing=useQuery({queryKey:["engagement","values","opportunity",opportunityId],queryFn:()=>apiFetch<{items:Value[]}>("/engagement/values",{query:{entity:"opportunity",id:opportunityId}})});
  async function action(work:()=>Promise<void>,message:string){
    setBusy(true);setError("");setSuccess("");
    try{await work();await cache.invalidateQueries({queryKey:["engagement"]});setSuccess(message);}
    catch(e){setError(e instanceof Error?e.message:"Falha ao salvar.");}
    finally{setBusy(false);}
  }
  const selected=definitions.data?.items.find(x=>x.id===fieldId);
  return <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Campos personalizados da oportunidade">
    <h2 className="text-sm font-semibold">Dados personalizados</h2>
    {existing.data?.items.map(item=><p key={item.fieldId} className="text-xs"><span className="text-muted-foreground">{item.name}:</span> {item.value||"—"}</p>)}
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <select className="h-9 w-full rounded-md border bg-background px-2 text-xs" value={fieldId} aria-label="Selecionar campo personalizado"
        onChange={e=>{setFieldId(e.target.value);setValue(existing.data?.items.find(x=>x.fieldId===e.target.value)?.value??"");}}>
        <option value="">Escolha um campo</option>{definitions.data?.items.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <Input aria-label="Valor do campo personalizado" type={selected?.kind==="number"?"number":selected?.kind==="date"?"date":"text"}
        disabled={!fieldId||busy} value={value} onChange={e=>setValue(e.target.value)} maxLength={2000}/>
      <Button variant="outline" size="sm" disabled={!fieldId||busy} onClick={()=>void action(async()=>{
        await apiFetch("/engagement/values",{method:"PUT",body:{entity:"opportunity",entityId:opportunityId,fieldId,value}});
      },"Valor salvo.")}>Salvar</Button>
    </div>
    {role!=="agent"?<div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
      <Input placeholder="Nome do novo campo" aria-label="Novo campo da oportunidade" value={fieldName}
        onChange={e=>setFieldName(e.target.value)} maxLength={80}/>
      <select aria-label="Tipo de novo campo" className="h-9 rounded-md border bg-background px-2 text-xs" value={kind}
        onChange={e=>setKind(e.target.value as Field["kind"])}>
        <option value="text">Texto</option><option value="number">Número</option><option value="date">Data</option>
      </select>
      <Button size="sm" variant="outline" disabled={busy||fieldName.trim().length<2} onClick={()=>void action(async()=>{
        await apiFetch("/engagement/fields",{method:"POST",body:{entity:"opportunity",name:fieldName,kind}});setFieldName("");
      },"Campo adicionado.")}>Criar campo</Button>
    </div>:null}
    {error?<p role="alert" className="text-xs text-destructive">{error}</p>:null}
    {success?<p role="status" className="text-xs text-muted-foreground">{success}</p>:null}
  </section>;
}

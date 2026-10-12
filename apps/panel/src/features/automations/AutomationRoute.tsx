import { useEffect, useState } from "react";
import { Clock3, MessageSquareText, Plus, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Match = "equals" | "contains" | "starts_with";
type Action = "reply" | "menu" | "handoff";
type MenuOption = {key:string;label:string;response:string;handoff:boolean};
type Rule = {
  id:string;name:string;match:Match;trigger:string;action:Action;response:string;
  enabled:boolean;priority:number;options:MenuOption[];createdAt:string;updatedAt:string;
};
type Draft = Omit<Rule, "id" | "createdAt" | "updatedAt">;
type Followup = {
  id:string;phone:string;message:string;dueAt:string;
  state:"pending"|"sending"|"sent"|"cancelled"|"failed";attempts:number;
};
const emptyDraft:Draft = {name:"",match:"contains",trigger:"",action:"reply",response:"",enabled:true,priority:0,options:[]};

export function parseMenuOptions(value:string):MenuOption[]{
  return value.split("\n").map(line=>line.trim()).filter(Boolean).map(line=>{
    const [key,label,response,handoff] = line.split("|").map(s=>s.trim());
    if(!key || !label || !response || !/^[a-z0-9]{1,8}$/i.test(key))throw new Error("Use: número|opção|resposta|sim (uma opção por linha)");
    return {key,label,response,handoff:(handoff ?? "").toLowerCase()==="sim"};
  });
}
function optionsText(options:MenuOption[]):string {
  return options.map(o=>[o.key,o.label,o.response,o.handoff?"sim":"não"].join("|")).join("\n");
}
const fmtDate=(date:string)=>new Date(date).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
const matchNames:Record<Match,string>={equals:"Texto exato",contains:"Contém texto",starts_with:"Começa com"};
const states:Record<Followup["state"],string>={pending:"Agendado",sending:"Enviando",sent:"Enviado",cancelled:"Cancelado",failed:"Falhou"};

export function AutomationRoute(){
  const [rules,setRules]=useState<Rule[]>([]);
  const [followups,setFollowups]=useState<Followup[]>([]);
  const [enabled,setEnabled]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [editId,setEditId]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft>(emptyDraft);
  const [optionsRaw,setOptionsRaw]=useState("");
  const [phone,setPhone]=useState("");
  const [followupMessage,setFollowupMessage]=useState("");
  const [dueLocal,setDueLocal]=useState("");

  async function refresh(){
    const [r,f]=await Promise.all([
      apiFetch<{items:Rule[]}>("/automations/rules"),
      apiFetch<{items:Followup[];enabled:boolean}>("/automations/followups"),
    ]);
    setRules(r.items);setFollowups(f.items);setEnabled(f.enabled);
  }
  useEffect(()=>{
    let active=true;
    Promise.all([
      apiFetch<{items:Rule[]}>("/automations/rules"),
      apiFetch<{items:Followup[];enabled:boolean}>("/automations/followups"),
    ]).then(([r,f])=>{
      if(active){setRules(r.items);setFollowups(f.items);setEnabled(f.enabled);}
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:"Não foi possível carregar as automações");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);

  function startEdit(rule:Rule){
    setEditId(rule.id);
    setDraft({name:rule.name,match:rule.match,trigger:rule.trigger,action:rule.action,response:rule.response,enabled:rule.enabled,priority:rule.priority,options:rule.options});
    setOptionsRaw(optionsText(rule.options));
    setError("");setMessage("");
  }
  function clearForm(){setEditId(null);setDraft(emptyDraft);setOptionsRaw("");}
  async function perform(fn:()=>Promise<void>){
    setBusy(true);setError("");setMessage("");
    try{await fn();await refresh();}
    catch(e){setError(e instanceof Error?e.message:"Erro ao salvar");}
    finally{setBusy(false);}
  }
  async function saveRule(){
    const options=draft.action==="menu"?parseMenuOptions(optionsRaw):[];
    if(draft.action==="menu" && options.length===0)throw new Error("Inclua ao menos uma opção no menu.");
    const body={...draft,options};
    await apiFetch(editId?"/automations/rules/"+editId:"/automations/rules",{method:editId?"PUT":"POST",body});
    clearForm();setMessage("Regra salva.");
  }

  return <div className="space-y-6">
    <PageHeader eyebrow="Atendimento" title="Automações" description="Gatilhos, respostas, menus e follow-ups locais. As regras são aplicadas antes da IA." />
    {error?<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>:null}
    {message?<p role="status" className="text-sm text-muted-foreground">{message}</p>:null}
    {loading?<p className="text-sm text-muted-foreground">Carregando automações…</p>:null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MessageSquareText className="h-4 w-4" />{editId?"Editar regra":"Nova regra"}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="r-name">Nome interno</Label><Input id="r-name" value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="Atendimento inicial" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="r-match">Condição</Label><select id="r-match" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.match} onChange={e=>setDraft({...draft,match:e.target.value as Match})}>{(Object.keys(matchNames) as Match[]).map(k=><option key={k} value={k}>{matchNames[k]}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="r-action">Ação</Label><select id="r-action" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.action} onChange={e=>setDraft({...draft,action:e.target.value as Action})}><option value="reply">Responder</option><option value="menu">Menu de opções</option><option value="handoff">Transferir para humano</option></select></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="r-trigger">Texto disparador</Label><Input id="r-trigger" value={draft.trigger} onChange={e=>setDraft({...draft,trigger:e.target.value})} placeholder="ex.: orçamento" /></div>
          <div className="space-y-1.5"><Label htmlFor="r-response">Resposta</Label><p className="text-xs text-muted-foreground">Variáveis disponíveis: <code>{"{telefone}"}</code> e <code>{"{mensagem}"}</code>.</p><textarea id="r-response" rows={4} maxLength={4096} className="w-full rounded-md border bg-background p-3 text-sm" value={draft.response} onChange={e=>setDraft({...draft,response:e.target.value})} placeholder="Olá! Como podemos ajudar?" /></div>
          {draft.action==="menu"?<div className="space-y-1.5"><Label htmlFor="r-options">Opções do menu</Label><textarea id="r-options" rows={4} className="w-full rounded-md border bg-background p-3 font-mono text-xs" value={optionsRaw} onChange={e=>setOptionsRaw(e.target.value)} placeholder={"1|Suporte|Vou chamar o suporte|sim\n2|Vendas|Vamos falar de preços|não"} /><p className="text-xs text-muted-foreground">Uma opção por linha: tecla | título | resposta | sim/não para transferência.</p></div>:null}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>Ativa</label>
            <label className="flex items-center gap-2 text-sm">Prioridade <Input aria-label="Prioridade" type="number" className="w-20" min={-1000} max={1000} value={draft.priority} onChange={e=>setDraft({...draft,priority:Number(e.target.value)})}/></label>
          </div>
          <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void perform(saveRule)}><Plus className="h-4 w-4"/>{editId?"Salvar alterações":"Criar regra"}</Button>{editId?<Button variant="outline" onClick={clearForm}>Cancelar edição</Button>:null}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Regras ativas e disponíveis</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rules.length===0?<p className="text-sm text-muted-foreground">Nenhuma regra cadastrada. A resposta padrão continuará funcionando.</p>:null}
          {rules.map(rule=><div key={rule.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{rule.name}</strong><span className="text-xs text-muted-foreground">{rule.enabled?"Ativa":"Inativa"} · prioridade {rule.priority}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">{matchNames[rule.match]}: “{rule.trigger}” · {rule.action==="menu"?"Menu":rule.action==="handoff"?"Transferência":"Resposta"}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{rule.response}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>startEdit(rule)}>Editar</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={()=>void perform(async()=>{await apiFetch("/automations/rules/"+rule.id,{method:"PUT",body:{...rule,enabled:!rule.enabled}});})}>{rule.enabled?"Desativar":"Ativar"}</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(!window.confirm("Excluir esta regra?"))return;void perform(async()=>{await apiFetch("/automations/rules/"+rule.id,{method:"DELETE"});});}}><Trash2 className="h-3 w-3"/>Excluir</Button></div>
          </div>)}
        </CardContent>
      </Card>
    </div>
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4"/>Follow-ups autorizados</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Somente contatos com consentimento registrado. Qualquer mensagem recebida cancela follow-ups pendentes. {enabled?"Agendamento local disponível.":"Agendamento de texto indisponível neste conector."}</p>
        {enabled?<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><Label htmlFor="f-phone">Telefone E.164</Label><Input id="f-phone" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+5516999999999"/></div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="f-message">Mensagem</Label><Input id="f-message" maxLength={4096} value={followupMessage} onChange={e=>setFollowupMessage(e.target.value)} placeholder="Olá, podemos continuar seu atendimento?"/></div>
          <div className="space-y-1"><Label htmlFor="f-time">Quando enviar</Label><Input id="f-time" type="datetime-local" value={dueLocal} onChange={e=>setDueLocal(e.target.value)}/></div>
          <Button className="sm:col-span-2 lg:col-span-4" disabled={busy} onClick={()=>void perform(async()=>{
            const dt=new Date(dueLocal);if(!Number.isFinite(dt.getTime()))throw new Error("Informe data e horário válidos.");
            await apiFetch("/automations/followups",{method:"POST",body:{phone,message:followupMessage,dueAt:dt.toISOString()}});
            setFollowupMessage("");setDueLocal("");setMessage("Follow-up agendado.");
          })}>Agendar follow-up</Button>
        </div>:null}
        <div className="flex items-center justify-between"><strong className="text-sm">Agendamentos ({followups.length})</strong><Button size="sm" variant="outline" disabled={busy} onClick={()=>void perform(refresh)}><RefreshCw className="h-3 w-3"/>Atualizar</Button></div>
        <div className="space-y-2">{followups.length===0?<p className="text-sm text-muted-foreground">Nenhum agendamento ainda.</p>:null}
          {followups.map(job=><div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div><p className="text-sm font-medium">{job.phone} · {states[job.state]}</p><p className="text-xs text-muted-foreground">{fmtDate(job.dueAt)}</p><p className="mt-1 text-sm">{job.message}</p></div>
            {job.state==="pending"?<Button variant="outline" size="sm" disabled={busy} onClick={()=>void perform(async()=>{await apiFetch("/automations/followups/"+job.id,{method:"DELETE"});})}>Cancelar</Button>:null}
          </div>)}
        </div>
      </CardContent>
    </Card>
  </div>;
}

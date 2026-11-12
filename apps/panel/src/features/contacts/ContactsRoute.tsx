import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseContactFile } from "./contact-import";

interface Contact {phone:string;displayName:string;source:"baileys"|"file";syncedAt:string;isLead:boolean}

export function ContactsRoute() {
  const [search,setSearch]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const client=useQueryClient();
  const contacts=useQuery({queryKey:["whatsapp","contacts",search],
    queryFn:()=>apiFetch<{items:Contact[]}>("/whatsapp/contacts",{query:{search}})});
  async function importFile(file:File) {
    setBusy(true);setError("");setMessage("");
    try {
      if(file.size>2*1024*1024)throw new Error("Arquivo muito grande. Limite de 2 MB.");
      const result=parseContactFile(await file.text());
      if(!result.contacts.length)throw new Error("Não foram encontrados contatos válidos em formato internacional +DDI.");
      const saved=await apiFetch<{synced:number;rejected:number}>("/whatsapp/contacts/import",{
        method:"POST",body:{source:"file",contacts:result.contacts}});
      setMessage(`${saved.synced} contatos processados; ${result.rejected+saved.rejected} inválidos ignorados. Nenhuma mensagem enviada.`);
      await client.invalidateQueries({queryKey:["whatsapp","contacts"]});
    }catch(e){setError(e instanceof Error?e.message:"Falha ao importar.");}
    finally{setBusy(false);}
  }
  async function promote(phone:string) {
    setBusy(true);setError("");setMessage("");
    try{
      await apiFetch("/whatsapp/contacts/"+encodeURIComponent(phone)+"/lead",{method:"POST"});
      setMessage("Contato cadastrado no CRM, sem envio de mensagem.");
      await Promise.all([client.invalidateQueries({queryKey:["whatsapp","contacts"]}),
        client.invalidateQueries({queryKey:["crm"]})]);
    }catch(e){setError(e instanceof Error?e.message:"Falha no cadastro.");}
    finally{setBusy(false);}
  }
  return <div className="space-y-5">
    <PageHeader eyebrow="CRM" title="Contatos WhatsApp"
      description="Agenda local separada da prospecção. A sessão QR sincroniza novos contatos quando o WhatsApp disponibiliza os eventos; a API Meta não importa a agenda do celular."/>
    <div className="surface-panel space-y-3 p-4">
      <label className="block text-xs font-medium">Importar CSV ou VCF
        <input className="mt-2 block w-full text-sm" type="file" accept=".csv,.vcf,text/csv,text/vcard,text/x-vcard"
          disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void importFile(file);e.target.value="";}}/>
      </label>
      <p className="text-xs text-muted-foreground">CSV: colunas nome e telefone. Use números com +DDI. Sincronizar contatos não cadastra leads e não autoriza disparos.</p>
    </div>
    <div className="surface-panel p-4">
      <Input aria-label="Buscar contato" placeholder="Nome ou telefone" value={search} onChange={e=>setSearch(e.target.value)}/>
    </div>
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
    {message?<p role="status" className="text-sm text-muted-foreground">{message}</p>:null}
    {contacts.isLoading?<p className="text-sm text-muted-foreground">Carregando contatos…</p>:null}
    {contacts.isError?<p className="text-sm text-destructive">Falha ao carregar agenda.</p>:null}
    {contacts.data?.items.length===0?<p className="text-sm text-muted-foreground">Nenhum contato sincronizado ou importado.</p>:null}
    <div className="surface-panel divide-y overflow-hidden">
      {(contacts.data?.items??[]).map(c=><div key={c.phone}
        className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="font-medium">{c.displayName||"Sem nome"}</p>
          <p className="text-xs text-muted-foreground">{c.phone} · {c.source==="baileys"?"Sincronizado via QR":"Importado de arquivo"}</p>
        </div>
        {c.isLead?<span className="text-xs text-muted-foreground">No CRM</span>:
          <Button variant="outline" size="sm" disabled={busy} onClick={()=>void promote(c.phone)}>Cadastrar no CRM</Button>}
      </div>)}
    </div>
    <Link to="/conversations/inbox" className="text-sm text-primary hover:underline">Ver conversas recebidas</Link>
  </div>;
}

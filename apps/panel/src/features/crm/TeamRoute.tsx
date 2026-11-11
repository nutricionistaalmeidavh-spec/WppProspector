import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, isApiError } from "@/api/client";
import { PageHeader } from "@/components/PageHeader";

type Member={id:string;username:string;role:"manager"|"agent";active:boolean;version:number};
const base="h-10 w-full rounded-md border bg-background px-3 text-sm";
export function TeamRoute(){
  const client=useQueryClient();
  const team=useQuery({queryKey:["team","members"],queryFn:()=>apiFetch<{items:Member[]}>("/team/users"),retry:false});
  const [username,setUsername]=useState(""),[password,setPassword]=useState("");
  const [role,setRole]=useState<"manager"|"agent">("agent"),[busy,setBusy]=useState(false);
  const [notice,setNotice]=useState(""),[error,setError]=useState("");
  async function save(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      await apiFetch("/team/users",{method:"POST",body:{username,password,role}});
      setUsername("");setPassword("");setNotice("Operador cadastrado.");
      await client.invalidateQueries({queryKey:["team"]});
    }catch(err){setError(err instanceof Error?err.message:"Falha ao criar operador");}
    finally{setBusy(false);}
  }
  async function change(member:Member){
    setBusy(true);setError("");setNotice("");
    try{
      await apiFetch("/team/users/"+encodeURIComponent(member.id),{method:"PATCH",body:{active:!member.active}});
      await client.invalidateQueries({queryKey:["team"]});
      setNotice(member.active?"Acesso revogado; sessões antigas não são mais válidas.":"Operador reativado.");
    }catch(err){setError(err instanceof Error?err.message:"Não foi possível alterar o acesso");}
    finally{setBusy(false);}
  }
  return <div className="space-y-5">
    <PageHeader eyebrow="Configurações" title="Equipe comercial"
      description="Usuários locais com senha protegida e permissões de gestor ou agente; sem serviços externos."/>
    {team.isError?<p role="alert" className="rounded-xl border p-4 text-sm text-destructive">
      {isApiError(team.error,403)?"Somente o administrador pode gerenciar a equipe.":
        "Não foi possível consultar a equipe."}</p>:null}
    {!team.isError?<div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <section className="space-y-4 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Novo operador</h2>
        <form onSubmit={e=>void save(e)} className="space-y-3">
          <div className="space-y-1"><label className="text-sm font-medium" htmlFor="team-user">Usuário da equipe</label>
            <input className={base} id="team-user" autoComplete="off" minLength={3} maxLength={40}
              pattern="[A-Za-z0-9._-]{3,40}" required value={username} onChange={e=>setUsername(e.target.value)}/></div>
          <div className="space-y-1"><label className="text-sm font-medium" htmlFor="team-password">Senha da equipe</label>
            <input className={base} id="team-password" type="password" autoComplete="new-password"
              minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/></div>
          <div className="space-y-1"><label className="text-sm font-medium" htmlFor="team-role">Perfil da equipe</label>
            <select className={base} id="team-role" value={role} onChange={e=>setRole(e.target.value as "manager"|"agent")}>
              <option value="agent">Agente — CRM e atendimento manual</option>
              <option value="manager">Gestor — operação comercial e campanhas</option>
            </select></div>
          <p className="text-xs text-muted-foreground">Apenas o administrador cria contas. Senhas nunca são exibidas novamente.</p>
          {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
          {notice?<p role="status" className="text-sm">{notice}</p>:null}
          <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            type="submit" disabled={busy||username.length<3||password.length<12}>Adicionar operador</button>
        </form>
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Contas cadastradas</h2>
        {(team.data?.items??[]).map(member=><div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" key={member.id}>
          <div><p className="text-sm font-semibold">{member.username}</p>
            <p className="text-xs text-muted-foreground">{member.role==="manager"?"Gestor":"Agente"} · {member.active?"Ativo":"Inativo"}</p></div>
          <button type="button" className="rounded-md border px-3 py-2 text-xs" disabled={busy}
            onClick={()=>void change(member)}>{member.active?"Desativar acesso":"Reativar"}</button>
        </div>)}
        {!team.isLoading&&!team.data?.items.length?<p className="text-sm text-muted-foreground">Nenhum operador cadastrado.</p>:null}
      </section>
    </div>:null}
  </div>;
}

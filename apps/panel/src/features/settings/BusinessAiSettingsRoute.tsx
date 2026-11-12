import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Plus, Save, Trash2 } from "lucide-react";
import { apiFetch } from "@/api/client";
import { useSession } from "@/auth/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Product = {name:string;price:string;description:string};
type Faq = {question:string;answer:string};
type Business = {
  name:string; segment:string; description:string; openingHours:string;
  paymentMethods:string; deliveryPolicy:string; returnPolicy:string;
  additionalInstructions:string; products:Product[]; faq:Faq[];
};
type Provider = "rules"|"anthropic"|"openai";
type AI = { provider:Provider; model:string; hasApiKey:boolean;
  providers:{anthropic:boolean;openai:boolean}; canStoreKeys:boolean };
const empty:Business = {name:"",segment:"",description:"",openingHours:"",paymentMethods:"",
  deliveryPolicy:"",returnPolicy:"",additionalInstructions:"",products:[],faq:[]};
const defaults:Record<Provider,string> = {rules:"",anthropic:"claude-sonnet-4-5",openai:"gpt-4.1-mini"};

export function BusinessAiSettingsRoute() {
  const {role}=useSession();
  const [profile,setProfile]=useState<Business>(empty);
  const [ai,setAi]=useState<AI|null>(null);
  const [provider,setProvider]=useState<Provider>("rules");
  const [model,setModel]=useState("");
  const [apiKey,setApiKey]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    if(role!=="admin")return;
    let active=true;
    void Promise.all([
      apiFetch<Business>("/business/profile"),
      apiFetch<AI>("/business/ai"),
    ]).then(([business,config])=>{
      if(!active)return;
      setProfile(business);setAi(config);setProvider(config.provider);setModel(config.model);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:"Não foi possível carregar as configurações.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[role]);

  async function saveBusiness(){
    setBusy(true);setMessage("");setError("");
    try{
      const saved=await apiFetch<Business>("/business/profile",{method:"PUT",body:profile});
      setProfile(saved);setMessage("Informações da loja salvas. O motor usará estes dados no próximo atendimento.");
    }catch(e){setError(e instanceof Error?e.message:"Falha ao salvar a loja.");}
    finally{setBusy(false);}
  }
  async function saveAI(clearKey=false){
    setBusy(true);setMessage("");setError("");
    try{
      const saved=await apiFetch<AI>("/business/ai",{
        method:"PUT",body:{provider,model,apiKey:clearKey?"":apiKey,clearKey},
      });
      setAi(saved);setProvider(saved.provider);setModel(saved.model);setApiKey("");
      setMessage(clearKey?"Chave excluída. Motor gratuito reativado.":
        "Motor configurado. Alterações entram em vigor no próximo atendimento.");
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível salvar o provedor.");}
    finally{setBusy(false);}
  }
  const formField=(key: keyof Pick<Business,"name"|"segment"|"description"|"openingHours"|"paymentMethods"|"deliveryPolicy"|"returnPolicy"|"additionalInstructions">,title:string,placeholder:string,multiline=false)=>(
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={"business-"+key}>{title}</Label>
      {multiline?
        <textarea id={"business-"+key} className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={profile[key]} placeholder={placeholder} onChange={e=>setProfile(current=>({...current,[key]:e.target.value}))}/>:
        <Input id={"business-"+key} value={profile[key]} placeholder={placeholder}
          onChange={e=>setProfile(current=>({...current,[key]:e.target.value}))}/>}
    </div>
  );
  if(role&&role!=="admin")return <Navigate to="/settings" replace/>;
  return <div className="space-y-5">
    <PageHeader eyebrow="Configurações" title="Motor de Regras / Inteligência Artificial"
      description="Cadastre os dados da sua loja e escolha se deseja usar o motor local gratuito ou uma API opcional." />
    {loading?<p className="text-sm text-muted-foreground">Carregando configurações…</p>:null}
    {error?<p role="alert" className="rounded-md border border-destructive/40 px-4 py-3 text-sm text-destructive">{error}</p>:null}
    {message?<p role="status" className="rounded-md border px-4 py-3 text-sm">{message}</p>:null}
    <Card>
      <CardHeader><CardTitle className="text-base">Informações da loja</CardTitle>
        <p className="text-sm text-muted-foreground">Esses dados são a fonte oficial das respostas automáticas, sem informações de outras empresas.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {formField("name","Nome da loja","Ex.: Minha loja")}
          {formField("segment","Segmento","Ex.: comércio de roupas")}
        </div>
        {formField("description","O que a empresa oferece","Produtos, serviços e diferenciais",true)}
        <div className="grid gap-4 md:grid-cols-2">
          {formField("openingHours","Horário de atendimento","Ex.: segunda a sábado, 9h às 18h")}
          {formField("paymentMethods","Formas de pagamento","Ex.: Pix, débito e crédito")}
        </div>
        {formField("deliveryPolicy","Entregas e frete","Prazo, área atendida e condições",true)}
        {formField("returnPolicy","Trocas, devoluções e garantias","Política oficial da loja",true)}
        {formField("additionalInstructions","Orientações de atendimento","Tom de voz e informações que o atendente pode usar",true)}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Produtos e serviços</h3>
            <Button type="button" size="sm" variant="outline" disabled={profile.products.length>=100}
              onClick={()=>setProfile(x=>({...x,products:[...x.products,{name:"",price:"",description:""}]}))}>
              <Plus className="mr-1 h-4 w-4"/>Adicionar
            </Button>
          </div>
          {profile.products.length===0?<p className="text-sm text-muted-foreground">Nenhum produto cadastrado. Não serão inventados preços.</p>:null}
          {profile.products.map((p,index)=><div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_140px_1fr_auto]">
            <Input aria-label={"Produto "+(index+1)} placeholder="Nome" value={p.name}
              onChange={e=>setProfile(x=>({...x,products:x.products.map((v,i)=>i===index?{...v,name:e.target.value}:v)}))}/>
            <Input aria-label={"Preço "+(index+1)} placeholder="Preço" value={p.price}
              onChange={e=>setProfile(x=>({...x,products:x.products.map((v,i)=>i===index?{...v,price:e.target.value}:v)}))}/>
            <Input aria-label={"Descrição "+(index+1)} placeholder="Descrição" value={p.description}
              onChange={e=>setProfile(x=>({...x,products:x.products.map((v,i)=>i===index?{...v,description:e.target.value}:v)}))}/>
            <Button type="button" variant="ghost" size="sm" aria-label={"Excluir produto "+(index+1)}
              onClick={()=>setProfile(x=>({...x,products:x.products.filter((_,i)=>i!==index)}))}>
              <Trash2 className="h-4 w-4"/>
            </Button>
          </div>)}
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Perguntas frequentes</h3>
            <Button type="button" size="sm" variant="outline" disabled={profile.faq.length>=50}
              onClick={()=>setProfile(x=>({...x,faq:[...x.faq,{question:"",answer:""}]}))}>
              <Plus className="mr-1 h-4 w-4"/>Adicionar
            </Button>
          </div>
          {profile.faq.map((faq,index)=><div key={index} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_1fr_auto]">
            <Input aria-label={"Pergunta "+(index+1)} placeholder="Pergunta" value={faq.question}
              onChange={e=>setProfile(x=>({...x,faq:x.faq.map((v,i)=>i===index?{...v,question:e.target.value}:v)}))}/>
            <Input aria-label={"Resposta "+(index+1)} placeholder="Resposta oficial" value={faq.answer}
              onChange={e=>setProfile(x=>({...x,faq:x.faq.map((v,i)=>i===index?{...v,answer:e.target.value}:v)}))}/>
            <Button type="button" size="sm" variant="ghost" aria-label={"Excluir pergunta "+(index+1)}
              onClick={()=>setProfile(x=>({...x,faq:x.faq.filter((_,i)=>i!==index)}))}>
              <Trash2 className="h-4 w-4"/>
            </Button>
          </div>)}
        </div>
        <Button type="button" disabled={busy||loading} onClick={()=>void saveBusiness()}>
          <Save className="mr-2 h-4 w-4"/>Salvar informações da loja
        </Button>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-base">Motor de atendimento</CardTitle>
        <p className="text-sm text-muted-foreground">Padrão: gratuito, local e open source. APIs comerciais só são ativadas com sua escolha e chave própria.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider">Provedor</Label>
            <select id="ai-provider" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={provider} onChange={e=>{
                const next=e.target.value as Provider;setProvider(next);setModel(defaults[next]);setApiKey("");
              }}>
              <option value="rules">Motor de regras local — R$ 0</option>
              <option value="anthropic">Anthropic — chave própria (opcional)</option>
              <option value="openai">OpenAI — chave própria (opcional)</option>
            </select>
          </div>
          {provider!=="rules"?<div className="space-y-1.5">
            <Label htmlFor="ai-model">Modelo</Label>
            <Input id="ai-model" value={model} placeholder={defaults[provider]} onChange={e=>setModel(e.target.value)}/>
          </div>:null}
        </div>
        {provider!=="rules"?<>
          <div className="space-y-1.5">
            <Label htmlFor="ai-api-key">Chave API ({provider==="anthropic"?"Anthropic":"OpenAI"})</Label>
            <Input id="ai-api-key" type="password" value={apiKey} autoComplete="off"
              placeholder={ai?.providers[provider]?"Chave salva — deixe em branco para manter":"Cole sua chave de API"}
              onChange={e=>setApiKey(e.target.value)}/>
            <p className="text-xs text-muted-foreground">A chave é enviada apenas ao servidor local e armazenada cifrada. Nunca aparece novamente nesta tela.</p>
          </div>
          {!ai?.canStoreKeys?<p role="alert" className="text-sm text-destructive">Armazenamento de credenciais indisponível neste servidor.</p>:null}
        </>:null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy||loading||(provider!=="rules"&&!ai?.canStoreKeys)}
            onClick={()=>void saveAI()}><Save className="mr-2 h-4 w-4"/>Salvar motor</Button>
          {provider!=="rules"&&ai?.providers[provider]?<Button type="button" variant="outline" disabled={busy}
            onClick={()=>{if(window.confirm("Excluir a chave desta API e voltar ao motor gratuito?"))void saveAI(true);}}>
            <Trash2 className="mr-2 h-4 w-4"/>Excluir chave
          </Button>:null}
        </div>
        <p className="text-xs text-muted-foreground">
          As automações determinísticas cadastradas em Atendimento → Automações continuam prioritárias.
          API externa pode gerar custos do próprio provedor. O CRM funciona sem nenhuma chave.
        </p>
      </CardContent>
    </Card>
  </div>;
}

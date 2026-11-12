import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { ArrowRight, BookOpen, BrainCircuit, CheckCircle2, CircleAlert, FlaskConical, History, Package, Plus, Save, Send, ShieldCheck, Store, Trash2, Workflow } from "lucide-react";
import { apiFetch } from "@/api/client";
import { useSession } from "@/auth/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutomationRoute } from "@/features/automations/AutomationRoute";

type Product = {name:string;price:string;description:string};
type Faq = {question:string;answer:string};
type Business = {name:string;segment:string;description:string;openingHours:string;paymentMethods:string;deliveryPolicy:string;returnPolicy:string;additionalInstructions:string;products:Product[];faq:Faq[];semanticSearch:{enabled:boolean;endpoint:string;model:string}};
type Engine = "rules"|"anthropic"|"openai"|"compatible";
type EngineDraft = {provider:Engine;model:string;endpoint:string;published:boolean;hasApiKey:boolean};
type Ai = {provider:Engine;model:string;providers:{anthropic:boolean;openai:boolean};canStoreKeys:boolean;endpoint?:string};
type Revision = {revision:number;kind:"profile"|"engine"|"rules";name:string;publishedAt:string};
type Studio = {
  draft:{profile:Business;published:boolean;updatedAt:string|null};
  rulesDraft:{items:unknown[];published:boolean;updatedAt:string|null};
  validation:{profileReady:boolean;engineReady:boolean;rulesReady:boolean};
  pendingAi:EngineDraft;activeAi:Ai;history:Revision[];commerce:CommerceStatus;
  integration:{configured:boolean;createdAt:string|null;lastSyncAt:string|null};
};
type CommerceStatus = {enabled:boolean;count:number;orders:number;lastSync:string|null;shopify:{configured:boolean;domain:string;updatedAt:string|null}};
type CatalogProduct = {id:string;source:string;name:string;sku:string;price:string;stock:number|null;syncedAt:string};
type CommerceData = {items:CatalogProduct[];orders:Array<{id:string;number:string;financialStatus:string;fulfillmentStatus:string;total:string;createdAt:string}>;status:CommerceStatus};
type Sample = {reply:string;provider:string;configuredProvider?:Engine;rule?:string;handoff?:boolean;charged:boolean;sent:boolean;usage?:{input:number;output:number}};
type Diagnostic = {ok:boolean;provider:string;model:string;diagnostic:string;checkedAt:string;durationMs?:number;charged:boolean};
type Stage = "overview"|"company"|"knowledge"|"rules"|"engine"|"lab"|"commerce"|"history";
const stages: Array<{id:Stage;label:string}> = [
  {id:"overview",label:"Visão geral"},{id:"company",label:"Minha empresa"},{id:"knowledge",label:"Conhecimento"},
  {id:"rules",label:"Regras"},{id:"engine",label:"Inteligência"},{id:"lab",label:"Laboratório"},
  {id:"commerce",label:"E-commerce"},{id:"history",label:"Versões"},
];
const empty:Business = {name:"",segment:"",description:"",openingHours:"",paymentMethods:"",deliveryPolicy:"",returnPolicy:"",additionalInstructions:"",products:[],faq:[],semanticSearch:{enabled:false,endpoint:"",model:""}};
const initial:EngineDraft = {provider:"rules",model:"",endpoint:"",published:true,hasApiKey:false};
const suggested:Record<Engine,string> = {rules:"",anthropic:"claude-sonnet-4-5",openai:"gpt-4.1-mini",compatible:""};
function readError(error:unknown):string { return error instanceof Error?error.message:"A operação não pôde ser concluída."; }
function normalize(value:unknown):string { return String(value??"").trim(); }
function spreadsheetRows(workbook:XLSX.WorkBook):Array<Record<string,unknown>> {
  const sheet=workbook.Sheets[workbook.SheetNames[0]??""];
  if(!sheet)throw new Error("Planilha sem primeira aba.");
  return XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:""});
}
function column(row:Record<string,unknown>, aliases:string[]):string {
  for(const [key,value] of Object.entries(row)){
    const normalized=key.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
    if(aliases.includes(normalized))return normalize(value);
  }
  return "";
}
export function BusinessAiSettingsRoute(){
  const {role}=useSession();
  const [params]=useSearchParams();
  const [stage,setStage]=useState<Stage>(()=>stages.find(x=>x.id===params.get("step"))?.id??"overview");
  useEffect(()=>{const requested=stages.find(x=>x.id===params.get("step"));if(requested)setStage(requested.id);},[params]);
  const [studio,setStudio]=useState<Studio|null>(null);
  const [commerce,setCommerce]=useState<CommerceData|null>(null);
  const [profile,setProfile]=useState<Business>(empty);
  const [engine,setEngine]=useState<EngineDraft>(initial);
  const [apiKey,setApiKey]=useState("");
  const [shopDomain,setShopDomain]=useState("");
  const [shopToken,setShopToken]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [engineDirty,setEngineDirty]=useState(false);
  const [tested,setTested]=useState(false);
  const [diagnosticConsent,setDiagnosticConsent]=useState(false);
  const [diagnostic,setDiagnostic]=useState<Diagnostic|null>(null);
  const [integrationToken,setIntegrationToken]=useState("");
  const [preview,setPreview]=useState<Sample|null>(null);
  const [question,setQuestion]=useState("Qual é o horário de atendimento?");
  const [externalConsent,setExternalConsent]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [rollback,setRollback]=useState<string|null>(null);
  const [importPreview,setImportPreview]=useState<{kind:"catalog"|"faq";items:Array<Record<string,unknown>>}|null>(null);

  async function refresh(){
    const [state,catalog]=await Promise.all([
      apiFetch<Studio>("/business/studio"),
      apiFetch<CommerceData>("/business/studio/catalog"),
    ]);
    setStudio(state);setProfile(state.draft.profile);setEngine(state.pendingAi);setCommerce(catalog);
    setShopDomain(state.commerce.shopify.domain);
    setDirty(false);setEngineDirty(false);
  }
  useEffect(()=>{
    if(role!=="admin")return;
    let cancelled=false;
    Promise.all([apiFetch<Studio>("/business/studio"),apiFetch<CommerceData>("/business/studio/catalog")])
      .then(([state,catalog])=>{
        if(cancelled)return;
        setStudio(state);setProfile(state.draft.profile);setEngine(state.pendingAi);setCommerce(catalog);setShopDomain(state.commerce.shopify.domain);
      }).catch(e=>{if(!cancelled)setError(readError(e));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[role]);

  async function action(doWork:()=>Promise<unknown>, success:string){
    setBusy(true);setError("");setMessage("");
    try {await doWork();await refresh();setMessage(success);}
    catch(e){setError(readError(e));}
    finally{setBusy(false);}
  }
  function change<K extends keyof Business>(key:K,value:Business[K]){
    setProfile(current=>({...current,[key]:value}));setDirty(true);setTested(false);setPreview(null);
  }
  const field=(key:keyof Pick<Business,"name"|"segment"|"description"|"openingHours"|"paymentMethods"|"deliveryPolicy"|"returnPolicy"|"additionalInstructions">,label:string,placeholder:string,large=false)=>(
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={"studio-"+key}>{label}</Label>
      {large?<textarea id={"studio-"+key} className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={profile[key]} placeholder={placeholder} onChange={e=>change(key,e.target.value)}/>:
        <Input id={"studio-"+key} value={profile[key]} placeholder={placeholder} onChange={e=>change(key,e.target.value)}/>}
    </div>
  );
  async function parseSheet(file:File,kind:"catalog"|"faq"){
    setError("");
    try{
      if(file.size>8*1024*1024)throw new Error("Limite de 8 MB por planilha.");
      const bytes=await file.arrayBuffer();
      const workbook=XLSX.read(new Uint8Array(bytes),{type:"array"});
      const rows=spreadsheetRows(workbook).slice(0,2500);
      if(!rows.length)throw new Error("Planilha vazia.");
      if(kind==="catalog"){
        const items=rows.map((row,i)=>{
          const name=column(row,["nome","produto","name","titulo"]);
          const stockValue=column(row,["estoque","quantidade","stock"]);
          const stock=stockValue?Number(stockValue.replace(",", ".")):null;
          if(!name)throw new Error("Produto sem nome na linha "+(i+2));
          if(stock!==null && (!Number.isInteger(stock)||stock<0))throw new Error("Estoque inválido na linha "+(i+2));
          return {id:column(row,["sku","codigo","id"])||"linha-"+(i+2),name,
            sku:column(row,["sku","codigo"]),price:column(row,["preco","price","valor"]),stock};
        });
        setImportPreview({kind,items});
      }else{
        const items=rows.map((row,i)=>{
          const question=column(row,["pergunta","question"]);
          const answer=column(row,["resposta","answer"]);
          if(!question||!answer)throw new Error("Pergunta ou resposta ausente na linha "+(i+2));
          return {question,answer};
        });
        if(profile.faq.length+items.length>50)throw new Error("A base atual aceita no máximo 50 perguntas frequentes.");
        setImportPreview({kind,items});
      }
    }catch(e){setError(readError(e));setImportPreview(null);}
  }
  async function applyImport(){
    if(!importPreview)return;
    if(importPreview.kind==="catalog"){
      const items=importPreview.items;
      await action(async()=>apiFetch("/business/studio/catalog/import",{method:"POST",body:{items}}),
        "Catálogo importado. Ative a fonte antes de permitir que o atendente utilize esses dados.");
    }else{
      const newFaq=importPreview.items.map(row=>({question:String(row.question),answer:String(row.answer)}));
      change("faq",[...profile.faq,...newFaq]);setMessage("FAQ incluída no rascunho. Salve e publique para entrar em vigor.");
    }
    setImportPreview(null);
  }
  if(role&&role!=="admin")return <Navigate to="/settings" replace/>;

  const progress = [
    {label:"Perfil da empresa",ready:Boolean(profile.name.trim())},
    {label:"Conhecimento",ready:profile.products.length>0||profile.faq.length>0||Boolean(commerce?.status.count)},
    {label:"Regras",ready:Boolean(studio?.validation.rulesReady)},
    {label:"Motor",ready:Boolean(studio?.validation.engineReady)},
    {label:"Validação",ready:tested||Boolean(studio?.validation.profileReady)},
  ];
  return <div className="space-y-5">
    <PageHeader eyebrow="Configurações" title="Central do atendente virtual"
      description="Prepare o conhecimento, as regras e a inteligência da loja antes de ativar o atendimento."/>
    {error?<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>:null}
    {message?<div role="status" className="rounded-lg border bg-card px-4 py-3 text-sm">{message}</div>:null}
    {loading?<div role="status" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Carregando configurações…</div>:null}
    {!loading&&studio?<div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface-panel p-4"><p className="text-xs text-muted-foreground">Atendimento ativo</p><p className="mt-1 font-semibold">{studio.activeAi.provider==="rules"?"Regras locais":studio.activeAi.provider==="compatible"?"Modelo próprio":studio.activeAi.provider}</p><p className="text-xs text-muted-foreground">A configuração publicada continua válida</p></div>
        <div className="surface-panel p-4"><p className="text-xs text-muted-foreground">Preparação</p><p className="mt-1 font-semibold">{studio.draft.published&&!dirty?"Sem alterações pendentes":"Rascunho em edição"}</p><p className="text-xs text-muted-foreground">Publicação sempre explícita</p></div>
        <div className="surface-panel p-4"><p className="text-xs text-muted-foreground">Fonte e-commerce</p><p className="mt-1 font-semibold">{commerce?.status.enabled?"Ativa":"Desligada"}</p><p className="text-xs text-muted-foreground">{commerce?.status.count??0} itens importados</p></div>
      </div>
      <nav aria-label="Etapas da configuração" className="flex gap-2 overflow-x-auto rounded-xl border bg-card p-2">
        {stages.map(item=><Button key={item.id} size="sm" variant={stage===item.id?"default":"ghost"} className="shrink-0" onClick={()=>setStage(item.id)}>{item.label}</Button>)}
      </nav>

      {stage==="overview"?<div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <Card><CardHeader><CardTitle className="text-base">Prepare o atendimento em etapas</CardTitle></CardHeader>
          <CardContent className="space-y-3">{progress.map((step,index)=><div key={step.label} className="flex items-center gap-3 rounded-lg border p-3">
            {step.ready?<CheckCircle2 className="h-5 w-5 text-primary"/>:<span className="flex h-5 w-5 items-center justify-center rounded-full border text-xs">{index+1}</span>}
            <span className="flex-1 text-sm font-medium">{step.label}</span><span className="text-xs text-muted-foreground">{step.ready?"Preparado":"Pendente"}</span>
          </div>)}
          <Button onClick={()=>setStage("company")}>Continuar configuração <ArrowRight className="h-4 w-4"/></Button>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">Como funciona</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>O motor de regras é local, gratuito e funciona sem qualquer chave externa.</p>
            <p>Os dados da empresa e as regras cadastradas orientam as respostas. Informações ausentes devem ser encaminhadas à equipe.</p>
            <p>Salve um rascunho, teste no laboratório e publique quando estiver correto.</p>
            <Button variant="outline" onClick={()=>setStage("lab")}>Abrir laboratório <FlaskConical className="h-4 w-4"/></Button>
          </CardContent>
        </Card>
      </div>:null}

      {stage==="company"||stage==="knowledge"?<div className="space-y-4">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base">{stage==="company"?<Store className="h-4 w-4"/>:<BookOpen className="h-4 w-4"/>}{stage==="company"?"Identidade e políticas da empresa":"Base de conhecimento"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {stage==="company"?<>
              <div className="grid gap-4 md:grid-cols-2">{field("name","Nome da loja","Nome comercial")}{field("segment","Segmento","Ex.: moda e acessórios")}</div>
              {field("description","O que a empresa oferece","Descreva produtos e serviços",true)}
              <div className="grid gap-4 md:grid-cols-2">{field("openingHours","Horário","Seg a sáb, 9h–18h")}{field("paymentMethods","Pagamentos","Pix, cartão")}</div>
              {field("deliveryPolicy","Entregas","Abrangência, prazos e condições",true)}
              {field("returnPolicy","Trocas e devoluções","Política vigente",true)}
              {field("additionalInstructions","Orientações adicionais","Informações complementares verificadas",true)}
            </>:<>
              <div className="flex items-center justify-between"><strong className="text-sm">Produtos e serviços ({profile.products.length}/100)</strong>
                <Button size="sm" variant="outline" disabled={profile.products.length>=100} onClick={()=>change("products",[...profile.products,{name:"",price:"",description:""}])}><Plus className="h-4 w-4"/>Produto</Button></div>
              {profile.products.map((p,i)=><div key={i} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_120px_1fr_auto]">
                <Input aria-label={"Nome do produto "+(i+1)} placeholder="Nome" value={p.name} onChange={e=>change("products",profile.products.map((v,j)=>i===j?{...v,name:e.target.value}:v))}/>
                <Input aria-label={"Preço do produto "+(i+1)} placeholder="Preço" value={p.price} onChange={e=>change("products",profile.products.map((v,j)=>i===j?{...v,price:e.target.value}:v))}/>
                <Input aria-label={"Descrição do produto "+(i+1)} placeholder="Descrição" value={p.description} onChange={e=>change("products",profile.products.map((v,j)=>i===j?{...v,description:e.target.value}:v))}/>
                <Button variant="ghost" size="icon" aria-label={"Excluir produto "+(i+1)} onClick={()=>change("products",profile.products.filter((_,j)=>j!==i))}><Trash2 className="h-4 w-4"/></Button>
              </div>)}
              <div className="flex items-center justify-between"><strong className="text-sm">Perguntas frequentes ({profile.faq.length}/50)</strong>
                <Button size="sm" variant="outline" disabled={profile.faq.length>=50} onClick={()=>change("faq",[...profile.faq,{question:"",answer:""}])}><Plus className="h-4 w-4"/>Pergunta</Button></div>
              {profile.faq.map((f,i)=><div key={i} className="grid gap-2 rounded-lg border p-3 md:grid-cols-[1fr_1fr_auto]">
                <Input aria-label={"Pergunta "+(i+1)} placeholder="Pergunta" value={f.question} onChange={e=>change("faq",profile.faq.map((v,j)=>i===j?{...v,question:e.target.value}:v))}/>
                <Input aria-label={"Resposta "+(i+1)} placeholder="Resposta oficial" value={f.answer} onChange={e=>change("faq",profile.faq.map((v,j)=>i===j?{...v,answer:e.target.value}:v))}/>
                <Button variant="ghost" size="icon" aria-label={"Excluir pergunta "+(i+1)} onClick={()=>change("faq",profile.faq.filter((_,j)=>j!==i))}><Trash2 className="h-4 w-4"/></Button>
              </div>)}
              <div className="space-y-3 rounded-xl border p-4">
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={profile.semanticSearch?.enabled??false}
                    onChange={e=>change("semanticSearch",{...(profile.semanticSearch??{endpoint:"",model:""}),enabled:e.target.checked})}/>
                  <span><strong className="block">Busca semântica local (opcional)</strong>
                    <span className="text-xs text-muted-foreground">Desativada por padrão. Só consulta seu servidor de embeddings quando você ativar e publicar esta configuração. Sem API paga obrigatória.</span></span>
                </label>
                {profile.semanticSearch?.enabled?<div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor="semantic-endpoint">Endpoint de embeddings</Label>
                    <Input id="semantic-endpoint" type="url" value={profile.semanticSearch.endpoint}
                      placeholder="http://127.0.0.1:8080/v1/embeddings"
                      onChange={e=>change("semanticSearch",{...profile.semanticSearch,endpoint:e.target.value})}/>
                  </div>
                  <div className="space-y-1"><Label htmlFor="semantic-model">Modelo self-hosted</Label>
                    <Input id="semantic-model" value={profile.semanticSearch.model} placeholder="nome-do-modelo-de-embeddings"
                      onChange={e=>change("semanticSearch",{...profile.semanticSearch,model:e.target.value})}/>
                  </div>
                  <p className="text-xs text-muted-foreground sm:col-span-2">Necessita servidor de embeddings compatível com /v1/embeddings. Se indisponível, o atendimento continua usando regras e FTS5. Não baixa modelos automaticamente.</p>
                </div>:null}
              </div>
              <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                <label className="space-y-1 text-sm"><span className="font-medium">Importar FAQ (CSV/XLSX)</span><Input type="file" accept=".csv,.xlsx,.xls" onChange={e=>{const file=e.target.files?.[0];if(file)void parseSheet(file,"faq");e.target.value="";}}/><span className="block text-xs text-muted-foreground">Colunas: pergunta, resposta</span></label>
                <label className="space-y-1 text-sm"><span className="font-medium">Importar catálogo maior</span><Input type="file" accept=".csv,.xlsx,.xls" onChange={e=>{const file=e.target.files?.[0];if(file)void parseSheet(file,"catalog");e.target.value="";}}/><span className="block text-xs text-muted-foreground">Colunas: nome, sku, preço, estoque</span></label>
              </div>
            </>}
            {importPreview?<div className="rounded-lg border bg-muted/40 p-3 text-sm"><p className="font-semibold">Prévia da importação: {importPreview.items.length} linhas</p>
              <p className="mt-1 text-xs text-muted-foreground">Amostra: {importPreview.items.slice(0,3).map(item=>String(item.name??item.question)).join(", ")}</p>
              <div className="mt-3 flex gap-2"><Button disabled={busy} size="sm" onClick={()=>void applyImport()}>Confirmar importação</Button><Button size="sm" variant="outline" onClick={()=>setImportPreview(null)}>Cancelar</Button></div>
            </div>:null}
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button disabled={busy||!dirty} onClick={()=>void action(()=>apiFetch("/business/studio/draft",{method:"PUT",body:profile}),"Rascunho salvo. Os clientes ainda recebem a configuração publicada.")}><Save className="h-4 w-4"/>Salvar rascunho</Button>
              <Button variant="outline" disabled={busy||dirty||studio.draft.published||!studio.validation.profileReady} onClick={()=>void action(()=>apiFetch("/business/studio/publish",{method:"POST"}),"Configuração publicada para os próximos atendimentos.")}><Send className="h-4 w-4"/>Publicar informações</Button>
              <span className="text-xs text-muted-foreground">{dirty?"Salve antes de publicar":studio.draft.published?"Sem rascunho pendente":tested?"Simulação concluída":"Teste o rascunho no laboratório antes de publicar"}</span>
              {!studio.draft.published&&!tested?<Button size="sm" variant="ghost" onClick={()=>setStage("lab")}>Testar agora <ArrowRight className="h-3 w-3"/></Button>:null}
            </div>
          </CardContent>
        </Card>
      </div>:null}

      {stage==="rules"?<div className="space-y-4">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Workflow className="h-5 w-5"/>Regras e automações em um só lugar</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Edite as regras abaixo, salve no rascunho, teste um disparador no Laboratório e publique. Nenhuma regra nova entra em produção ao clicar em salvar.</p>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs">Ordem de execução: regra ativa → motor de atendimento → encaminhamento humano. Follow-ups mantêm a exigência de consentimento.</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={()=>void action(async()=>{},"Versão das regras atualizada.")}>Atualizar situação</Button>
              <Button variant="outline" onClick={()=>setStage("lab")}>Testar regras <FlaskConical className="h-4 w-4"/></Button>
              <Button disabled={busy||studio.rulesDraft.published||!studio.validation.rulesReady} onClick={()=>void action(()=>apiFetch("/business/studio/rules-publish",{method:"POST"}),"Regras publicadas com sucesso.")}><ShieldCheck className="h-4 w-4"/>Publicar regras testadas</Button>
            </div>
            <p className="text-xs text-muted-foreground">Estado: {studio.rulesDraft.published?"regras publicadas":studio.validation.rulesReady?"rascunho validado":"rascunho pendente de teste"}.</p>
          </CardContent>
        </Card>
        <AutomationRoute embedded/>
      </div>:null}

      {stage==="engine"?<Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BrainCircuit className="h-5 w-5"/>Inteligência do atendimento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">O motor gratuito é o padrão. APIs pagas são opcionais e exigem chave própria. Nenhum custo externo é ativado automaticamente.</p>
          <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Selecione um modo</legend>
            {([
              ["rules","Regras locais — R$ 0","Determinístico, sem chamadas externas."],
              ["openai","OpenAI — API opcional","Modelo comercial e cobrança do provedor."],
              ["anthropic","Anthropic — API opcional","Modelo comercial e cobrança do provedor."],
              ["compatible","Servidor próprio compatível — R$ 0 de API","Endpoint Chat Completions local ou HTTPS autohospedado."],
            ] as Array<[Engine,string,string]>).map(([id,label,help])=><label key={id} className={"flex cursor-pointer items-start gap-3 rounded-lg border p-3 "+(engine.provider===id?"border-primary bg-accent/40":"")}>
              <input type="radio" className="mt-1" name="engine" checked={engine.provider===id} onChange={()=>{setEngine({...engine,provider:id,model:suggested[id],endpoint:id==="compatible"?engine.endpoint:""});setEngineDirty(true);setTested(false);setExternalConsent(false);setDiagnostic(null);setDiagnosticConsent(false);}}/>
              <span><strong className="block text-sm">{label}</strong><span className="text-xs text-muted-foreground">{help}</span></span>
            </label>)}
          </fieldset>
          {engine.provider!=="rules"?<div className="space-y-3">
            <div className="space-y-1"><Label htmlFor="engine-model">Identificador do modelo</Label><Input id="engine-model" value={engine.model} placeholder="Informe o modelo" onChange={e=>{setEngine({...engine,model:e.target.value});setEngineDirty(true);setTested(false);}}/></div>
            {engine.provider==="compatible"?<div className="space-y-1"><Label htmlFor="engine-endpoint">Endpoint do seu servidor</Label><Input id="engine-endpoint" type="url" value={engine.endpoint} placeholder="http://127.0.0.1:8000/v1/chat/completions" onChange={e=>{setEngine({...engine,endpoint:e.target.value});setEngineDirty(true);setTested(false);}}/><p className="text-xs text-muted-foreground">Sem modelo embutido; você disponibiliza a inferência no servidor próprio.</p></div>:
              <div className="space-y-1"><Label htmlFor="engine-api-key">Chave privada de API</Label><Input id="engine-api-key" type="password" autoComplete="off" value={apiKey} placeholder={engine.hasApiKey?"Chave já armazenada — mantenha em branco para conservar":"Insira uma chave nova"} onChange={e=>{setApiKey(e.target.value);setEngineDirty(true);setTested(false);}}/><p className="text-xs text-muted-foreground">Armazenada cifrada no servidor, nunca exibida novamente. Testes externos podem consumir créditos.</p></div>}
          </div>:null}
          <div className="space-y-3 rounded-lg border bg-muted/25 p-4">
            <p className="text-sm font-semibold">Diagnóstico de conexão e modelo</p>
            <p className="text-xs text-muted-foreground">Verifica conectividade, autenticação e disponibilidade do modelo. A consulta de diagnóstico não envia dados de clientes.</p>
            {engine.provider!=="rules"?<label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={diagnosticConsent} onChange={e=>setDiagnosticConsent(e.target.checked)}/><span>Autorizo uma chamada técnica ao provedor selecionado {engine.provider==="compatible"?"no meu servidor":"com possível cobrança de API"}.</span></label>:null}
            <Button variant="outline" size="sm" disabled={busy||engineDirty||(engine.provider!=="rules"&&!diagnosticConsent)} onClick={()=>void action(async()=>{
              const result=await apiFetch<Diagnostic>("/business/studio/ai-diagnostics",{method:"POST",body:{allowExternal:diagnosticConsent}});
              setDiagnostic(result);
            },"Diagnóstico de conexão realizado.")}>Testar conexão e modelo</Button>
            {diagnostic?<p role="status" className="text-xs">{diagnostic.ok?"Conectado: "+diagnostic.model+" — "+diagnostic.diagnostic:"Não foi possível validar o provedor."}</p>:null}
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4"><Button disabled={busy||!engineDirty} onClick={()=>void action(async()=>{await apiFetch("/business/studio/ai-draft",{method:"PUT",body:{provider:engine.provider,model:engine.model,endpoint:engine.endpoint,apiKey}});setApiKey("");setTested(false);},"Motor salvo como rascunho; atendimento real não foi alterado.")}><Save className="h-4 w-4"/>Salvar motor em rascunho</Button>
            <Button variant="outline" disabled={busy||engineDirty||studio.pendingAi.published||!studio.validation.engineReady} onClick={()=>void action(()=>apiFetch("/business/studio/ai-publish",{method:"POST"}),"Motor publicado e ativado nos próximos atendimentos.")}><ShieldCheck className="h-4 w-4"/>Ativar motor testado</Button>
            <Button variant="ghost" onClick={()=>setStage("lab")}>Testar <FlaskConical className="h-4 w-4"/></Button>
          </div>
          <p className="text-xs text-muted-foreground">Ativo: {studio.activeAi.provider}. Pendente: {studio.pendingAi.published?"nenhum":studio.pendingAi.provider}.</p>
        </CardContent>
      </Card>:null}

      {stage==="lab"?<div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FlaskConical className="h-5 w-5"/>Laboratório de testes</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Não envia WhatsApp, não modifica leads e não agenda follow-ups. Testa as regras e o rascunho de conhecimento.</p>
            <div className="space-y-1"><Label htmlFor="lab-question">Mensagem fictícia de um cliente</Label><textarea id="lab-question" className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={question} onChange={e=>{setQuestion(e.target.value);setTested(false);}}/></div>
            {engine.provider!=="rules"?<label className="flex gap-2 text-sm"><input type="checkbox" checked={externalConsent} onChange={e=>setExternalConsent(e.target.checked)}/><span>Autorizar este teste com {engine.provider==="compatible"?"meu servidor":"API externa (pode gerar cobrança)"} e enviar os dados da simulação ao provedor selecionado.</span></label>:null}
            <Button disabled={busy||dirty||engineDirty||!question.trim()} onClick={()=>void action(async()=>{
              const result=await apiFetch<Sample>("/business/studio/simulate",{method:"POST",body:{message:question,allowExternal:externalConsent}});
              setPreview(result);setTested(true);
            },"Simulação concluída sem enviar mensagem ao WhatsApp.")}><FlaskConical className="h-4 w-4"/>Executar simulação</Button>
            {(dirty||engineDirty)?<p className="text-xs text-muted-foreground">Salve as edições em rascunho para testar exatamente a configuração que será publicada.</p>:null}
            {preview?<div className="space-y-2 rounded-xl border bg-muted/35 p-4"><p className="text-xs font-semibold">Resposta simulada</p><p className="whitespace-pre-wrap text-sm">{preview.reply||"Sem resposta automática."}</p><div className="border-t pt-2 text-xs text-muted-foreground">Motor: {preview.provider} · Encaminhamento: {preview.handoff?"sim":"não"} · WhatsApp: não enviado{preview.charged?" · API externa autorizada":""}</div></div>:null}
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">Diagnóstico</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
          <p>Ao testar, confirme preços, horários, políticas e o encaminhamento de perguntas sem resposta.</p>
          <p>O simulador executa regras sem criar sessões de menu. Testes pagos só ocorrem mediante autorização marcada.</p>
          {preview?<div className="rounded-lg border p-3"><p className="font-semibold">{preview.provider==="rules"?"Motor local":preview.provider}</p><p className="mt-1 text-xs text-muted-foreground">Resposta gerada, sem disparo. {preview.rule?"Regra: "+preview.rule:""} </p></div>:null}
          <Button size="sm" variant="outline" onClick={()=>setStage(studio.draft.published?"engine":"company")}>Voltar para publicar <ArrowRight className="h-4 w-4"/></Button>
        </CardContent></Card>
      </div>:null}

      {stage==="commerce"?<div className="space-y-4">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Package className="h-5 w-5"/>Catálogo e pedidos</CardTitle></CardHeader>
          <CardContent className="space-y-4"><p className="text-sm text-muted-foreground">O catálogo importado ou sincronizado fica no SQLite da instalação. Pedidos são visíveis somente ao administrador e não entram nas respostas do bot.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Itens cadastrados</p><p className="text-xl font-semibold">{commerce?.status.count??0}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Pedidos consultados</p><p className="text-xl font-semibold">{commerce?.status.orders??0}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Usar catálogo no atendimento</p><p className="font-semibold">{commerce?.status.enabled?"Ativo":"Desligado"}</p></div>
            </div>
            <div className="flex flex-wrap gap-2"><Button disabled={busy||!commerce?.status.count} onClick={()=>void action(()=>apiFetch("/business/studio/catalog/enabled",{method:"PUT",body:{enabled:!commerce?.status.enabled}}),commerce?.status.enabled?"Fonte desligada.":"Catálogo publicado para as respostas do atendente.")}>{commerce?.status.enabled?"Desativar fonte no bot":"Ativar catálogo no bot"}</Button>
              <Button variant="outline" onClick={()=>setStage("knowledge")}>Importar planilha <ArrowRight className="h-4 w-4"/></Button></div>
            <p className="text-xs text-muted-foreground">Última atualização: {commerce?.status.lastSync?new Date(commerce.status.lastSync).toLocaleString("pt-BR"):"não realizada"}. Estoque pode ficar desatualizado; respostas não devem prometer disponibilidade.</p>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="text-base">Integração genérica de estoque e pedidos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Conecte PDVs, ERPs e sistemas próprios enviando um snapshot de produtos e atualizações de pedidos para esta instalação. Não exige nenhuma plataforma comercial.</p>
            <div className="rounded-lg border p-3 text-xs"><p className="font-semibold">Endpoint HTTP de sincronização</p>
              <code className="mt-1 block break-all">POST /admin/integrations/commerce/v1/sync</code>
              <p className="mt-2 text-muted-foreground">Authorization: Bearer SEU_TOKEN (gerado abaixo)</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={busy} size="sm" onClick={()=>void action(async()=>{
                const result=await apiFetch<{token:string}>("/business/studio/integration-token",{method:"POST"});
                setIntegrationToken(result.token);
              },"Token gerado. Copie-o agora; não será exibido novamente.")}>{studio.integration.configured?"Rotacionar token":"Criar token local de integração"}</Button>
              <Button variant="outline" size="sm" disabled={busy||!studio.integration.configured} onClick={()=>void action(async()=>{
                await apiFetch("/business/studio/integration-token",{method:"DELETE"});
                setIntegrationToken("");
              },"Acesso de integração revogado.")}>Revogar acesso</Button>
              <span className="text-xs text-muted-foreground">{studio.integration.configured?"Integração disponível":"Nenhum token ativo"}</span>
            </div>
            {integrationToken?<div className="space-y-1 rounded-lg border p-3">
              <Label htmlFor="integration-token">Token — exibido somente agora</Label>
              <Input id="integration-token" readOnly value={integrationToken} aria-label="Token de integração gerado"/>
              <p className="text-xs text-muted-foreground">Guarde-o em um gerenciador de segredos. A rotação invalida o token anterior.</p>
            </div>:null}
            <details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Exemplo do formato JSON enviado pelo ERP/PDV</summary>
              <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify({products:[{id:"SKU001",name:"Produto",sku:"SKU001",price:"50.00",stock:10}],orders:[{id:"pedido001",number:"#001",financialStatus:"paid",fulfillmentStatus:"pending",total:"50 BRL",createdAt:"2026-11-12T12:00:00Z"}]},null,2)}</pre>
            </details>
            <p className="text-xs text-muted-foreground">Último recebimento: {studio.integration.lastSyncAt?new Date(studio.integration.lastSyncAt).toLocaleString("pt-BR"):"nenhum"}. O atendimento só acessa o catálogo com a fonte ativada; pedidos não entram no prompt.</p>
          </CardContent>
        </Card>
        <details className="rounded-xl border bg-card p-3"><summary className="cursor-pointer text-sm font-medium">Conectores específicos opcionais (Shopify)</summary>
        <Card><CardHeader><CardTitle className="text-base">Shopify (somente leitura)</CardTitle></CardHeader>
          <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Opcional. Use o domínio myshopify.com e um token Admin API com permissões read_products, read_inventory e read_orders. A sincronização é manual e consulta até 50 produtos e 50 pedidos por execução.</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label htmlFor="shop-domain">Domínio da loja</Label><Input id="shop-domain" value={shopDomain} placeholder="sua-loja.myshopify.com" onChange={e=>setShopDomain(e.target.value)}/></div>
              <div className="space-y-1"><Label htmlFor="shop-token">Token privado Shopify</Label><Input id="shop-token" type="password" autoComplete="off" placeholder={commerce?.status.shopify.configured?"Token salvo — informe outro apenas para substituir":"Token de acesso do Admin"} value={shopToken} onChange={e=>setShopToken(e.target.value)}/></div>
            </div>
            <div className="flex flex-wrap gap-2"><Button disabled={busy||!shopToken.trim()} onClick={()=>void action(async()=>{await apiFetch("/business/studio/shopify",{method:"PUT",body:{domain:shopDomain,token:shopToken}});setShopToken("");},"Conexão armazenada com credencial cifrada. Nenhuma sincronização iniciada.")}>Salvar conexão</Button>
              <Button variant="outline" disabled={busy||!commerce?.status.shopify.configured} onClick={()=>void action(()=>apiFetch("/business/studio/shopify/sync",{method:"POST"}),"Produtos e pedidos sincronizados da Shopify. Confira a amostra antes de ativar o catálogo.")}>Sincronizar agora</Button>
              <Button variant="ghost" disabled={busy||!commerce?.status.shopify.configured} onClick={()=>void action(()=>apiFetch("/business/studio/shopify",{method:"DELETE"}),"Token Shopify removido. Dados importados foram preservados.")}>Desconectar</Button>
            </div>
          </CardContent>
        </Card>
        </details>
        <Card><CardHeader><CardTitle className="text-base">Amostra dos dados sincronizados</CardTitle></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2"><p className="text-sm font-semibold">Produtos</p>{commerce?.items.length?commerce.items.slice(0,10).map(item=><div key={item.id} className="flex justify-between gap-2 border-b py-2 text-xs"><span className="min-w-0 truncate">{item.name} {item.sku?"· "+item.sku:""}</span><span className="whitespace-nowrap text-muted-foreground">{item.stock??"?"} un.</span></div>):<p className="text-xs text-muted-foreground">Nenhum produto importado.</p>}</div>
          <div className="space-y-2"><p className="text-sm font-semibold">Pedidos (sem dados pessoais)</p>{commerce?.orders.length?commerce.orders.slice(0,10).map(item=><div key={item.id} className="flex justify-between gap-2 border-b py-2 text-xs"><span>{item.number}</span><span className="text-muted-foreground">{item.fulfillmentStatus}</span></div>):<p className="text-xs text-muted-foreground">Nenhum pedido sincronizado.</p>}</div>
        </CardContent></Card>
      </div>:null}

      {stage==="history"?<Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><History className="h-5 w-5"/>Histórico e reversão</CardTitle></CardHeader>
        <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">Restaure a versão anterior do perfil, das regras ou da seleção do motor. Segredos e inventário não são copiados para versões anteriores. Uma API comercial restaurada precisa ter sua chave ainda cadastrada.</p>
          {studio.history.length===0?<p className="rounded-lg border p-4 text-sm text-muted-foreground">Ainda não há publicações nesta central.</p>:null}
          {studio.history.map(revision=><div key={revision.kind+":"+revision.revision} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div><p className="text-sm font-semibold">{revision.kind==="profile"?"Perfil":revision.kind==="engine"?"Inteligência":"Regras"} · Versão {revision.revision} · {revision.name}</p><p className="text-xs text-muted-foreground">{new Date(revision.publishedAt).toLocaleString("pt-BR")}</p></div>
            {rollback===revision.kind+":"+revision.revision?<div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>setRollback(null)}>Cancelar</Button><Button size="sm" disabled={busy} onClick={()=>void action(async()=>{
                await apiFetch("/business/studio/rollback",{method:"POST",body:{revision:revision.revision,kind:revision.kind}});
                setRollback(null);setTested(false);
              },"Versão restaurada e registrada no histórico.")}>Confirmar restauração</Button></div>:
              <Button size="sm" variant="outline" disabled={busy} onClick={()=>setRollback(revision.kind+":"+revision.revision)}>Restaurar</Button>}
          </div>)}
        </CardContent>
      </Card>:null}
      <p className="text-xs text-muted-foreground"><CircleAlert className="mr-1 inline h-3.5 w-3.5"/>O sistema funciona com o motor local e não precisa de serviços pagos. Configurações publicadas aplicam-se apenas a esta instalação.</p>
    </div>:null}
  </div>;
}

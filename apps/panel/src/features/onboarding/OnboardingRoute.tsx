import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, MessageSquare, ShieldCheck, Sparkles } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "@/api/client";
import { useSession } from "@/auth/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { onboardingKey, updateSetup, useOnboardingState, type BusinessProfile, type SetupStep } from "./api";

const steps: Array<{id:SetupStep;label:string}> = [
  {id:"business",label:"Empresa"}, {id:"crm",label:"Funil"},
  {id:"whatsapp",label:"WhatsApp"}, {id:"rules",label:"Automação e IA"},
  {id:"review",label:"Revisão"},
];
const blank:BusinessProfile = {
  name:"",segment:"",description:"",openingHours:"",paymentMethods:"",
  deliveryPolicy:"",returnPolicy:"",additionalInstructions:"",products:[],faq:[],
};
const templates = [
  {label:"Selecionar segmento",value:""},
  {label:"Comércio",value:"Comércio"},
  {label:"Prestação de serviços",value:"Serviços"},
  {label:"Construção e engenharia",value:"Construção e engenharia"},
  {label:"Saúde e bem-estar",value:"Saúde e bem-estar"},
];
const stages = ["Novo", "Contatado", "Respondeu", "Qualificado", "Reunião", "Proposta", "Negociação", "Ganho", "Perdido"];

export function OnboardingRoute() {
  const {role}=useSession();
  const navigate=useNavigate();
  const queryClient=useQueryClient();
  const stateQuery=useOnboardingState();
  const profileQuery=useQuery({
    queryKey:["business","onboarding-profile"],
    queryFn:()=>apiFetch<BusinessProfile>("/business/profile"),
    enabled:role==="admin",retry:false,
  });
  const [stepIndex,setStepIndex]=useState(0);
  const [initialized,setInitialized]=useState(false);
  const [profile,setProfile]=useState<BusinessProfile>(blank);
  const [channel,setChannel]=useState<"later"|"qr"|"meta">("later");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");

  useEffect(()=>{
    if(!initialized && stateQuery.data) {
      const pending=steps.findIndex(item=>stateQuery.data.setup[item.id]==="pending");
      setStepIndex(pending<0?4:pending);setInitialized(true);
    }
  },[initialized,stateQuery.data]);
  useEffect(()=>{if(profileQuery.data)setProfile(profileQuery.data);},[profileQuery.data]);

  if(role && role!=="admin") return <Navigate to="/overview" replace />;
  if(stateQuery.isLoading || profileQuery.isLoading) return <p role="status" className="p-6 text-sm text-muted-foreground">Carregando configuração inicial…</p>;
  if(stateQuery.isError || profileQuery.isError) return <div role="alert" className="space-y-3 rounded-xl border p-5">
    <p>Não foi possível carregar o assistente. Nenhuma configuração foi alterada.</p>
    <Button variant="outline" onClick={()=>{void stateQuery.refetch();void profileQuery.refetch();}}>Tentar novamente</Button>
  </div>;

  const current=steps[stepIndex]!;
  async function saveStep(step:SetupStep,status:"completed"|"skipped") {
    setBusy(true);setError("");setNotice("");
    try {
      if(step==="business" && status==="completed") {
        if(!profile.name.trim()||!profile.segment.trim()) throw new Error("Informe o nome e o segmento da empresa.");
        await apiFetch("/business/profile",{method:"PUT",body:profile});
      }
      await updateSetup(step,status);
      await queryClient.invalidateQueries({queryKey:onboardingKey});
      if(step==="review" && status==="completed") {
        navigate("/overview?tour=1",{replace:true});
      } else if(step==="review") {
        navigate("/overview",{replace:true});
      } else setStepIndex(index=>Math.min(4,index+1));
    } catch(e) {
      setError(e instanceof Error?e.message:"Falha ao salvar. Seus campos foram preservados.");
    } finally {setBusy(false);}
  }
  async function verifyWhatsApp() {
    setBusy(true);setError("");
    try {
      const response=await apiFetch<{connection:{status:string};local:Array<{status:string}>;meta:Array<{active:boolean}>}>("/whatsapp/connections");
      if(response.connection.status!=="connected" && !response.local.some(c=>c.status==="connected") && !response.meta.some(c=>c.active))
        throw new Error("A conexão ainda não está ativa. Conclua o QR Code ou a autorização da Meta, ou continue sem conectar.");
      await updateSetup("whatsapp","completed");
      await queryClient.invalidateQueries({queryKey:onboardingKey});
      setStepIndex(3);
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível verificar a conexão.");}
    finally{setBusy(false);}
  }
  const input=(key:keyof Pick<BusinessProfile,"name"|"segment"|"description"|"openingHours"|"paymentMethods"|"deliveryPolicy"|"returnPolicy">,label:string,placeholder:string)=>
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={"onboarding-"+key}>{label}</Label>
      <Input id={"onboarding-"+key} value={profile[key]} placeholder={placeholder}
        onChange={event=>setProfile(p=>({...p,[key]:event.target.value}))} maxLength={key==="description"?3000:1000}/>
    </div>;
  return <div className="mx-auto max-w-4xl space-y-5">
    <PageHeader eyebrow="Primeiro acesso" title="Prepare seu WPP CRM"
      description="Cinco etapas para começar. As preferências são salvas e você pode continuar mais tarde." />
    <div className="grid grid-cols-5 gap-1.5" aria-label={"Etapa "+(stepIndex+1)+" de 5"}>
      {steps.map((item,index)=><div key={item.id} className="space-y-2">
        <div className={"h-1.5 rounded-full "+(index<=stepIndex?"bg-primary":"bg-muted")}/>
        <p className="text-center text-[10px] text-muted-foreground sm:text-xs">{item.label}</p>
      </div>)}
    </div>
    {error?<p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</p>:null}
    {notice?<p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>:null}
    <Card className="shadow-sm"><CardHeader><CardTitle className="text-lg">
      {stepIndex===0?"Configure sua empresa":stepIndex===1?"Seu funil comercial":stepIndex===2?"Conecte seu WhatsApp":stepIndex===3?"Automação e inteligência artificial":"Revise sua configuração"}
    </CardTitle></CardHeader><CardContent className="space-y-5">
      {stepIndex===0?<div className="space-y-4">
        <p className="text-sm text-muted-foreground">Esses dados alimentam o perfil comercial canônico e o motor de regras local. Não vamos inventar preços ou políticas.</p>
        <div className="grid gap-4 sm:grid-cols-2">{input("name","Nome da empresa","Minha empresa")}{input("segment","Segmento","Comércio, serviços, etc.")}</div>
        <div className="space-y-1.5"><Label htmlFor="onboarding-template">Sugestão por segmento (opcional)</Label>
          <select id="onboarding-template" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={templates.some(t=>t.value===profile.segment)?profile.segment:""} onChange={e=>{if(e.target.value)setProfile(p=>({...p,segment:e.target.value}));}}>
            {templates.map(item=><option key={item.label} value={item.value}>{item.label}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">Sugere apenas a categoria, sem preencher informações comerciais fictícias.</p>
        </div>
        {input("description","Produtos e serviços","O que sua empresa oferece?")}
        <div className="grid gap-4 sm:grid-cols-2">{input("openingHours","Horário de atendimento (opcional)","Seg–sex, 8h às 18h")}{input("paymentMethods","Formas de pagamento (opcional)","Pix, cartão…")}</div>
        {input("deliveryPolicy","Entregas e atendimento (opcional)","Onde e como você atende?")}
        {input("returnPolicy","Trocas e garantias (opcional)","Política real da empresa")}
        <Link to="/settings/business-ai" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Cadastrar catálogo e FAQs depois <ChevronRight className="h-4 w-4"/></Link>
      </div>:null}
      {stepIndex===1?<div className="space-y-3">
        <p className="text-sm text-muted-foreground">Seu CRM já possui um pipeline com etapas operacionais. Confirme o fluxo padrão para começar; nada será criado em nome de clientes.</p>
        <div className="flex flex-wrap gap-2">{stages.map((stage,index)=><span key={stage} className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">{index+1}. {stage}</span>)}</div>
        <div className="flex items-start gap-2 rounded-lg border p-3 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary"/>
          <span>Leads, empresas e oportunidades usam os cadastros reais e uma fonte canônica. O funil não requer WhatsApp nem IA paga.</span></div>
        <p className="text-xs text-muted-foreground">A personalização das etapas não está incluída nesta configuração inicial; você está confirmando as etapas existentes.</p>
      </div>:null}
      {stepIndex===2?<div className="space-y-4">
        <p className="text-sm text-muted-foreground">A conexão é opcional. Você pode cadastrar leads e oportunidades manualmente sem um canal ativo.</p>
        <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Método de conexão</legend>
          {[
            {id:"later",label:"Configurar depois",detail:"Sem envio de mensagens."},
            {id:"qr",label:"QR Code local",detail:"Disponível quando a conexão local estiver habilitada."},
            {id:"meta",label:"API oficial da Meta",detail:"Autorização oficial; tarifas da Meta podem ser cobradas."},
          ].map(option=><label key={option.id} className={"flex cursor-pointer gap-3 rounded-lg border p-3 "+(channel===option.id?"border-primary":"")}>
            <input type="radio" name="channel" checked={channel===option.id} onChange={()=>setChannel(option.id as typeof channel)}/>
            <span className="text-sm"><strong>{option.label}</strong><span className="mt-1 block text-xs text-muted-foreground">{option.detail}</span></span>
          </label>)}
        </fieldset>
        {channel!=="later"?<div className="flex flex-wrap items-center gap-2">
          <Link to="/settings/whatsapp" className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">Abrir configurações do WhatsApp</Link>
          <Button variant="outline" disabled={busy} onClick={()=>void verifyWhatsApp()}>Já conectei — verificar</Button>
        </div>:null}
      </div>:null}
      {stepIndex===3?<div className="space-y-3">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4"><ShieldCheck className="h-5 w-5 shrink-0 text-primary"/>
          <div><p className="font-medium">Motor de regras local — R$ 0</p><p className="mt-1 text-sm text-muted-foreground">Self-hosted e open source. Respostas usam apenas os dados da sua empresa; nenhuma API paga é necessária.</p></div>
        </div>
        <div className="flex items-start gap-3 rounded-lg border p-4"><Sparkles className="h-5 w-5 shrink-0 text-muted-foreground"/>
          <div><p className="font-medium">IA externa — opcional</p><p className="mt-1 text-sm text-muted-foreground">Anthropic, OpenAI ou servidor próprio são configurados separadamente, sem ativação ou cobrança automática.</p>
            <Link to="/settings/business-ai" className="mt-2 inline-flex text-sm text-primary hover:underline">Configurar motor de regras / IA</Link></div>
        </div>
        <p className="text-xs text-muted-foreground">Continuar apenas confirma que você conhece as opções. Não altera o provedor atualmente ativo.</p>
      </div>:null}
      {stepIndex===4?<div className="space-y-4">
        <p className="text-sm text-muted-foreground">Ao concluir, você poderá explorar as telas em um tour opcional e realizar a primeira operação comercial assistida.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border p-3 text-sm"><strong>Empresa</strong><p>{profile.name||"Não informada"} · {profile.segment||"Segmento pendente"}</p></div>
          <div className="rounded-lg border p-3 text-sm"><strong>Funil</strong><p>Etapas padrão do CRM</p></div>
          <div className="rounded-lg border p-3 text-sm"><strong>WhatsApp</strong><p>{stateQuery.data?.setup.whatsapp==="completed"?"Conexão verificada":stateQuery.data?.setup.whatsapp==="skipped"?"Configuração adiada":"Opcional"}</p></div>
          <div className="rounded-lg border p-3 text-sm"><strong>IA</strong><p>Core gratuito disponível, APIs opcionais</p></div>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><CircleHelp className="h-4 w-4"/> Você pode rever todas essas configurações depois.</p>
      </div>:null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button variant="outline" disabled={busy||stepIndex===0} onClick={()=>{setError("");setStepIndex(i=>i-1);}}><ChevronLeft className="h-4 w-4"/> Voltar</Button>
        <div className="flex flex-wrap gap-2">
          {stepIndex===2?<Button variant="ghost" disabled={busy} onClick={()=>void saveStep("whatsapp","skipped")}>Continuar sem conectar</Button>:null}
          {stepIndex===3?<Button variant="ghost" disabled={busy} onClick={()=>void saveStep("rules","skipped")}>Configurar mais tarde</Button>:null}
          <Button disabled={busy||(stepIndex===2&&channel==="later"&&false)} onClick={()=>{
            if(stepIndex===2&&channel!=="later") {void verifyWhatsApp();return;}
            void saveStep(current.id,stepIndex===2?"skipped":"completed");
          }}>
            {busy?"Salvando…":stepIndex===0?"Salvar e continuar":stepIndex===4?"Concluir e conhecer o CRM":stepIndex===2?"Continuar":"Confirmar e continuar"}
            <ChevronRight className="h-4 w-4"/>
          </Button>
        </div>
      </div>
    </CardContent></Card>
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5"/> Nenhuma mensagem será enviada durante a configuração.</span>
      <Button variant="ghost" size="sm" disabled={busy} onClick={()=>void saveStep("review","skipped")}>Agora não</Button>
    </div>
  </div>;
}

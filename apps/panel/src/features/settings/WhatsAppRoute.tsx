import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cloud, Link2, QrCode, RefreshCcw, ShieldCheck, Trash2, Wifi, WifiOff } from "lucide-react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "@/api/client";
import { useSession } from "@/auth/session";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface LocalChannel { id:string; status:string; qrAvailable:boolean; active:boolean }
interface MetaChannel {id:string;phoneNumberId:string;wabaId:string;displayName:string;active:boolean}
interface Connections {
  connection:{provider:string;status:string;qrAvailable:boolean};
  local:LocalChannel[];
  meta:MetaChannel[];
  signupEnabled:boolean;
}
interface SignupConfig {enabled:boolean;appId?:string;configId?:string;state?:string}
interface FacebookSdk {
  init(options:{appId:string;cookie:boolean;xfbml:boolean;version:string}):void;
  login(callback:(res:{authResponse?:{code?:string}})=>void,options:Record<string,unknown>):void;
}
declare global { interface Window { FB?:FacebookSdk;fbAsyncInit?:()=>void } }

let sdkLoading:Promise<FacebookSdk>|undefined;
function loadSdk(appId:string):Promise<FacebookSdk> {
  if(window.FB){window.FB.init({appId,cookie:true,xfbml:false,version:"v26.0"});return Promise.resolve(window.FB);}
  if(sdkLoading)return sdkLoading;
  sdkLoading=new Promise<FacebookSdk>((resolve,reject)=>{
    const timeout=window.setTimeout(()=>reject(new Error("A biblioteca da Meta não carregou.")),15000);
    window.fbAsyncInit=()=>{
      window.clearTimeout(timeout);
      if(!window.FB){reject(new Error("SDK da Meta indisponível."));return;}
      window.FB.init({appId,cookie:true,xfbml:false,version:"v26.0"});
      resolve(window.FB);
    };
    const script=document.createElement("script");
    script.src="https://connect.facebook.net/pt_BR/sdk.js";
    script.async=true;
    script.crossOrigin="anonymous";
    script.onerror=()=>{window.clearTimeout(timeout);reject(new Error("Falha ao carregar o login da Meta."));};
    document.head.appendChild(script);
  }).catch(err=>{sdkLoading=undefined;throw err;});
  return sdkLoading!;
}

async function signupWithMeta(config:SignupConfig,pin:string):Promise<void>{
  if(!/^\\d{6}$/.test(pin))throw new Error("Informe um PIN de seis dígitos para registrar o número na Meta.");
  if(!config.enabled||!config.appId||!config.configId||!config.state)throw new Error("Configure o aplicativo e o Embedded Signup da Meta no servidor.");
  const sdk=await loadSdk(config.appId);
  let cleanup=()=>{};
  const details=await new Promise<{code:string;wabaId:string;phoneNumberId:string}>((resolve,reject)=>{
    let code="";
    let wabaId="";
    let phoneNumberId="";
    let settled=false;
    const done=(value?:{code:string;wabaId:string;phoneNumberId:string},error?:Error)=>{
      if(settled)return;
      settled=true;
      cleanup();
      if(error)reject(error);else resolve(value!);
    };
    const maybeFinish=()=>{if(code&&wabaId&&phoneNumberId)done({code,wabaId,phoneNumberId});};
    const onMessage=(evt:MessageEvent)=>{
      if(!["https://www.facebook.com","https://web.facebook.com"].includes(evt.origin))return;
      let data:unknown=evt.data;
      if(typeof data==="string"){try{data=JSON.parse(data);}catch{return;}}
      if(!data||typeof data!=="object")return;
      const payload=data as {type?:string;event?:string;data?:{waba_id?:unknown;phone_number_id?:unknown}};
      if(payload.type!=="WA_EMBEDDED_SIGNUP")return;
      if(payload.event==="CANCEL") {done(undefined,new Error("Conexão cancelada na Meta."));return;}
      if(payload.event==="FINISH_ONLY_WABA"){done(undefined,new Error("Finalize também a vinculação de um número na Meta."));return;}
      if(payload.event!=="FINISH")return;
      if(typeof payload.data?.waba_id!=="string"||typeof payload.data?.phone_number_id!=="string")return;
      wabaId=payload.data.waba_id;
      phoneNumberId=payload.data.phone_number_id;
      maybeFinish();
    };
    window.addEventListener("message",onMessage);
    const timer=window.setTimeout(()=>done(undefined,new Error("O processo de conexão expirou.")),120000);
    cleanup=()=>{window.removeEventListener("message",onMessage);window.clearTimeout(timer);};
    try {
      sdk.login(response=>{
        if(!response.authResponse?.code){done(undefined,new Error("A autorização da Meta não foi concluída."));return;}
        code=response.authResponse.code;
        maybeFinish();
      },{
        config_id:config.configId,
        auth_type:"rerequest",
        response_type:"code",
        override_default_response_type:true,
        // Configuração Facebook Login for Business determina a versão v4.
        extras:{setup:{}},
      });
    }catch{done(undefined,new Error("Não foi possível abrir o login da Meta."));}
  });
  await apiFetch("/whatsapp/meta/complete",{method:"POST",body:{...details,state:config.state,pin}});
}

const statusLabel=(status:string)=>status==="connected"?"Conectado":status==="qr"?"Aguardando leitura do QR":
  status==="configured"?"Configurado":"Desconectado";
export function WhatsAppRoute(){
  const {role}=useSession();
  const client=useQueryClient();
  const result=useQuery({queryKey:["whatsapp","connections"],queryFn:()=>apiFetch<Connections>("/whatsapp/connections"),
    retry:false,refetchInterval:5000,enabled:role==="admin"});
  const [busy,setBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [qrVersion,setQrVersion]=useState(0);
  const [pin,setPin]=useState("");
  if(role&&role!=="admin")return <Navigate to="/settings" replace/>;

  async function action(id:string,operation:()=>Promise<unknown>,success:string){
    setBusy(id);setNotice("");setError("");
    try{
      await operation();setNotice(success);
      if(id==="signup")setPin("");
      setQrVersion(v=>v+1);
      await client.invalidateQueries({queryKey:["whatsapp","connections"]});
    }catch(e){setError(e instanceof Error?e.message:"A operação não pôde ser concluída.");}
    finally{setBusy(null);}
  }
  const snapshot=result.data;
  return <div className="space-y-6">
    <PageHeader eyebrow="Configurações" title="Conexões WhatsApp"
      description="Vincule os números pelo QR local ou pela API oficial da Meta, sem expor tokens ao navegador."/>
    {error?<div role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error}</div>:null}
    {notice?<div role="status" className="rounded-xl border bg-card p-3 text-sm">{notice}</div>:null}
    {result.isError?<p role="alert" className="rounded-xl border p-4 text-sm">Não foi possível carregar o estado das conexões. Confirme sua sessão e o servidor.</p>:null}
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><QrCode className="h-5 w-5"/> QR Code · local</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Gratuito, autohospedado, via Baileys (integração não oficial). Abra WhatsApp → Aparelhos conectados → Conectar aparelho.</p>
          {!snapshot&&!result.isError?<p className="text-sm text-muted-foreground">Carregando sessões...</p>:null}
          {snapshot?.local.length===0?<p className="rounded-lg border p-3 text-sm">Nenhuma sessão local configurada neste servidor. O modo oficial pode estar ativo na configuração inicial.</p>:null}
          {snapshot?.local.map(session=><section key={session.id} className="space-y-3 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <div><p className="font-semibold text-sm">{session.id}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">{session.status==="connected"?<Wifi className="h-3.5 w-3.5"/>:<WifiOff className="h-3.5 w-3.5"/>}{statusLabel(session.status)}{session.active?" · principal":""}</p>
              </div>
              <Button variant="outline" size="sm" disabled={busy!==null||session.active}
                onClick={()=>void action(session.id+":select",()=>apiFetch(`/whatsapp/connections/local/${encodeURIComponent(session.id)}/activate`,{method:"POST"}),"Sessão selecionada.")}>
                {session.active?"Em uso":"Selecionar"}
              </Button>
            </div>
            {session.qrAvailable?<div className="flex flex-col items-center gap-2 rounded-lg bg-white p-4">
              <img alt={`QR para conectar a sessão ${session.id}`} width={260} height={260}
                className="aspect-square w-full max-w-[260px]" src={`/admin/api/whatsapp/connections/local/${encodeURIComponent(session.id)}/qr.svg?v=${qrVersion}-${result.dataUpdatedAt}`}/>
              <span className="text-center text-xs text-slate-600">Aponte a câmera do WhatsApp para este código.</span>
            </div>:null}
            {session.status!=="connected"&&session.active?<Button size="sm" variant="outline" disabled={busy!==null}
              onClick={()=>void action(session.id+":restart",()=>apiFetch(`/whatsapp/connections/local/${encodeURIComponent(session.id)}/reconnect`,{method:"POST"}),"Solicitação de novo QR enviada.")}>
              <RefreshCcw className="mr-2 h-3.5 w-3.5"/> Gerar novo QR
            </Button>:null}
          </section>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Cloud className="h-5 w-5"/> API oficial Meta</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Conexão opcional via Embedded Signup. Tarifas e requisitos da Meta podem ser aplicáveis. Nenhum serviço pago é necessário para o modo local.</p>
          <div className="space-y-1"><label htmlFor="meta-pin" className="text-sm font-medium">PIN de 6 dígitos da verificação em duas etapas</label>
            <input id="meta-pin" className="w-full rounded-md border bg-background p-2 text-sm" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" placeholder="Crie e guarde um PIN de 6 dígitos" value={pin} onChange={e=>setPin(e.target.value.replace(/\\D/g,"").slice(0,6))}/>
            <p className="text-xs text-muted-foreground">Necessário para registrar o número na Cloud API. Guarde esse PIN em local seguro; o CRM não o armazena.</p></div>
          <Button disabled={busy!==null||!snapshot?.signupEnabled||pin.length!==6}
            onClick={()=>void action("signup",async()=>{
              const config=await apiFetch<SignupConfig>("/whatsapp/meta/signup");
              await signupWithMeta(config,pin);
            },"Número autorizado e registrado no CRM.")}>
            <Link2 className="mr-2 h-4 w-4"/> Conectar com a Meta
          </Button>
          {!snapshot?.signupEnabled?<div className="rounded-lg border p-3 text-sm text-muted-foreground">
            Integração opcional não configurada. O administrador do servidor precisa informar META_APP_ID, META_CONFIG_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN e WHATSAPP_CREDENTIALS_KEY no ambiente privado.
          </div>:null}
          {snapshot?.meta.map(channel=><section key={channel.id} className="rounded-xl border p-3 space-y-3">
            <div><p className="font-semibold text-sm">{channel.displayName}</p>
              <p className="text-xs text-muted-foreground">Número ID: {channel.phoneNumberId} · {channel.active?"Ativo":"Inativo"}</p></div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy!==null||channel.active}
                onClick={()=>void action(channel.id+":activate",()=>apiFetch(`/whatsapp/connections/meta/${channel.id}/activate`,{method:"POST"}),"Canal oficial ativado.")}>
                {channel.active?"Em uso":"Ativar"}
              </Button>
              <Button size="sm" variant="outline" disabled={busy!==null}
                onClick={()=>{if(window.confirm("Remover as credenciais deste canal do CRM? Para revogar a autorização na Meta, use também o Business Manager."))void action(channel.id+":delete",()=>apiFetch(`/whatsapp/connections/meta/${channel.id}`,{method:"DELETE"}),"Canal removido do CRM.");}}>
                <Trash2 className="mr-2 h-3.5 w-3.5"/> Remover
              </Button>
            </div>
          </section>)}
          <div className="flex gap-2 rounded-lg border p-3 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 shrink-0"/> O código de autorização é trocado no servidor. Tokens são armazenados cifrados e não aparecem na interface ou nas respostas da API.
          </div>
        </CardContent>
      </Card>
    </div>
    <p className="text-xs text-muted-foreground">
      Apenas um canal fica ativo para envio por instalação. As sessões locais configuradas continuam disponíveis para alternância.
      Para operação simultânea por cliente, é necessária a separação por workspace em todo o motor de conversas.
    </p>
  </div>;
}

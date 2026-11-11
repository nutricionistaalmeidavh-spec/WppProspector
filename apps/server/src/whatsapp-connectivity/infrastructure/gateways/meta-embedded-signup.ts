import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { WhatsAppChannelStore, type MetaChannel } from "./whatsapp-channel-store.ts";

export interface EmbeddedMetaConfig { appId: string; configId: string; appSecret: string }
export class MetaEmbeddedSignup {
  private readonly states = new Map<string,{fingerprint:string;expires:number}>();
  constructor(
    readonly config: EmbeddedMetaConfig,
    private readonly store: WhatsAppChannelStore,
    private readonly http: typeof fetch = fetch,
  ) {}
  createState(sessionCookie: string): string {
    if (!sessionCookie) throw new Error("Sessão administrativa ausente");
    const now=Date.now();
    for (const [key,item] of this.states) if(item.expires < now) this.states.delete(key);
    if(this.states.size>1000) this.states.clear();
    const state=randomBytes(24).toString("hex");
    this.states.set(state,{fingerprint:this.fingerprint(sessionCookie),expires:now+5*60_000});
    return state;
  }
  private fingerprint(value:string):string {return createHash("sha256").update(value).digest("hex");}
  private consumeState(state:string,sessionCookie:string):void {
    const item=this.states.get(state);
    const actual=Buffer.from(this.fingerprint(sessionCookie),"hex");
    const expected=Buffer.from(item?.fingerprint??"0".repeat(64),"hex");
    if(!item||item.expires<Date.now()||!timingSafeEqual(actual,expected))throw new Error("Autorização expirada ou inválida");
    this.states.delete(state);
  }
  private async getJson(url:URL, init?:RequestInit):Promise<Record<string,unknown>> {
    const response=await this.http(url.toString(),{...init,signal:AbortSignal.timeout(15_000),redirect:"error"});
    if(!response.ok)throw new Error("A Meta não concluiu a autorização. Verifique permissões e configuração do aplicativo.");
    const json:unknown=await response.json();
    if(!json || typeof json!=="object" || Array.isArray(json))throw new Error("Resposta da Meta inválida");
    return json as Record<string,unknown>;
  }
  async complete(input:{state:string;sessionCookie:string;code:string;wabaId:string;phoneNumberId:string;pin:string}):Promise<MetaChannel> {
    this.consumeState(input.state,input.sessionCookie);
    if(!/^\d{1,30}$/.test(input.wabaId)||!/^\d{1,30}$/.test(input.phoneNumberId)||input.code.length<1||input.code.length>4000||!/^\d{6}$/.test(input.pin)){
      throw new Error("Identificadores de autorização inválidos");
    }
    const url=new URL("https://graph.facebook.com/v26.0/oauth/access_token");
    url.searchParams.set("client_id",this.config.appId);
    url.searchParams.set("client_secret",this.config.appSecret);
    url.searchParams.set("code",input.code);
    const auth=await this.getJson(url);
    const accessToken=auth.access_token;
    if(typeof accessToken!=="string"||!accessToken)throw new Error("A Meta não devolveu a autorização do número.");
    const phonesUrl=new URL(`https://graph.facebook.com/v26.0/${input.wabaId}/phone_numbers`);
    phonesUrl.searchParams.set("fields","id,display_phone_number,verified_name");
    phonesUrl.searchParams.set("limit","1000");
    const headers={Authorization:`Bearer ${accessToken}`};
    const phones=await this.getJson(phonesUrl,{headers});
    const rows=Array.isArray(phones.data)?phones.data:[];
    const phone=rows.find((value):value is Record<string,unknown> =>
      !!value&&typeof value==="object"&&String((value as Record<string,unknown>).id)===input.phoneNumberId);
    if(!phone)throw new Error("O telefone não pertence à conta Meta autorizada.");
    const subscribeUrl=new URL(`https://graph.facebook.com/v26.0/${input.wabaId}/subscribed_apps`);
    const subscription=await this.getJson(subscribeUrl,{method:"POST",headers});
    if(subscription.success!==true)throw new Error("Falha ao inscrever o webhook do aplicativo Meta.");
    // Embedded Signup não registra automaticamente todos os números na Cloud API.
    // O PIN é enviado uma única vez à Meta, nunca persistido na base local.
    const registerUrl=new URL(`https://graph.facebook.com/v26.0/${input.phoneNumberId}/register`);
    const registration=await this.getJson(registerUrl,{
      method:"POST",
      headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({messaging_product:"whatsapp",pin:input.pin}),
    });
    if(registration.success!==true)throw new Error("A Meta não confirmou o registro do telefone na Cloud API.");
    const displayName=String(phone.verified_name??phone.display_phone_number??input.phoneNumberId).slice(0,120);
    return this.store.upsert({phoneNumberId:input.phoneNumberId,wabaId:input.wabaId,displayName,accessToken});
  }
}

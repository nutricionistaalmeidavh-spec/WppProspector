import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { SESSION_COOKIE_NAME } from "../../../../management/infrastructure/http/session-guard.ts";
import { WhatsAppConnectionManager } from "../../gateways/whatsapp-connection-manager.ts";
import { MetaEmbeddedSignup } from "../../gateways/meta-embedded-signup.ts";
import { makeQrSvg } from "../../gateways/qr-svg.ts";

export interface WhatsAppConnectionsRoutesDeps {
  manager: WhatsAppConnectionManager;
  signup?: MetaEmbeddedSignup | undefined;
}
const idParams=z.object({id:z.string().min(1).max(60)});
const finishBody=z.object({
  state:z.string().length(48),
  code:z.string().min(1).max(4000),
  wabaId:z.string().regex(/^\d{1,30}$/),
  phoneNumberId:z.string().regex(/^\d{1,30}$/),
});
function ownOrigin(request:{headers:{origin?:string;host?:string}}):boolean {
  const origin=request.headers.origin;
  if(!origin)return true;
  try {return new URL(origin).host===request.headers.host;}catch{return false;}
}

/** Registrado sob /admin, atrás da guarda de sessão e da restrição admin. */
export const registerWhatsAppConnectionsRoutes:FastifyPluginAsync<WhatsAppConnectionsRoutesDeps>=async(app,deps)=>{
  app.get("/api/whatsapp/connections",async(_request,reply)=>{
    reply.header("Cache-Control","no-store");
    return {
      connection:deps.manager.diagnostics(),
      local:deps.manager.localSessions(),
      meta:deps.manager.metaStore?.list()??[],
      signupEnabled:!!deps.signup,
    };
  });
  app.get("/api/whatsapp/connections/local/:id/qr.svg",async(request,reply)=>{
    const params=idParams.safeParse(request.params);
    if(!params.success)return reply.code(400).send({error:"Sessão inválida"});
    const qr=deps.manager.qrFor(params.data.id);
    reply.header("Cache-Control","private, no-store");
    reply.header("X-Content-Type-Options","nosniff");
    if(!qr)return reply.code(404).send({error:"QR indisponível ou sessão já conectada"});
    try {
      const svg=await makeQrSvg(qr);
      return reply.type("image/svg+xml").send(svg);
    } catch {
      return reply.code(503).send({error:"Gerador QR local indisponível"});
    }
  });
  app.post("/api/whatsapp/connections/local/:id/reconnect",async(request,reply)=>{
    if(!ownOrigin(request))return reply.code(403).send({error:"Origem não autorizada"});
    const params=idParams.safeParse(request.params);
    if(!params.success)return reply.code(400).send({error:"Sessão inválida"});
    try{await deps.manager.reconnectLocal(params.data.id);return {ok:true};}
    catch(e){return reply.code(409).send({error:e instanceof Error?e.message:"Falha no pareamento"});}
  });
  app.post("/api/whatsapp/connections/local/:id/activate",async(request,reply)=>{
    if(!ownOrigin(request))return reply.code(403).send({error:"Origem não autorizada"});
    const params=idParams.safeParse(request.params);
    if(!params.success)return reply.code(400).send({error:"Sessão inválida"});
    try{await deps.manager.activateLocal(params.data.id);return {ok:true};}
    catch(e){return reply.code(409).send({error:e instanceof Error?e.message:"Falha ao ativar"});}
  });
  app.post("/api/whatsapp/connections/meta/:id/activate",async(request,reply)=>{
    if(!ownOrigin(request))return reply.code(403).send({error:"Origem não autorizada"});
    const params=idParams.safeParse(request.params);
    if(!params.success)return reply.code(400).send({error:"Canal inválido"});
    try{await deps.manager.activateMeta(params.data.id);return {ok:true};}
    catch(e){return reply.code(409).send({error:e instanceof Error?e.message:"Falha ao ativar"});}
  });
  app.delete("/api/whatsapp/connections/meta/:id",async(request,reply)=>{
    if(!ownOrigin(request))return reply.code(403).send({error:"Origem não autorizada"});
    const params=idParams.safeParse(request.params);
    if(!params.success)return reply.code(400).send({error:"Canal inválido"});
    try {
      if(!await deps.manager.removeMeta(params.data.id))return reply.code(404).send({error:"Canal não encontrado"});
      return reply.code(204).send();
    }catch{return reply.code(409).send({error:"Não foi possível remover o canal"});}
  });
  app.get("/api/whatsapp/meta/signup",async(request,reply)=>{
    reply.header("Cache-Control","no-store");
    if(!deps.signup)return {enabled:false};
    const cookie=request.cookies?.[SESSION_COOKIE_NAME]??"";
    return {enabled:true,appId:deps.signup.config.appId,configId:deps.signup.config.configId,
      state:deps.signup.createState(cookie)};
  });
  app.post("/api/whatsapp/meta/complete",async(request,reply)=>{
    if(!ownOrigin(request))return reply.code(403).send({error:"Origem não autorizada"});
    if(!deps.signup)return reply.code(409).send({error:"A integração Meta é opcional e não foi configurada"});
    const input=finishBody.safeParse(request.body);
    if(!input.success)return reply.code(400).send({error:"Dados de autorização inválidos"});
    try {
      const channel=await deps.signup.complete({...input.data,sessionCookie:request.cookies?.[SESSION_COOKIE_NAME]??""});
      await deps.manager.activateMeta(channel.id);
      return reply.code(201).send({connection:channel});
    }catch(e){
      return reply.code(400).send({error:e instanceof Error?e.message:"Falha na autorização Meta"});
    }
  });
};
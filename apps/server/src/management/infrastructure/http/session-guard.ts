import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { verify } from "./session-token.ts";
import type { TeamStore } from "../../../team/team-store.ts";

export const SESSION_COOKIE_NAME = "admin_session";

function unauthorized(reply: FastifyReply): FastifyReply {
  return reply.code(401).send({ error: "unauthorized" });
}

function pathOf(request: FastifyRequest): string {
  const url = request.url;
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

/**
 * `preHandler` que exige um cookie de sessão válido para todo `.../api/...`,
 * menos `POST .../api/session` (login). Caminhos fora de `/api/` (estáticos da
 * SPA) passam sem sessão. Qualquer resultado diferente de `ok` → 401 com corpo
 * neutro, sem revelar dados de gestão.
 */
export function createAdminSessionGuard(deps: {
  sessionSecret: string;
  clock?: () => Date;
  team?: TeamStore;
  assignmentOwner?: (phone:string)=>string|null;
}): preHandlerAsyncHookHandler {
  const clock = deps.clock ?? (() => new Date());

  return async function adminSessionGuard(request, reply) {
    const path = pathOf(request);

    // Só a API é protegida; os estáticos da interface passam.
    if (!/\/api(\/|$)/.test(path)) return;

    // Login é o único endpoint de API acessível sem sessão.
    if (request.method === "POST" && /\/api\/session\/?$/.test(path)) return;

    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (token === undefined || token === "") {
      return unauthorized(reply);
    }

    const session=verify(token,clock(),deps.sessionSecret);
    if(session.status!=="ok")return unauthorized(reply);
    const {userId,version,role}=session.payload;
    if(userId&&(!deps.team||!deps.team.sessionValid(userId,version!)))return unauthorized(reply);
    // O segredo administrativo legado mantém o papel admin; contas da equipe são limitadas.
    if(!userId)return;
    const apiPath=path.slice(path.indexOf("/api/"));
    if(apiPath.startsWith("/api/team/") || apiPath.startsWith("/api/whatsapp/"))
      return reply.code(403).send({error:"forbidden"});
    const write=!["GET","HEAD","OPTIONS"].includes(request.method);
    if(!write||apiPath==="/api/session")return;
    if(role==="manager")return;
    const messageRoute=/^\/api\/conversations\/([^/]+)\/(?:messages|handoff|resume)$/.exec(apiPath);
    if(messageRoute){
      const phone=decodeURIComponent(messageRoute[1]!);
      const assigned=deps.assignmentOwner?.(phone);
      if(assigned&&assigned!==userId)return reply.code(403).send({error:"Atendimento atribuído a outro operador"});
    }
    // Agentes podem operar o CRM, mas não administrar contas, campanhas, regras
    // de automação ou realizar prospecção em massa.
    const allowedCrm=/^\/api\/crm\/(?:companies|opportunities|customers\/convert|quotes|activities)(?:\/.*)?$/.test(apiPath);
    const allowedLead=request.method==="POST"&&apiPath==="/api/leads";
    const allowedManualMessage=request.method==="POST"&&
      /^\/api\/conversations\/[^/]+\/messages$/.test(apiPath);
    const allowedHandoff=request.method==="POST"&&
      /^\/api\/conversations\/[^/]+\/(?:handoff|resume)$/.test(apiPath);
    const allowedEngagement=(request.method==="PUT"&&
      (/^\/api\/engagement\/assignments\/[^/]+$/.test(apiPath)||
       /^\/api\/engagement\/contacts\/[^/]+\/labels$/.test(apiPath)||
       apiPath==="/api/engagement/values")) ||
      (request.method==="PATCH"&&/^\/api\/engagement\/opportunities\/[^/]+\/stage$/.test(apiPath));
    const allowedOnboarding = /^\/api\/onboarding\/(?:tour|first-operation(?:\/progress)?)$/.test(apiPath);
    if(!allowedCrm&&!allowedLead&&!allowedManualMessage&&!allowedOnboarding&&!allowedHandoff&&!allowedEngagement)
      return reply.code(403).send({error:"forbidden"});
  };
}

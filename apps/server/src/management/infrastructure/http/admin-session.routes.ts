import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { SESSION_COOKIE_NAME } from "./session-guard.ts";
import { constantTimeEquals, issue, verify } from "./session-token.ts";
import type { TeamStore } from "../../../team/team-store.ts";

export interface AdminSessionRoutesDeps {
  accessSecret: string;
  sessionSecret: string;
  sessionTtlMs: number;
  /** `Path` do cookie — o prefixo em que o plugin `/admin` está montado. */
  cookiePath: string;
  clock?: () => Date;
  team?: TeamStore;
}

const loginBodySchema = z.union([
  z.object({ secret: z.string().min(1) }),
  z.object({ username: z.string().min(3).max(40), password: z.string().min(1) }),
]);

/**
 * `POST /api/session` — troca o segredo compartilhado por um cookie de sessão
 * assinado. `DELETE /api/session` — expira o cookie (logout). Montado sob o
 * prefixo `/admin`, então os caminhos efetivos são `/admin/api/session`.
 */
export const registerAdminSessionRoutes: FastifyPluginAsync<AdminSessionRoutesDeps> = async (
  app,
  deps,
) => {
  const clock = deps.clock ?? (() => new Date());
  const attempts=new Map<string,{count:number;until:number}>();
  const BLOCK_MS=10*60*1000,MAX_ATTEMPTS=10;
  function failed(ip:string){
    const now=clock().getTime(),prior=attempts.get(ip);
    const item=prior&&prior.until>now?prior:{count:0,until:now+BLOCK_MS};
    item.count++;attempts.set(ip,item);
    return item.count>=MAX_ATTEMPTS;
  }
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: true,
    path: deps.cookiePath,
  };

  app.post("/api/session", async (request, reply) => {
    const ip=request.ip,existing=attempts.get(ip);
    if(existing&&existing.until>clock().getTime()&&existing.count>=MAX_ATTEMPTS)
      return reply.code(429).send({error:"too_many_attempts"});
    const parsed=loginBodySchema.safeParse(request.body);
    if(!parsed.success){failed(ip);return reply.code(401).send({error:"unauthorized"});}
    let operator: {userId:string;role:"manager"|"agent";version:number}|undefined;
    if("secret" in parsed.data){
      if(!constantTimeEquals(parsed.data.secret,deps.accessSecret)){
        failed(ip);return reply.code(401).send({error:"unauthorized"});
      }
    }else{
      const user=deps.team?.authenticate(parsed.data.username,parsed.data.password);
      if(!user){failed(ip);return reply.code(401).send({error:"unauthorized"});}
      operator={userId:user.id,role:user.role,version:user.version};
    }
    attempts.delete(ip);
    const token=issue(clock(),deps.sessionTtlMs,deps.sessionSecret,operator);
    reply.setCookie(SESSION_COOKIE_NAME,token,cookieOptions);
    return reply.code(200).send({ok:true,role:operator?.role??"admin"});
  });

  app.get("/api/session/me",async(request,reply)=>{
    const token=request.cookies?.[SESSION_COOKIE_NAME]??"";
    const session=verify(token,clock(),deps.sessionSecret);
    if(session.status!=="ok")return reply.code(401).send({error:"unauthorized"});
    const actor=session.payload;
    if(actor.userId&&(!deps.team||!deps.team.sessionValid(actor.userId,actor.version!)))
      return reply.code(401).send({error:"unauthorized"});
    return reply.send({role:actor.role??"admin",userId:actor.userId??null});
  });

  app.delete("/api/session", async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    return reply.code(204).send();
  });
};

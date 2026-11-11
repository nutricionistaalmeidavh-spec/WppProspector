import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { TeamStore } from "./team-store.ts";

const account=z.object({
  username:z.string().trim().regex(/^[a-zA-Z0-9._-]{3,40}$/),
  password:z.string().min(12).max(128),
  role:z.enum(["manager","agent"]),
});
const patch=z.object({active:z.boolean().optional(),role:z.enum(["manager","agent"]).optional()})
  .refine(value=>value.active!==undefined||value.role!==undefined,"Nenhuma alteração recebida");

export const registerTeamRoutes:FastifyPluginAsync<{store:TeamStore}>=async(app,{store})=>{
  app.get("/api/team/users",async()=>({items:store.list()}));
  app.post("/api/team/users",async(req,reply)=>{
    const data=account.safeParse(req.body);
    if(!data.success)return reply.code(422).send({error:"Credenciais ou perfil inválidos"});
    try{return reply.code(201).send(store.create(data.data));}
    catch(error){
      const message=error instanceof Error?error.message:"Erro ao cadastrar usuário";
      return reply.code(message.includes("UNIQUE constraint")?409:422).send({error:message});
    }
  });
  app.patch<{Params:{id:string}}>("/api/team/users/:id",async(req,reply)=>{
    const params=z.object({id:z.string().uuid()}).safeParse(req.params),data=patch.safeParse(req.body);
    if(!params.success||!data.success)return reply.code(422).send({error:"Alteração inválida"});
    const value=store.update(params.data.id,data.data);
    return value?reply.send(value):reply.code(404).send({error:"Usuário não encontrado"});
  });
};

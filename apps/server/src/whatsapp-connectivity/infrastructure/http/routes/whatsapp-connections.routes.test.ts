import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { createAdminSessionGuard } from "../../../../management/infrastructure/http/session-guard.ts";
import { registerAdminSessionRoutes } from "../../../../management/infrastructure/http/admin-session.routes.ts";
import { TeamStore } from "../../../../team/team-store.ts";
import { registerWhatsAppConnectionsRoutes } from "./whatsapp-connections.routes.ts";
import type { WhatsAppConnectionManager } from "../../gateways/whatsapp-connection-manager.ts";

describe("central WhatsApp protegida por sessão administrativa", () => {
  it("nega acesso anônimo e da equipe inclusive à imagem QR e à configuração Meta", async () => {
    const db=new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE crm_team_users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
      role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );`);
    const team=new TeamStore(db);
    team.create({username:"operador",password:"Password123456789",role:"manager"});
    const app=Fastify();
    const manager={
      diagnostics:()=>({provider:"baileys",status:"qr",qrAvailable:true}),
      localSessions:()=>[{id:"principal",status:"qr",qrAvailable:true,active:true}],
      metaStore:null,
      qrFor:vi.fn(()=>null),
      reconnectLocal:vi.fn(async()=>{}),
      activateLocal:vi.fn(async()=>{}),
    } as unknown as WhatsAppConnectionManager;
    await app.register(cookie);
    app.addHook("preHandler",createAdminSessionGuard({sessionSecret:"signing-secret",team}));
    await app.register(registerAdminSessionRoutes,{accessSecret:"admin-password",sessionSecret:"signing-secret",
      sessionTtlMs:3600000,cookiePath:"/",team});
    await app.register(registerWhatsAppConnectionsRoutes,{manager});
    await app.ready();
    try {
      expect((await app.inject({method:"GET",url:"/api/whatsapp/connections"})).statusCode).toBe(401);
      const teamLogin=await app.inject({method:"POST",url:"/api/session",payload:{username:"operador",password:"Password123456789"}});
      const teamCookie=String(teamLogin.headers["set-cookie"]).split(";")[0]!;
      expect((await app.inject({method:"GET",url:"/api/whatsapp/connections",headers:{cookie:teamCookie}})).statusCode).toBe(403);
      expect((await app.inject({method:"GET",url:"/api/whatsapp/connections/local/principal/qr.svg",headers:{cookie:teamCookie}})).statusCode).toBe(403);
      const login=await app.inject({method:"POST",url:"/api/session",payload:{secret:"admin-password"}});
      const adminCookie=String(login.headers["set-cookie"]).split(";")[0]!;
      const result=await app.inject({method:"GET",url:"/api/whatsapp/connections",headers:{cookie:adminCookie}});
      expect(result.statusCode).toBe(200);
      expect(result.json().local).toHaveLength(1);
      expect((await app.inject({method:"GET",url:"/api/whatsapp/meta/signup",headers:{cookie:adminCookie}})).json()).toEqual({enabled:false});
      expect((await app.inject({method:"GET",url:"/api/whatsapp/connections/local/principal/qr.svg",headers:{cookie:adminCookie}})).statusCode).toBe(404);
      expect((await app.inject({method:"POST",url:"/api/whatsapp/connections/local/principal/activate",headers:{cookie:adminCookie,origin:"https://evil.invalid",host:"localhost:3000"}})).statusCode).toBe(403);
    } finally { await app.close(); db.close(); }
  });
});

import { describe, expect, it } from "vitest";
import { buildAdminTestApp } from "../management/test-support/admin-test-app.ts";

describe("CRM team admin RBAC",()=>{
  it("admin provisions agent; agent cannot manage accounts or broadcast prospecting",async()=>{
    const h=await buildAdminTestApp();
    try{
      const admin=await h.login();
      const created=await h.app.inject({method:"POST",url:"/admin/api/team/users",
        headers:{cookie:admin},payload:{username:"operador",password:"SenhaForte!2026",role:"agent"}});
      expect(created.statusCode).toBe(201);
      expect(JSON.stringify(created.json())).not.toContain("SenhaForte!2026");
      const login=await h.app.inject({method:"POST",url:"/admin/api/session",
        payload:{username:"operador",password:"SenhaForte!2026"}});
      expect(login.statusCode).toBe(200);
      const raw=login.headers["set-cookie"],agent=(Array.isArray(raw)?raw[0]:String(raw)).split(";")[0]!;
      expect((await h.app.inject({method:"GET",url:"/admin/api/crm/companies",headers:{cookie:agent}})).statusCode).toBe(200);
      expect((await h.app.inject({method:"GET",url:"/admin/api/team/users",headers:{cookie:agent}})).statusCode).toBe(403);
      expect((await h.app.inject({method:"POST",url:"/admin/api/leads/prospect",headers:{cookie:agent},payload:{phones:[]}})).statusCode).toBe(403);
      const disabled=await h.app.inject({method:"PATCH",url:"/admin/api/team/users/"+created.json().id,
        headers:{cookie:admin},payload:{active:false}});
      expect(disabled.statusCode).toBe(200);
      expect((await h.app.inject({method:"GET",url:"/admin/api/crm/companies",headers:{cookie:agent}})).statusCode).toBe(401);
    }finally{await h.close();}
  });
});

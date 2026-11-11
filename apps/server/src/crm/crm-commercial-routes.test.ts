import { describe, expect, it } from "vitest";
import { buildAdminTestApp } from "../management/test-support/admin-test-app.ts";

describe("CRM comercial HTTP autenticado", () => {
  it("converte lead, gera proposta e completa tarefa sem transporte externo", async () => {
    const h=await buildAdminTestApp();
    try {
      expect((await h.app.inject({method:"GET",url:"/admin/api/crm/customers"})).statusCode).toBe(401);
      const cookie=await h.login();
      const call=(method:"GET"|"POST",url:string,payload?:object)=>
        h.app.inject({method,url,headers:{cookie},payload});
      await h.leads.upsert({phone:"+5516999999999",displayName:"Cliente de teste"});
      const company=await call("POST","/admin/api/crm/companies",{name:"Empresa teste"});
      expect(company.statusCode).toBe(201);
      const opportunity=await call("POST","/admin/api/crm/opportunities",{
        title:"Implantação",companyId:company.json().id,leadPhone:"+5516999999999",
      });
      expect(opportunity.statusCode).toBe(201);
      const customer=await call("POST","/admin/api/crm/customers/convert",{leadPhone:"+5516999999999"});
      expect(customer.statusCode).toBe(200);
      const quote=await call("POST","/admin/api/crm/quotes",{
        opportunityId:opportunity.json().id,items:[{description:"Instalação",quantity:1,unitPrice:350}],
      });
      expect(quote.statusCode).toBe(201);
      expect(quote.json()).toMatchObject({totalCents:35000,customerId:customer.json().id});
      const task=await call("POST","/admin/api/crm/activities",{
        opportunityId:opportunity.json().id,kind:"CALL",subject:"Retorno",dueAt:"2026-11-12",
      });
      expect(task.statusCode).toBe(201);
      const complete=await call("POST","/admin/api/crm/activities/"+task.json().id+"/complete");
      expect(complete.json().status).toBe("DONE");
      expect((await call("GET","/admin/api/crm/analytics/commercial")).json().total).toBe(1);
    } finally { await h.close(); }
  });

  it("recusa itens inválidos e não cria orçamento parcial", async () => {
    const h=await buildAdminTestApp();
    try {
      const cookie=await h.login();
      const r=await h.app.inject({method:"POST",url:"/admin/api/crm/quotes",
        headers:{cookie},payload:{opportunityId:"00000000-0000-4000-8000-000000000001",
          items:[{description:"Produto",quantity:-2,unitPrice:100}]}});
      expect(r.statusCode).toBe(422);
    } finally { await h.close(); }
  });
});

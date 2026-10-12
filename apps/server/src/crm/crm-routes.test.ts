import { describe, expect, it } from "vitest";
import { buildAdminTestApp } from "../management/test-support/admin-test-app.ts";

describe("CRM /admin/api persistente", () => {
  it("requer sessão e permite criar empresas, oportunidades e campanhas", async () => {
    const harness=await buildAdminTestApp();
    try {
      expect((await harness.app.inject({method:"GET",url:"/admin/api/crm/companies"})).statusCode).toBe(401);
      const cookie=await harness.login();
      const send=(method:"GET"|"POST"|"PATCH",url:string,payload?:object)=>harness.app.inject({method,url,headers:{cookie},payload});
      const company=await send("POST","/admin/api/crm/companies",{name:"Construtora Real",city:"Franca",segment:"Obras"});
      expect(company.statusCode).toBe(201);
      expect((await send("GET","/admin/api/crm/companies")).json().items).toHaveLength(1);
      const updatedCompany=await send("PATCH","/admin/api/crm/companies/"+company.json().id,{name:"Construtora Real Atualizada"});
      expect(updatedCompany.json()).toMatchObject({city:"Franca",segment:"Obras"});
      await harness.leads.upsert({phone:"+5516999999999",displayName:"Pessoa Teste"});
      const campaign=await send("POST","/admin/api/crm/campaigns",{name:"Teste sem disparos"});
      expect(campaign.statusCode).toBe(201);
      await send("PATCH","/admin/api/crm/campaigns/"+campaign.json().id,{status:"running"});
      const renamed=await send("PATCH","/admin/api/crm/campaigns/"+campaign.json().id,{name:"Campanha atualizada"});
      expect(renamed.json().status).toBe("running");
      const member=await send("POST","/admin/api/crm/campaigns/"+campaign.json().id+"/members",{phones:["+5516999999999"]});
      expect(member.statusCode).toBe(200);
      const opp=await send("POST","/admin/api/crm/opportunities",{title:"PDV",companyId:company.json().id,leadPhone:"+5516999999999",stage:"qualified",estimatedValue:350,owner:"Victor",campaignId:campaign.json().id});
      expect(opp.statusCode).toBe(201);
      const won=await send("PATCH","/admin/api/crm/opportunities/"+opp.json().id,{stage:"won"});
      expect(won.statusCode).toBe(200);
      expect(won.json().estimatedValue).toBe(350);
      expect((await send("GET","/admin/api/crm/analytics/conversions")).json()).toMatchObject({won:1,wonValue:350});
      expect((await send("GET","/admin/api/crm/campaigns")).json().items[0]).toMatchObject({audience:1,opportunities:1,won:1,sent:0});
    } finally { await harness.close(); }
  });
});

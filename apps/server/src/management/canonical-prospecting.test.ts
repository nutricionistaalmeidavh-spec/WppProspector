import {describe,expect,it} from "vitest";
import {buildAdminTestApp} from "./test-support/admin-test-app.ts";
import {CrmStore} from "../crm/crm-store.ts";
const PHONE="+5516900000077";
describe("prospecting vs commercial relationship",()=>{
 it("converted customer cannot be sent initial campaigns even with force; service responses remain separate",async()=>{
  const h=await buildAdminTestApp();
  try{
   const cookie=await h.login();
   await h.leads.upsert({phone:PHONE,displayName:"Empresa cliente"});
   const crm=new CrmStore(h.db);
   const company=crm.createCompany({name:"Empresa cliente"});
   crm.createOpportunity({title:"Contrato",companyId:company.id,leadPhone:PHONE});
   crm.convertLeadToCustomer(PHONE);
   const first=await h.app.inject({method:"POST",url:"/admin/api/leads/"+PHONE+"/prospect",
    headers:{cookie},payload:{force:true}});
   expect(first.statusCode).toBe(409);
   expect(first.json().error).toBe("customer_already_converted");
   const bulk=await h.app.inject({method:"POST",url:"/admin/api/leads/prospect",
    headers:{cookie},payload:{phones:[PHONE],force:true}});
   expect(bulk.statusCode).toBe(200);
   expect(bulk.json().results[0]).toMatchObject({outcome:"failed",reason:"customer_already_converted"});
   expect(h.sendTemplate.calls).toHaveLength(0);
  }finally{await h.close();}
 });
});

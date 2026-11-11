import {describe,expect,it} from "vitest";
import {buildAdminTestApp} from "../management/test-support/admin-test-app.ts";
import {CrmStore} from "./crm-store.ts";
const PHONE="+5516900000088";
describe("campaign event attribution HTTP",()=>{
 it("attributes only real template sent by campaign route, never arbitrary prospecting",async()=>{
  const h=await buildAdminTestApp();
  try{
   const cookie=await h.login();
   await h.leads.upsert({phone:PHONE,displayName:"Lead autorizado"});
   const crm=new CrmStore(h.db);
   const campaign=crm.createCampaign({name:"Origem verdadeira"});
   crm.addCampaignMembers(campaign.id,[PHONE]);
   const before=crm.listCampaigns().find(c=>c.id===campaign.id);
   expect(before).toMatchObject({sent:0,replied:0,failed:0});
   const res=await h.app.inject({method:"POST",
    url:"/admin/api/crm/campaigns/"+campaign.id+"/prospect",
    headers:{cookie},payload:{phone:PHONE}});
   expect(res.statusCode).toBe(200);
   expect(res.json()).toMatchObject({outcome:"sent"});
   expect(h.sendTemplate.calls).toHaveLength(1);
   expect(crm.listCampaigns().find(c=>c.id===campaign.id)).toMatchObject({sent:1,replied:0});
   expect(crm.recordCampaignReply(PHONE)).toBe(true);
   expect(crm.listCampaigns().find(c=>c.id===campaign.id)).toMatchObject({sent:1,replied:1});
  }finally{await h.close();}
 });
});

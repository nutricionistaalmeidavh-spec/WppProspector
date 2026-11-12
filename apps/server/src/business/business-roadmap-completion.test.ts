import {describe,expect,it} from "vitest";
import {buildAdminTestApp} from "../management/test-support/admin-test-app.ts";
import {BusinessAiStore} from "./business-ai-store.ts";

const business={
  name:"Oficina Teste",segment:"serviços",description:"Manutenção",openingHours:"8h às 17h",
  paymentMethods:"Pix",deliveryPolicy:"",returnPolicy:"",additionalInstructions:"",
  products:[],faq:[{question:"Qual o horário?",answer:"Das 8h às 17h"}],
};
describe("Roadmap obrigatório P0–P2",()=>{
  it("rejeita publicar um perfil não testado no servidor e invalida teste após edição",async()=>{
    const c=await buildAdminTestApp();
    try{
      const headers={cookie:await c.login()};
      expect((await c.app.inject({method:"PUT",url:"/admin/api/business/studio/draft",headers,payload:business})).statusCode).toBe(200);
      expect((await c.app.inject({method:"POST",url:"/admin/api/business/studio/publish",headers})).statusCode).toBe(409);
      const test=await c.app.inject({method:"POST",url:"/admin/api/business/studio/simulate",headers,payload:{message:"Qual o horário?",allowExternal:false}});
      expect(test.statusCode).toBe(200);
      const ready=await c.app.inject({method:"GET",url:"/admin/api/business/studio",headers});
      expect(ready.json().validation.profileReady).toBe(true);
      expect((await c.app.inject({method:"PUT",url:"/admin/api/business/studio/draft",headers,payload:{...business,openingHours:"9h às 17h"}})).statusCode).toBe(200);
      expect((await c.app.inject({method:"POST",url:"/admin/api/business/studio/publish",headers})).statusCode).toBe(409);
      await c.app.inject({method:"POST",url:"/admin/api/business/studio/simulate",headers,payload:{message:"horário",allowExternal:false}});
      expect((await c.app.inject({method:"POST",url:"/admin/api/business/studio/publish",headers})).statusCode).toBe(200);
      expect(new BusinessAiStore(c.db).getBusiness().openingHours).toBe("9h às 17h");
    }finally{await c.close();}
  });
  it("não ativa IA paga testada apenas via fallback local",async()=>{
    const c=await buildAdminTestApp();
    try{
      const headers={cookie:await c.login()};
      await c.app.inject({method:"PUT",url:"/admin/api/business/studio/ai-draft",headers,payload:{provider:"openai",model:"modelo-ficticio",apiKey:"sk-test"}})
      const trial=await c.app.inject({method:"POST",url:"/admin/api/business/studio/simulate",headers,payload:{message:"Olá",allowExternal:false}});
      expect(trial.json().provider).toBe("rules");
      expect((await c.app.inject({method:"POST",url:"/admin/api/business/studio/ai-publish",headers})).statusCode).toBe(409);
      const diag=await c.app.inject({method:"POST",url:"/admin/api/business/studio/ai-diagnostics",headers,payload:{allowExternal:false}});
      expect(diag.statusCode).toBe(409);
      expect(new BusinessAiStore(c.db,"f".repeat(64)).getAi().provider).toBe("rules");
    }finally{await c.close();}
  });
  it("exige token próprio para integrar estoque e pedidos; não mistura dados com Shopify",async()=>{
    const c=await buildAdminTestApp();
    try{
      const headers={cookie:await c.login()};
      const endpoint="/admin/integrations/commerce/v1/sync";
      const body={products:[{id:"sku-A",name:"Peça A",sku:"SKU-A",price:"120",stock:9}],
        orders:[{id:"ord-001",number:"#001",financialStatus:"paid",fulfillmentStatus:"pending",total:"120 BRL",createdAt:"2026-11-10T12:00:00Z"}]};
      expect((await c.app.inject({method:"POST",url:endpoint,payload:body})).statusCode).toBe(401);
      const tokenReply=await c.app.inject({method:"POST",url:"/admin/api/business/studio/integration-token",headers});
      expect(tokenReply.statusCode).toBe(200);
      const token=tokenReply.json().token as string;
      expect(token.length).toBeGreaterThan(24);
      expect((await c.app.inject({method:"POST",url:endpoint,headers:{authorization:"Bearer "+token},payload:body})).statusCode).toBe(200);
      const catalog=(await c.app.inject({method:"GET",url:"/admin/api/business/studio/catalog",headers})).json();
      expect(catalog.items.some((x:{source:string;id:string})=>x.source==="integration" && x.id==="integration:sku-A")).toBe(true);
      expect(catalog.orders.some((x:{number:string})=>x.number==="#001")).toBe(true);
      expect(JSON.stringify(c.db.prepare("SELECT * FROM business_commerce_integrations").all())).not.toContain(token);
      const rotated=(await c.app.inject({method:"POST",url:"/admin/api/business/studio/integration-token",headers})).json().token as string;
      expect((await c.app.inject({method:"POST",url:endpoint,headers:{authorization:"Bearer "+token},payload:body})).statusCode).toBe(401);
      expect((await c.app.inject({method:"POST",url:endpoint,headers:{authorization:"Bearer "+rotated},payload:body})).statusCode).toBe(200);
      expect((await c.app.inject({method:"DELETE",url:"/admin/api/business/studio/integration-token",headers})).statusCode).toBe(200);
      expect((await c.app.inject({method:"POST",url:endpoint,headers:{authorization:"Bearer "+rotated},payload:body})).statusCode).toBe(401);
    }finally{await c.close();}
  });

  it("mantém pedidos e dados pessoais fora da integração, com token revogável",async()=>{
    const c=await buildAdminTestApp();
    try{
      const headers={cookie:await c.login()};
      const token=(await c.app.inject({method:"POST",url:"/admin/api/business/studio/integration-token",headers})).json().token as string;
      const auth={authorization:"Bearer "+token};
      const invalid=await c.app.inject({method:"POST",url:"/admin/integrations/commerce/v1/sync",headers:auth,
        payload:{products:[{id:"X",name:"Peça X",sku:"X",price:"5",stock:2}],
          orders:[{id:"1",number:"1",financialStatus:"paid",fulfillmentStatus:"pending",total:"5",createdAt:"2026-11-12T12:00:00Z",phone:"+5516999999999"}]}});
      expect(invalid.statusCode).toBe(422);
      const catalog=(await c.app.inject({method:"GET",url:"/admin/api/business/studio/catalog",headers})).json();
      expect(catalog.items).toHaveLength(0);
      expect(catalog.orders).toHaveLength(0);
    }finally{await c.close();}
  });
  it("restaura versões de regras sem afetar o estoque ou as credenciais",async()=>{
    const c=await buildAdminTestApp();
    try{
      const headers={cookie:await c.login()};
      const original={name:"Primeira",match:"equals",trigger:"bom dia",action:"reply",response:"Bom dia!",enabled:true,priority:1,options:[]};
      await c.app.inject({method:"PUT",url:"/admin/api/business/studio/rules-draft",headers,payload:{items:[original]}});
      await c.app.inject({method:"POST",url:"/admin/api/business/studio/simulate",headers,payload:{message:"bom dia",allowExternal:false}});
      expect((await c.app.inject({method:"POST",url:"/admin/api/business/studio/rules-publish",headers})).statusCode).toBe(200);
      const hist=(await c.app.inject({method:"GET",url:"/admin/api/business/studio",headers})).json().history as Array<{kind:string;revision:number;name:string}>;
      const baseline=hist.find(item=>item.kind==="rules"&&item.name==="Regras: 0 itens");
      expect(baseline).toBeDefined();
      const restored=await c.app.inject({method:"POST",url:"/admin/api/business/studio/rollback",headers,payload:{revision:baseline!.revision,kind:"rules"}});
      expect(restored.statusCode).toBe(200);
      expect((await c.app.inject({method:"GET",url:"/admin/api/automations/rules",headers})).json().items).toHaveLength(0);
    }finally{await c.close();}
  });
  it("diagnóstico de regras locais não usa rede nem custa créditos",async()=>{
    const c=await buildAdminTestApp();
    try{
      const headers={cookie:await c.login()};
      const response=await c.app.inject({method:"POST",url:"/admin/api/business/studio/ai-diagnostics",headers,payload:{allowExternal:false}});
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ok:true,provider:"rules",charged:false});
    }finally{await c.close();}
  });
  it("simula regra em rascunho antes de ativar e protege a produção até publicação",async()=>{
    const c=await buildAdminTestApp();
    try{
      const headers={cookie:await c.login()};
      const rule={name:"Saudação",match:"equals",trigger:"oi",action:"reply",response:"Olá da regra nova",enabled:true,priority:100,options:[]};
      const draft=await c.app.inject({method:"PUT",url:"/admin/api/business/studio/rules-draft",headers,payload:{items:[rule]}});
      expect(draft.statusCode).toBe(200);
      const before=(await c.app.inject({method:"GET",url:"/admin/api/automations/rules",headers})).json();
      expect(before.items).toHaveLength(0);
      const simulated=await c.app.inject({method:"POST",url:"/admin/api/business/studio/simulate",headers,payload:{message:"oi",allowExternal:false}});
      expect(simulated.json().reply).toContain("Olá da regra nova");
      expect(simulated.json().sent).toBe(false);
      expect((await c.app.inject({method:"POST",url:"/admin/api/business/studio/rules-publish",headers})).statusCode).toBe(200);
      const after=(await c.app.inject({method:"GET",url:"/admin/api/automations/rules",headers})).json();
      expect(after.items).toHaveLength(1);
      expect(after.items[0].name).toBe("Saudação");
    }finally{await c.close();}
  });
});
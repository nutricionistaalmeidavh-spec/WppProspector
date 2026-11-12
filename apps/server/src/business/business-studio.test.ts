import { describe, expect, it } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { buildAdminTestApp } from "../management/test-support/admin-test-app.ts";
import { BusinessAiStore, validateCompatibleEndpoint } from "./business-ai-store.ts";
import { BusinessStudioStore } from "./business-studio-store.ts";

const profile = {
  name:"Loja de Exemplo", segment:"varejo", description:"Loja teste",
  openingHours:"9 às 18h", paymentMethods:"Pix", deliveryPolicy:"3 dias", returnPolicy:"7 dias",
  additionalInstructions:"",products:[{name:"Tênis Verde",price:"R$ 90",description:"Esportivo"}],
  faq:[{question:"Tem estacionamento?",answer:"Sim"}],
};
describe("Business Studio P0–P2",()=>{
  it("não altera perfil publicado ao salvar rascunho, simula sem envio e só aplica na publicação",async()=>{
    const ctx=await buildAdminTestApp();
    try{
      const cookie=await ctx.login(), headers={cookie};
      expect((await ctx.app.inject({method:"GET",url:"/admin/api/business/studio",headers})).json().draft.published).toBe(true);
      const save=await ctx.app.inject({method:"PUT",url:"/admin/api/business/studio/draft",headers,payload:profile});
      expect(save.statusCode).toBe(200);
      const store=new BusinessAiStore(ctx.db,"f".repeat(64));
      expect(store.getBusiness().name).toBe("");
      const trial=await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/simulate",
        headers,payload:{message:"Quanto custa o Tênis Verde?",allowExternal:false}});
      expect(trial.statusCode).toBe(200);
      expect(trial.json().reply).toContain("R$ 90");
      expect(trial.json().sent).toBe(false);
      expect(trial.json().charged).toBe(false);
      expect(ctx.sendText.calls).toHaveLength(0);
      const published=await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/publish",headers});
      expect(published.statusCode).toBe(200);
      expect(store.getBusiness().name).toBe("Loja de Exemplo");
      const history=(await ctx.app.inject({method:"GET",url:"/admin/api/business/studio",headers})).json().history;
      expect(history).toHaveLength(1);
      expect(history[0].name).toBe("Loja de Exemplo");
    }finally{await ctx.close();}
  });
  it("mantém IA paga desativada até publicação, mesmo com a chave gravada",async()=>{
    const ctx=await buildAdminTestApp();
    try{
      const cookie=await ctx.login(),headers={cookie},store=new BusinessAiStore(ctx.db,"f".repeat(64));
      const staged=await ctx.app.inject({method:"PUT",url:"/admin/api/business/studio/ai-draft",headers,
        payload:{provider:"openai",model:"gpt-4.1-mini",apiKey:"test-private-key"}});
      expect(staged.statusCode).toBe(200);
      expect(store.getAi().provider).toBe("rules");
      expect(JSON.stringify(staged.json())).not.toContain("test-private-key");
      const simulated=await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/simulate",
        headers,payload:{message:"Olá",allowExternal:false}});
      expect(simulated.json().provider).toBe("rules");
      expect(simulated.json().charged).toBe(false);
      const publish=await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/ai-publish",headers});
      expect(publish.statusCode).toBe(200);
      expect(store.getAi().provider).toBe("openai");
      expect(store.getActiveAi().apiKey).toBe("test-private-key");
    }finally{await ctx.close();}
  });
  it("registra novas versões e restaura uma versão anterior",async()=>{
    const ctx=await buildAdminTestApp();
    try{
      const cookie=await ctx.login(),headers={cookie};
      const v1={...profile,name:"Empresa original"};
      await ctx.app.inject({method:"PUT",url:"/admin/api/business/studio/draft",headers,payload:v1});
      await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/publish",headers});
      await ctx.app.inject({method:"PUT",url:"/admin/api/business/studio/draft",headers,payload:{...profile,name:"Empresa nova"}});
      await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/publish",headers});
      const rollback=await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/rollback",headers,payload:{revision:1}});
      expect(rollback.statusCode).toBe(200);
      expect(new BusinessAiStore(ctx.db).getBusiness().name).toBe("Empresa original");
    }finally{await ctx.close();}
  });
  it("importa itens sem acessar pedidos alheios e exige ativação explícita da fonte",async()=>{
    const ctx=await buildAdminTestApp();
    try{
      const cookie=await ctx.login(),headers={cookie};
      const item={id:"TENIS-01",name:"Tênis Verde",sku:"T01",price:"90",stock:5};
      const result=await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/catalog/import",headers,payload:{items:[item]}});
      expect(result.statusCode).toBe(200);
      const studio=new BusinessStudioStore(ctx.db,new BusinessAiStore(ctx.db));
      expect(studio.activeCommerceContext()).toBe("");
      expect((await ctx.app.inject({method:"PUT",url:"/admin/api/business/studio/catalog/enabled",headers,payload:{enabled:true}})).statusCode).toBe(200);
      expect(studio.activeCommerceContext()).toContain("Saldo 5");
      expect(studio.activeCommerceContext()).not.toContain("PEDIDO");
    }finally{await ctx.close();}
  });
  it("rejeita URLs self-hosted inseguras e mantém o modelo próprio independente de APIs pagas",()=>{
    expect(()=>validateCompatibleEndpoint("http://10.0.0.10:8000/v1/chat/completions")).toThrow();
    expect(()=>validateCompatibleEndpoint("https://example.com@127.0.0.1/v1/chat/completions")).toThrow();
    expect(validateCompatibleEndpoint("http://127.0.0.1:8000/v1/chat/completions")).toBe("http://127.0.0.1:8000/v1/chat/completions");
    const db=openDatabase(":memory:");
    try{
      const store=new BusinessAiStore(db,"f".repeat(64));
      store.stageAi({provider:"compatible",model:"modelo-proprio",endpoint:"http://127.0.0.1:8000/v1/chat/completions"});
      expect(store.getAi().provider).toBe("rules");
      store.publishAi();
      expect(store.getActiveAi().provider).toBe("compatible");
      expect(store.getActiveAi().apiKey).toBeUndefined();
    }finally{db.close();}
  });
  it("não altera credencial nem endpoint já ativos enquanto rascunho não for publicado",()=>{
    const db=openDatabase(":memory:");
    try{
      const store=new BusinessAiStore(db,"f".repeat(64));
      store.saveAi({provider:"openai",model:"gpt-4.1-mini",apiKey:"active-old"});
      store.stageAi({provider:"openai",model:"gpt-4.1-mini",apiKey:"pending-new"});
      expect(store.getActiveAi().apiKey).toBe("active-old");
      expect(store.getPreviewAi().apiKey).toBe("pending-new");
      store.publishAi();
      expect(store.getActiveAi().apiKey).toBe("pending-new");
      store.saveAi({provider:"compatible",model:"live",endpoint:"http://127.0.0.1:8000/v1/chat/completions"});
      store.stageAi({provider:"compatible",model:"draft",endpoint:"http://127.0.0.1:8001/v1/chat/completions"});
      expect(store.getActiveAi().endpoint).toBe("http://127.0.0.1:8000/v1/chat/completions");
      store.publishAi();
      expect(store.getActiveAi().endpoint).toBe("http://127.0.0.1:8001/v1/chat/completions");
    }finally{db.close();}
  });
  it("sincroniza somente quando solicitado e nunca devolve o token Shopify",async()=>{
    const db=openDatabase(":memory:");
    try{
      const ai=new BusinessAiStore(db,"f".repeat(64));
      const saved=ai.saveShopifyConnection({domain:"loja-teste.myshopify.com",token:"secret-test-token"});
      expect(JSON.stringify(saved)).not.toContain("secret-test-token");
      let called=0;
      const stub:typeof fetch=async(url,init)=>{
        expect(String(url)).toBe("https://loja-teste.myshopify.com/admin/api/2026-10/graphql.json");
        expect(new Headers(init?.headers).get("X-Shopify-Access-Token")).toBe("secret-test-token");
        called++;
        const data=called===1?{products:{edges:[{node:{id:"product-1",title:"Produto",variants:{edges:[{node:{id:"var-1",sku:"SKU-1",price:"90",inventoryQuantity:6}}]}}}]}}:
          {orders:{edges:[{node:{id:"order-1",name:"#1001",displayFinancialStatus:"PAID",displayFulfillmentStatus:"UNFULFILLED",createdAt:"2026-11-01T00:00:00Z",totalPriceSet:{shopMoney:{amount:"90",currencyCode:"BRL"}}}}]}};
        return new Response(JSON.stringify({data}),{status:200,headers:{"content-type":"application/json"}});
      };
      const studio=new BusinessStudioStore(db,ai,stub);
      expect(called).toBe(0);
      const synced=await studio.syncShopify();
      expect(synced).toMatchObject({products:1,orders:1});
      expect(called).toBe(2);
      expect(studio.commerceStatus().enabled).toBe(false);
      expect(studio.getOrders()[0]?.number).toBe("#1001");
      expect(JSON.stringify(ai.getShopifyConnection())).not.toContain("secret-test-token");
    }finally{db.close();}
  });
  it("exige autenticação para acessar configurações e sincronizações",async()=>{
    const ctx=await buildAdminTestApp();
    try{
      for(const route of ["/admin/api/business/studio","/admin/api/business/studio/catalog"]){
        expect((await ctx.app.inject({method:"GET",url:route})).statusCode).toBe(401);
      }
      expect((await ctx.app.inject({method:"POST",url:"/admin/api/business/studio/shopify/sync"})).statusCode).toBe(401);
    }finally{await ctx.close();}
  });
});

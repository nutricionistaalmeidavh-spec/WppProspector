import { describe, expect, it } from "vitest";
import { buildAdminTestApp } from "../management/test-support/admin-test-app.ts";
import { LocalRulesLlmClient } from "../conversation-engine/infrastructure/llm/local-rules-llm-client.ts";
import { BusinessAiStore } from "./business-ai-store.ts";

const profile = {
  name:"Loja Teste", segment:"calçados", description:"Tênis e acessórios",
  openingHours:"Seg a sex 9h às 18h", paymentMethods:"Pix",
  deliveryPolicy:"Entrega em 5 dias", returnPolicy:"Trocas em 7 dias",
  additionalInstructions:"", products:[{name:"Tênis Verde",price:"R$ 90",description:"Modelo leve"}],
  faq:[{question:"Vocês têm estacionamento?",answer:"Sim, estacionamento próprio."}],
};
describe("API da loja / BYOK", () => {
  it("bloqueia usuários sem sessão para leitura e escrita", async () => {
    const ctx=await buildAdminTestApp();
    try {
      expect((await ctx.app.inject({method:"GET",url:"/admin/api/business/profile"})).statusCode).toBe(401);
      expect((await ctx.app.inject({method:"PUT",url:"/admin/api/business/ai",payload:{provider:"rules",model:""}})).statusCode).toBe(401);
    }finally{await ctx.close();}
  });
  it("persiste o cadastro e não devolve a API key cifrada ao frontend", async () => {
    const ctx=await buildAdminTestApp();
    try {
      const cookie=await ctx.login();
      const put=await ctx.app.inject({method:"PUT",url:"/admin/api/business/profile",
        headers:{cookie},payload:profile});
      expect(put.statusCode).toBe(200);
      const get=await ctx.app.inject({method:"GET",url:"/admin/api/business/profile",headers:{cookie}});
      expect(get.json().name).toBe("Loja Teste");
      const putAi=await ctx.app.inject({method:"PUT",url:"/admin/api/business/ai",
        headers:{cookie},payload:{provider:"anthropic",model:"claude-sonnet-4-5",apiKey:"sk-not-real-private-secret"}});
      expect(putAi.statusCode).toBe(200);
      expect(JSON.stringify(putAi.json())).not.toContain("sk-not-real-private-secret");
      const getAi=await ctx.app.inject({method:"GET",url:"/admin/api/business/ai",headers:{cookie}});
      expect(getAi.json().hasApiKey).toBe(true);
      expect(JSON.stringify(getAi.json())).not.toContain("sk-not-real-private-secret");
      const db=new BusinessAiStore(ctx.db,"f".repeat(64));
      expect(db.getActiveAi().apiKey).toBe("sk-not-real-private-secret");
      const reply=await new LocalRulesLlmClient(()=>db.getBusiness()).generate({
        system:"",messages:[{role:"user",content:"Quanto custa o Tênis Verde?"}],
        maxTokens:100,model:"local-rules",
      });
      expect(reply.text).toContain("R$ 90");
    }finally{await ctx.close();}
  });
});

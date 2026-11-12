import {describe,expect,it} from "vitest";
import {openDatabase} from "../shared/persistence/sqlite/open-database.ts";
import {BusinessAiStore} from "./business-ai-store.ts";
import {AutomationStore} from "../automation/automation-store.ts";
import {BusinessStudioStore} from "./business-studio-store.ts";

describe("P2 recuperação léxica local FTS5",()=>{
  it("encontra item importado com acento e pergunta natural sem provedores externos",()=>{
    const db=openDatabase(":memory:");
    try{
      const store=new BusinessStudioStore(db,new BusinessAiStore(db));
      store.importCatalog([{id:"T-03",name:"Tênis de Corrida Azul",sku:"CORRIDA-03",price:"150",stock:4}]);
      expect(store.searchCatalog("Você tem TENIS de corrida?",5)).toEqual([]);
      store.enableCatalog(true);
      expect(store.searchCatalog("Você tem TENIS de corrida?",5)[0]).toMatchObject({name:"Tênis de Corrida Azul",stock:4});
      expect(store.searchCatalog("CORRIDA-03",5)[0]?.sku).toBe("CORRIDA-03");
      expect(store.searchCatalog("produto inexistente",5)).toEqual([]);
      store.importCatalog([{id:"T-03",name:"Tênis de Corrida Verde",sku:"CORRIDA-03",price:"180",stock:0}]);
      expect(store.searchCatalog("verde",5)[0]).toMatchObject({price:"180",stock:0});
    }finally{db.close();}
  });
  it("avalia eventos de saldo alterado sem enviar mensagens",()=>{
    const db=openDatabase(":memory:");
    try{
      const ai=new BusinessAiStore(db),studio=new BusinessStudioStore(db,ai);
      const automation=new AutomationStore(db);
      automation.saveRule({name:"Atenção estoque",eventType:"commerce.inventory_updated",
        match:"equals",trigger:"",action:"handoff",response:"Revisar saldo",enabled:true,priority:1,
        conditions:{match:"all",conditions:[{field:"commerce.stock",op:"equals",value:"0"}]}});
      studio.importCatalog([{id:"qa01",name:"Produto QA",sku:"QA01",price:"10",stock:2}]);
      studio.enableCatalog(true);
      studio.importCatalog([{id:"qa01",name:"Produto QA",sku:"QA01",price:"10",stock:0}]);
      expect(automation.recentExecutions()).toHaveLength(1);
      expect(automation.recentExecutions()[0]?.eventType).toBe("commerce.inventory_updated");
    }finally{db.close();}
  });
});

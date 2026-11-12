import {describe,expect,it} from "vitest";
import {openDatabase} from "../shared/persistence/sqlite/open-database.ts";
import {BusinessAiStore} from "./business-ai-store.ts";
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
});

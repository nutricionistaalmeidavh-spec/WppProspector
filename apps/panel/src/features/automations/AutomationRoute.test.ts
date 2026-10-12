import { describe,expect,it } from "vitest";
import { parseMenuOptions } from "./AutomationRoute";

describe("parseMenuOptions",()=>{
  it("constrói opções de menu a partir de linhas editáveis",()=>{
    expect(parseMenuOptions("1|Suporte|Como podemos ajudar?|não\n2|Atendente|Encaminhando|sim")).toEqual([
      {key:"1",label:"Suporte",response:"Como podemos ajudar?",handoff:false},
      {key:"2",label:"Atendente",response:"Encaminhando",handoff:true},
    ]);
  });
  it("rejeita opções sem resposta",()=>{expect(()=>parseMenuOptions("1|Suporte")).toThrow();});
});

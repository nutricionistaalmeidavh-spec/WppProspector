import { describe, expect, it, vi } from "vitest";
import { LocalSemanticCatalogSearch } from "./local-semantic-catalog.ts";

const embed = (text: string): number[] => {
  const lower=text.toLowerCase();
  if(lower.includes("calçado infantil") || lower.includes("tenis crianca") || lower.includes("tênis criança"))return [1,0];
  if(lower.includes("tênis para criança"))return [1,0.01];
  if(lower.includes("sapato infantil"))return [0.99,0.02];
  if(lower.includes("notebook"))return [0,1];
  return [0.1,0.1];
};
const mockFetch=vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
  const body=JSON.parse(String(init?.body)) as {input:string[]};
  return new Response(JSON.stringify({data:body.input.map((text,index)=>({index,embedding:embed(text)}))}),{status:200});
});
const item=(name:string)=>({name,sku:name,price:"R$ 50",stock:2,syncedAt:"2026-11-12T00:00:00Z"});

describe("busca semântica local opt-in", () => {
  it("desligada não chama rede e preserva o núcleo R$0", async()=>{
    mockFetch.mockClear();
    const search=new LocalSemanticCatalogSearch(()=>({enabled:false,endpoint:"",model:""}),()=>[item("Tênis para criança")],mockFetch as typeof fetch);
    expect(await search.search("calçado infantil")).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
  it("recupera um produto canônico por proximidade vetorial quando o modelo próprio foi ativado", async()=>{
    const search=new LocalSemanticCatalogSearch(()=>({enabled:true,endpoint:"http://127.0.0.1:8080/v1/embeddings",model:"teste-local"}),()=>[item("Notebook"),item("Tênis para criança")],mockFetch as typeof fetch);
    expect(await search.search("calçado infantil")).toEqual([item("Tênis para criança")]);
  });
  it("não adivinha em empate entre produtos semelhantes", async()=>{
    const search=new LocalSemanticCatalogSearch(()=>({enabled:true,endpoint:"http://127.0.0.1:8080/v1/embeddings",model:"teste-local"}),()=>[item("Sapato infantil"),item("Tênis para criança")],mockFetch as typeof fetch);
    expect(await search.search("calçado infantil")).toEqual([]);
  });
  it("falha fechada quando o endpoint está indisponível", async()=>{
    const broken=vi.fn(async()=>{throw new Error("indisponível");}) as unknown as typeof fetch;
    const search=new LocalSemanticCatalogSearch(()=>({enabled:true,endpoint:"http://127.0.0.1:8080/v1/embeddings",model:"teste-local"}),()=>[item("Tênis para criança")],broken);
    await expect(search.search("calçado infantil")).resolves.toEqual([]);
  });
});

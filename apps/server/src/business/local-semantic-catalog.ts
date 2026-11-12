import type { LocalCatalogItem } from "../conversation-engine/infrastructure/llm/local-rules-llm-client.ts";
import { validateSemanticEndpoint, type SemanticSearchSettings } from "./business-ai-store.ts";

/** Opt-in: embeddings enviados SOMENTE ao endpoint configurado explicitamente pelo lojista.
 * Vetores mantidos na memória da instalação; produtos e preços vêm do catálogo canônico.
 * Se o servidor de embeddings falhar, a busca FTS5/regras segue disponível.
 */
export class LocalSemanticCatalogSearch {
  private cacheKey = "";
  private cacheVectors: number[][] = [];
  constructor(
    private readonly settings: () => SemanticSearchSettings,
    private readonly catalog: () => readonly LocalCatalogItem[],
    private readonly requestFetch: typeof fetch = fetch,
  ) {}

  async search(question: string): Promise<readonly LocalCatalogItem[]> {
    const config=this.settings();
    if (!config.enabled || !question.trim()) return [];
    const items=this.catalog().slice(0,500);
    if (!items.length) return [];
    try {
      const endpoint=validateSemanticEndpoint(config.endpoint);
      const key=JSON.stringify([endpoint,config.model,items.map(p=>[p.name,p.sku,p.syncedAt])]);
      let vectors=this.cacheVectors;
      if (key!==this.cacheKey) {
        vectors=await this.embed(items.map(p=>[p.name,p.sku].filter(Boolean).join(" ")),endpoint,config.model);
        this.cacheVectors=vectors;
        this.cacheKey=key;
      }
      const [queryVector]=await this.embed([question],endpoint,config.model);
      if (!queryVector || vectors.length!==items.length) return [];
      const ranked=items.map((item,index)=>({item,score:cosine(queryVector,vectors[index]??[])}))
        .sort((a,b)=>b.score-a.score);
      const first=ranked[0],second=ranked[1];
      // Margem de segurança: não vincular um produto por uma similaridade ambígua.
      if (!first || first.score < 0.85 || (second && first.score-second.score<0.08))return [];
      return [first.item];
    } catch {
      // Sem fallback externo e sem expor perguntas de clientes em logs.
      return [];
    }
  }

  private async embed(texts:string[],endpoint:string,model:string):Promise<number[][]> {
    const response=await this.requestFetch(endpoint,{
      method:"POST",redirect:"error",headers:{"content-type":"application/json"},
      body:JSON.stringify({model,input:texts}),signal:AbortSignal.timeout(5000),
    });
    if(!response.ok)throw new Error("Modelo local indisponível");
    const body=await response.json() as {data?:Array<{index:number;embedding:number[]}>};
    if(!Array.isArray(body.data) || body.data.length!==texts.length)throw new Error("Resposta inválida de embeddings");
    const ordered=[...body.data].sort((a,b)=>a.index-b.index);
    const size=ordered[0]?.embedding?.length??0;
    if(size===0 || size>8192 || ordered.some((row,i)=>row.index!==i ||
      !Array.isArray(row.embedding) || row.embedding.length!==size ||
      row.embedding.some(value=>typeof value!=="number" || !Number.isFinite(value))))
      throw new Error("Vetor de embeddings inválido");
    return ordered.map(row=>row.embedding);
  }
}

function cosine(a:readonly number[],b:readonly number[]):number {
  if(a.length===0 || a.length!==b.length)return 0;
  let dot=0,aa=0,bb=0;
  for(let i=0;i<a.length;i++){const x=a[i]??0,y=b[i]??0;dot+=x*y;aa+=x*x;bb+=y*y;}
  return aa && bb ? dot/Math.sqrt(aa*bb) : 0;
}

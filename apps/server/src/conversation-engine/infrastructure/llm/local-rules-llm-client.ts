import type { LlmClientPort, LlmRequest, LlmResponse } from "../../application/ports/llm-client.port.ts";
import type { BusinessProfile } from "../../../business/business-ai-store.ts";
import { localExtraction } from "../knowledge/signal-extraction.ts";
import { classifyLocalIntent } from "./local-intent.pt-br.ts";

const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const fallback="Vou confirmar essa informação com nossa equipe para não passar dados incorretos.";

/** Levenshtein <=1 evita dependência externa e mantém correspondência conservadora. */
function nearToken(a:string,b:string):boolean {
  if(a===b)return true;
  if(Math.min(a.length,b.length)<4||Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,edits=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++edits>1)return false;
    if(a.length>b.length)i++;
    else if(b.length>a.length)j++;
    else {i++;j++;}
  }
  return edits+(a.length-i)+(b.length-j)<=1;
}

/** Respostas e preços usam SOMENTE o cadastro canônico desta instalação. */
export type LocalCatalogItem={name:string;sku:string;price:string;stock:number|null;syncedAt:string};
export class LocalRulesLlmClient implements LlmClientPort {
  constructor(private readonly business:()=>BusinessProfile|undefined=()=>undefined,
    private readonly catalog:()=>readonly LocalCatalogItem[]=()=>[],
    private readonly search:(question:string)=>readonly LocalCatalogItem[]=()=>[]) {}

  async generate(request:LlmRequest):Promise<LlmResponse> {
    // Não usar a menção de produtos no histórico anterior para responder ao turno atual.
    const user=request.messages.filter(item=>item.role==="user").at(-1)?.content.trim()??"";
    const normalized=normalize(user);
    const isExtraction=request.responseSchema!==undefined &&
      Object.prototype.hasOwnProperty.call((request.responseSchema.properties as Record<string,unknown>|undefined)??{},"temas");
    let value:unknown;
    if(isExtraction) {
      value=localExtraction([user],{});
    } else {
      const company=this.business();
      const classification=classifyLocalIntent(user);
      const questionPrice=classification.topic==="price"||/\b(catalogo|produto)\b/.test(normalized);
      const asksStock=classification.topic==="stock"||/\b(estoque|disponivel|disponibilidade|quantidade)\b/.test(normalized);
      const terms=new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
      const matches=(candidate:string)=>{
        const words=normalize(candidate).split(/[^a-z0-9]+/).filter(Boolean);
        return words.length>0 && words.every(word=>[...terms].some(term=>nearToken(word,term))) &&
          (words.length>1||(words[0]?.length??0)>=5);
      };
      const directMatches=this.catalog().filter(p=>matches(p.name)||(p.sku&&terms.has(normalize(p.sku))));
      const indexed=this.search(user);
      const profileMatches=company?.products.filter(p=>matches(p.name))??[];
      // Jamais selecionar uma variante arbitrária quando várias correspondem.
      const commerceProduct=directMatches.length===1?directMatches[0]:
        directMatches.length>1?undefined:indexed.length===1?indexed[0]:
        undefined;
      const product=commerceProduct??(profileMatches.length===1?profileMatches[0]:undefined);
      const knownFaq=company?.faq.find(x=>matches(x.question));
      let answer="";
      let unknown=false;
      if(classification.topic!=="support"&&classification.topic!=="human"&&classification.intent!=="opt_out") {
        if(knownFaq) answer=knownFaq.answer;
        else if(product){
          answer=[product.name,"description" in product ? product.description : "",
            product.price ? "Preço: "+product.price : ""].filter(Boolean).join(" — ");
          if(asksStock){
            const stock=commerceProduct?.stock;
            answer+=stock==null?" — Estoque não confirmado; consulte nossa equipe.":
              " — Saldo da última sincronização: "+stock+" unidade(s). Confirme disponibilidade com nossa equipe.";
            unknown=true;
          }
        }
        else if(classification.topic==="hours")answer=company?.openingHours??"";
        else if(classification.topic==="delivery")answer=company?.deliveryPolicy??"";
        else if(/\b(troca|devolucao|devolver|garantia)\b/.test(normalized))answer=company?.returnPolicy??"";
        else if(classification.topic==="payment")answer=company?.paymentMethods??"";
        else if(/\b(empresa|loja|voces fazem|servicos|o que vendem)\b/.test(normalized))
          answer=[company?.name,company?.description].filter(Boolean).join(" — ");
        if(!answer&&(questionPrice||asksStock||["hours","delivery","payment"].includes(classification.topic)||
          /\b(troca|devolucao|devolver|garantia)\b/.test(normalized))){
          unknown=true;answer=fallback;
        }
      }
      const replyMessages=classification.intent==="opt_out"?[]:
        classification.topic==="human"?["Vou encaminhar seu atendimento a uma pessoa da equipe."]:
        classification.topic==="support"?["Vou encaminhar sua solicitação de suporte a uma pessoa da equipe."]:
        classification.intent==="not_interested"?["Entendido. Caso precise de informações no futuro, seguimos à disposição."]:
        classification.intent==="off_topic"?["Posso ajudar com informações sobre produtos, pedidos e atendimento da loja."]:
        answer?[answer]:
        classification.intent==="interested"?["Obrigado pelo interesse. Vou encaminhar sua solicitação para atendimento."]:
        [company?.name?"Olá! Você está falando com "+company.name+". Como posso ajudar?":
          "Olá! Posso ajudar com informações sobre nossos serviços. O que você gostaria de saber?"];
      value={
        replyMessages,endConversation:classification.intent==="opt_out",leadIntent:classification.intent,
        leadQualification:classification.intent==="interested"?"warm":null,
        handoffToHuman:classification.handoff||unknown,
        reasoning:"Classificação PT-BR e resposta determinística com cadastro comercial local.",
        recommendedModules:[],interestedModules:[],quotedPlan:null,
      };
    }
    return {text:JSON.stringify(value),usage:{
      model:"local-rules",inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,
    }};
  }
}

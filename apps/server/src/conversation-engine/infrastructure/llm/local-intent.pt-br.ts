import { optOutRequested } from "../../../whatsapp-connectivity/infrastructure/persistence/sqlite-consent-store.ts";

export type LocalTopic = "opt_out"|"human"|"support"|"rejection"|"delivery"|"price"|"stock"|"purchase"|"hours"|"payment"|"off_topic"|"unknown"|"general";
export type LocalIntent = "interested"|"not_interested"|"needs_more_info"|"opt_out"|"off_topic"|"unknown";
export interface LocalClassification { intent:LocalIntent; topic:LocalTopic; handoff:boolean }

const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");

/** Classificação PT-BR determinística e sem rede; não lê contexto de outra empresa. */
export function classifyLocalIntent(message:string):LocalClassification {
  const text=normalize(message);
  if(!text)return {intent:"unknown",topic:"unknown",handoff:false};
  if(optOutRequested(message))return {intent:"opt_out",topic:"opt_out",handoff:false};
  if(/\b(humano|atendente|pessoa real|falar com (uma pessoa|alguem)|atendimento humano)\b/.test(text))
    return {intent:"needs_more_info",topic:"human",handoff:true};
  if(/\b(suporte|defeito|problema|reclamacao|reclamar|assistencia|cancelar (meu |minha |o |a )?(pedido|compra|assinatura)|reembolso)\b/.test(text))
    return {intent:"needs_more_info",topic:"support",handoff:true};
  if(/\b(nao vou comprar|nao quero comprar|nao quero contratar|sem interesse em comprar|desisti da compra)\b/.test(text))
    return {intent:"not_interested",topic:"rejection",handoff:false};
  if(/\b(frete|entrega|entregam|prazo de entrega|envio|transportadora)\b/.test(text))
    return {intent:"needs_more_info",topic:"delivery",handoff:false};
  if(/\b(preco|precos|precinho|valor|valores|quanto custa|quanto custam|orcamento|cotacao|catalogo)\b/.test(text))
    return {intent:"needs_more_info",topic:"price",handoff:false};
  if(/\b(estoque|disponibilidade|disponivel|disponiveis|quantidade|tem em estoque)\b/.test(text))
    return {intent:"needs_more_info",topic:"stock",handoff:false};
  if(/\b(quero (comprar|contratar|adquirir)|vou comprar|vou contratar|tenho interesse|fechar negocio|fazer pedido)\b/.test(text))
    return {intent:"interested",topic:"purchase",handoff:true};
  if(/\b(horario|horarios|abre|aberto|funcionamento|fecha|atende hoje)\b/.test(text))
    return {intent:"needs_more_info",topic:"hours",handoff:false};
  if(/\b(pagamento|pagamentos|pix|cartao|parcela|parcelamento|boleto)\b/.test(text))
    return {intent:"needs_more_info",topic:"payment",handoff:false};
  if(/\b(piadas?|previsao do tempo|futebol|resultado do jogo|horoscopo)\b/.test(text))
    return {intent:"off_topic",topic:"off_topic",handoff:false};
  return {intent:"needs_more_info",topic:"general",handoff:false};
}

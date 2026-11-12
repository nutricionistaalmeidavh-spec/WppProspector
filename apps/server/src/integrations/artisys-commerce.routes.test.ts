import {describe,it,expect} from 'vitest';
import Fastify from 'fastify';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHmac} from 'node:crypto';
import {registerArtisysCommerceInboundRoutes,listArtisysCommerceSales} from './artisys-commerce.routes.ts';

const secret='test-inbound-secret-with-at-least-32-characters';
async function fixture(){
  const db=new DatabaseSync(':memory:');
  const app=Fastify();
  await app.register(registerArtisysCommerceInboundRoutes,{db,secret});
  await app.ready();
  return {db,app,close:async()=>{await app.close();db.close()}};
}
function signed(payload:unknown){
  const raw=JSON.stringify(payload),ts=String(Date.now());
  return {method:'POST' as const,url:'/api/integrations/artisys-commerce',
    headers:{'content-type':'application/json','x-artisys-timestamp':ts,
      'x-artisys-signature':'sha256='+createHmac('sha256',secret).update(ts+'.'+raw).digest('hex')},
    payload:raw};
}
const event=(id=randomUUID(),name='crm.sale')=>({
  event:name,deliveryId:id,payload:{source:'shopify',externalOrderId:'order-12',
    email:'buyer@example.com',buyerName:'Cliente Exemplo',skus:['ARTISYS-PDV-NEXUS']}
});
describe('ArtiSys Commerce -> CRM canônico',()=>{
  it('rejeita assinatura inválida sem registrar dado',async()=>{
    const {app,db,close}=await fixture();
    try{
      const opts=signed(event());
      opts.headers['x-artisys-signature']='sha256=bad';
      const result=await app.inject(opts);
      expect(result.statusCode).toBe(401);
      expect(listArtisysCommerceSales(db)).toEqual([]);
    }finally{await close()}
  });
  it('armazena venda externa idempotente, sem alterar leads nem conversas',async()=>{
    const {app,db,close}=await fixture();
    try{
      const payload=event();
      expect((await app.inject(signed(payload))).statusCode).toBe(200);
      expect((await app.inject(signed(payload))).json()).toMatchObject({accepted:true,duplicate:true});
      const sales=listArtisysCommerceSales(db);
      expect(sales).toHaveLength(1);
      expect(sales[0]).toMatchObject({source:'shopify',externalOrderId:'order-12',
        email:'buyer@example.com',status:'paid',skus:['ARTISYS-PDV-NEXUS']});
      const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>String(r.name));
      expect(tables).not.toContain('leads');
      expect(tables).not.toContain('crm_customers');
    }finally{await close()}
  });
  it('revogação antes da venda não pode ser revertida por chegada atrasada',async()=>{
    const {app,db,close}=await fixture();
    try{
      expect((await app.inject(signed(event(randomUUID(),'crm.sale_revoked')))).statusCode).toBe(200);
      expect((await app.inject(signed(event(randomUUID(),'crm.sale')))).statusCode).toBe(200);
      expect(listArtisysCommerceSales(db)[0]?.status).toBe('revoked');
    }finally{await close()}
  });
});

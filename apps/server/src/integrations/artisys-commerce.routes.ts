import type {FastifyPluginAsync} from 'fastify';
import type {DatabaseSync} from 'node:sqlite';
import {createHmac,timingSafeEqual} from 'node:crypto';

type CommerceInboundOptions={db:DatabaseSync;secret:string};
type Row={source:string;external_order_id:string;email:string;buyer_name:string;skus_json:string;status:string;updated_at:string};
const allowed=new Set(['shopify','mercadolivre','artisys-payments']);
function safe(a:string,b:string){
  const x=Buffer.from(a),y=Buffer.from(b);
  return x.length>0&&x.length===y.length&&timingSafeEqual(x,y);
}
function verify(raw:Buffer,timestamp:string,signature:string,secret:string,now=Date.now()){
  if(!/^\d{13}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300000)return false;
  const digest='sha256='+createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex');
  return safe(signature,digest);
}
function prepare(db:DatabaseSync){
  db.exec("CREATE TABLE IF NOT EXISTS crm_external_sales ("+
    "source TEXT NOT NULL,external_order_id TEXT NOT NULL,email TEXT NOT NULL,buyer_name TEXT NOT NULL DEFAULT '',"+
    "skus_json TEXT NOT NULL DEFAULT '[]',status TEXT NOT NULL,updated_at TEXT NOT NULL,"+
    "PRIMARY KEY(source,external_order_id))");
  db.exec("CREATE TABLE IF NOT EXISTS crm_external_sale_events ("+
    "delivery_id TEXT PRIMARY KEY,source TEXT NOT NULL,external_order_id TEXT NOT NULL,"+
    "event TEXT NOT NULL,created_at TEXT NOT NULL)");
}
export function listArtisysCommerceSales(db:DatabaseSync,limit=100){
  const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='crm_external_sales'").get();
  if(!table)return [];
  return (db.prepare('SELECT source,external_order_id,email,buyer_name,skus_json,status,updated_at FROM crm_external_sales ORDER BY updated_at DESC LIMIT ?')
    .all(Math.max(1,Math.min(200,limit))) as Row[]).map(r=>({
    source:r.source,externalOrderId:r.external_order_id,email:r.email,buyerName:r.buyer_name,
    skus:JSON.parse(r.skus_json) as string[],status:r.status,updatedAt:r.updated_at
  }));
}
export const registerArtisysCommerceInboundRoutes:FastifyPluginAsync<CommerceInboundOptions>=async(app,{db,secret})=>{
  if(secret.length<32)throw Error('ARTISYS_COMMERCE_INBOUND_SECRET must have >=32 characters');
  prepare(db);
  // Restrito a este plugin; outras APIs Fastify continuam com seu parser JSON.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json',{parseAs:'buffer',bodyLimit:65536},(_req,payload,done)=>done(null,payload));
  app.post('/api/integrations/artisys-commerce',async(req,reply)=>{
    const raw=Buffer.isBuffer(req.body)?req.body:null;
    if(!raw)return reply.code(415).send({error:'raw_json_required'});
    const timestamp=String(req.headers['x-artisys-timestamp']||'');
    const signature=String(req.headers['x-artisys-signature']||'');
    if(!verify(raw,timestamp,signature,secret))return reply.code(401).send({error:'invalid_signature'});
    let input:unknown;try{input=JSON.parse(raw.toString('utf8'))}catch{return reply.code(400).send({error:'invalid_json'})}
    if(!input||typeof input!=='object'||Array.isArray(input))return reply.code(422).send({error:'invalid_event'});
    const body=input as Record<string,unknown>,payload=body.payload;
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return reply.code(422).send({error:'invalid_payload'});
    const p=payload as Record<string,unknown>;
    const deliveryId=String(body.deliveryId||''),event=String(body.event||'');
    const source=String(p.source||''),orderId=String(p.externalOrderId||'');
    const email=String(p.email||'').trim().toLowerCase(),name=String(p.buyerName||'').trim();
    if(!/^[a-f0-9-]{36}$/i.test(deliveryId)||!['crm.sale','crm.sale_revoked'].includes(event)||
       !allowed.has(source)||!orderId||orderId.length>120||
       (event==='crm.sale'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))||
       email.length>254||name.length>160)
      return reply.code(422).send({error:'invalid_event'});
    const skus=Array.isArray(p.skus)?p.skus.filter(x=>typeof x==='string'&&/^[A-Z0-9_-]{2,90}$/.test(x)).slice(0,60):[];
    const status=event==='crm.sale'?'paid':'revoked';
    const now=new Date().toISOString();
    db.exec('BEGIN IMMEDIATE');
    try{
      const record=db.prepare('INSERT OR IGNORE INTO crm_external_sale_events(delivery_id,source,external_order_id,event,created_at) VALUES(?,?,?,?,?)')
        .run(deliveryId,source,orderId,event,now);
      if(!record.changes){db.exec('COMMIT');return reply.send({accepted:true,duplicate:true})}
      // Esta projeção NÃO escreve leads.phone, crm_customers, oportunidades nem conversas.
      db.prepare("INSERT INTO crm_external_sales(source,external_order_id,email,buyer_name,skus_json,status,updated_at) "+
        "VALUES(?,?,?,?,?,?,?) ON CONFLICT(source,external_order_id) DO UPDATE SET "+
        "email=CASE WHEN excluded.email!='' THEN excluded.email ELSE crm_external_sales.email END,"+
        "buyer_name=CASE WHEN excluded.buyer_name!='' THEN excluded.buyer_name ELSE crm_external_sales.buyer_name END,"+
        "skus_json=CASE WHEN excluded.status='paid' THEN excluded.skus_json ELSE crm_external_sales.skus_json END,"+
        "status=CASE WHEN crm_external_sales.status='revoked' THEN 'revoked' ELSE excluded.status END,"+
        "updated_at=excluded.updated_at")
        .run(source,orderId,email,name,JSON.stringify(skus),status,now);
      db.exec('COMMIT');return reply.send({accepted:true});
    }catch(error){db.exec('ROLLBACK');req.log.error({err:error},'Commerce CRM projection failed');return reply.code(500).send({error:'storage_failed'})}
  });
};

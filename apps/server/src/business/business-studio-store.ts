import type { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import { AutomationStore, ruleInputSchema, type RuleInput } from "../automation/automation-store.ts";
import { z } from "zod";
import { businessSchema, type BusinessProfile, type BusinessAiStore } from "./business-ai-store.ts";

const catalogItem = z.object({
  id: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(180),
  sku: z.string().trim().max(120).default(""),
  price: z.string().trim().max(80).default(""),
  stock: z.number().int().min(0).nullable().default(null),
});
export type CatalogItem = z.infer<typeof catalogItem>;
type CommerceProduct = CatalogItem & { source: "manual" | "shopify" | "integration"; syncedAt: string };
const commerceOrder=z.object({
 id:z.string().trim().min(1).max(160),
 number:z.string().trim().min(1).max(100),
 financialStatus:z.string().trim().max(80).default(""),
 fulfillmentStatus:z.string().trim().max(80).default(""),
 total:z.string().trim().max(80).default(""),
 createdAt:z.string().datetime({offset:true}),
}).strict();
const commerceSync=z.object({products:z.array(catalogItem.strict()).max(2500),orders:z.array(commerceOrder).max(300)}).strict();
const normalizeRuleText=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim().replace(/\s+/g," ");
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");

export class StudioValidationError extends Error {}

export class BusinessStudioStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly ai: BusinessAiStore,
    private readonly requestFetch: typeof fetch = fetch,
  ) {}

  getDraft(): { profile: BusinessProfile; published: boolean; updatedAt: string | null } {
    const row = this.db.prepare("SELECT data_json,updated_at FROM business_profile_draft WHERE id=1").get() as { data_json: string; updated_at: string } | undefined;
    return row
      ? { profile: businessSchema.parse(JSON.parse(row.data_json)), published: false, updatedAt: row.updated_at }
      : { profile: this.ai.getBusiness(), published: true, updatedAt: null };
  }
  saveDraft(input: unknown) {
    const profile = businessSchema.parse(input);
    const updatedAt = new Date().toISOString();
    this.db.prepare("INSERT INTO business_profile_draft(id,data_json,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at")
      .run(JSON.stringify(profile), updatedAt);
    this.db.prepare("DELETE FROM business_studio_validation WHERE scope='profile'").run();
    return { profile, published: false, updatedAt };
  }
  /** Torna o rascunho oficial apenas após confirmação explícita. */
  publish() {
    const draft = this.getDraft();
    if (draft.published) throw new Error("Não há alterações pendentes para publicar.");
    if (!draft.profile.name.trim()) throw new Error("Informe o nome da empresa antes de publicar.");
    this.assertValidated("profile");
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const old=this.ai.getBusiness();
      const existing=this.db.prepare("SELECT 1 FROM business_profile_revisions LIMIT 1").get();
      if(!existing&&old.name.trim())this.db.prepare("INSERT INTO business_profile_revisions(data_json,published_at) VALUES(?,?)").run(JSON.stringify(old),now);
      this.ai.saveBusiness(draft.profile);
      this.db.prepare("INSERT INTO business_profile_revisions(data_json,published_at) VALUES(?,?)")
        .run(JSON.stringify(draft.profile),now);
      this.db.prepare("DELETE FROM business_profile_draft WHERE id=1").run();
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.getDraft();
  }
  history() {
    const profileVersions=(this.db.prepare("SELECT revision,data_json,published_at FROM business_profile_revisions ORDER BY revision DESC LIMIT 30").all() as Array<{revision:number;data_json:string;published_at:string}>)
      .map(row=>({kind:"profile" as const,revision:row.revision,publishedAt:row.published_at,
        name:businessSchema.parse(JSON.parse(row.data_json)).name}));
    const settingsVersions=(this.db.prepare("SELECT revision,kind,snapshot_json,published_at FROM business_settings_revisions ORDER BY revision DESC LIMIT 30").all() as Array<{revision:number;kind:"engine"|"rules";snapshot_json:string;published_at:string}>)
      .map(row=>({kind:row.kind,revision:row.revision,publishedAt:row.published_at,
        name:row.kind==="engine"?"Motor: "+String((JSON.parse(row.snapshot_json) as {provider:string}).provider):
          "Regras: "+String((JSON.parse(row.snapshot_json) as {items:unknown[]}).items.length)+" itens"}));
    return [...profileVersions,...settingsVersions].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)||b.revision-a.revision).slice(0,40);
  }
  rollback(revision:number,kind:"profile"|"engine"|"rules"="profile"){
    if(kind!=="profile")return this.rollbackSettings(revision,kind);
    const row=this.db.prepare("SELECT data_json FROM business_profile_revisions WHERE revision=?").get(revision) as {data_json:string}|undefined;
    if(!row)throw new Error("Revisão não encontrada.");
    const restored=businessSchema.parse(JSON.parse(row.data_json));
    const now=new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try{
      this.ai.saveBusiness(restored);
      this.db.prepare("INSERT INTO business_profile_revisions(data_json,published_at) VALUES(?,?)").run(JSON.stringify(restored),now);
      this.db.prepare("DELETE FROM business_profile_draft WHERE id=1").run();
      this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
    return this.getDraft();
  }
  private rollbackSettings(revision:number,kind:"engine"|"rules"){
    const row=this.db.prepare("SELECT snapshot_json FROM business_settings_revisions WHERE revision=? AND kind=?").get(revision,kind) as {snapshot_json:string}|undefined;
    if(!row)throw new Error("Revisão não encontrada.");
    const snapshot=JSON.parse(row.snapshot_json) as unknown;
    if(kind==="engine"){
      const value=z.object({provider:z.enum(["rules","anthropic","openai","compatible"]),model:z.string(),endpoint:z.string()}).parse(snapshot);
      // Requer a chave comercial ainda cadastrada; histórico nunca armazena tokens.
      this.ai.saveAi(value);
      this.db.prepare("DELETE FROM business_ai_pending WHERE id=1").run();
      this.recordEngineRevision();
      return this.ai.getAi();
    }
    const rules=z.object({items:z.array(ruleInputSchema).max(100)}).parse(snapshot).items;
    this.db.exec("BEGIN IMMEDIATE");
    try{
      const store=new AutomationStore(this.db);
      const ids=new Set(rules.map(x=>x.id));
      for(const rule of rules)store.saveRule(rule);
      for(const rule of store.listRules())if(!ids.has(rule.id))store.deleteRule(rule.id);
      this.db.prepare("DELETE FROM business_rule_draft WHERE id=1").run();
      this.db.prepare("INSERT INTO business_settings_revisions(kind,snapshot_json,published_at) VALUES('rules',?,?)")
        .run(JSON.stringify({items:store.listRules()}),new Date().toISOString());
      this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
    return this.getRulesDraft();
  }
  recordEngineRevision(){
    const active=this.ai.getAi();
    this.db.prepare("INSERT INTO business_settings_revisions(kind,snapshot_json,published_at) VALUES('engine',?,?)")
      .run(JSON.stringify({provider:active.provider,model:active.model,endpoint:active.endpoint??""}),new Date().toISOString());
    return active;
  }


  getRulesDraft(): {items:RuleInput[];published:boolean;updatedAt:string|null} {
    const draft=this.db.prepare("SELECT rules_json,updated_at FROM business_rule_draft WHERE id=1").get() as {rules_json:string;updated_at:string}|undefined;
    return draft?{items:ruleInputSchema.array().parse(JSON.parse(draft.rules_json)),published:false,updatedAt:draft.updated_at}:
      {items:new AutomationStore(this.db).listRules(),published:true,updatedAt:null};
  }
  saveRulesDraft(input:unknown) {
    const {items}=z.object({items:z.array(ruleInputSchema).max(100)}).parse(input);
    const normalized=items.map(item=>({...item,id:item.id??randomUUID()}));
    if(new Set(normalized.map(r=>r.id)).size!==normalized.length)throw new Error("Existem regras duplicadas.");
    const now=new Date().toISOString();
    this.db.prepare("INSERT INTO business_rule_draft(id,rules_json,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET rules_json=excluded.rules_json,updated_at=excluded.updated_at")
      .run(JSON.stringify(normalized),now);
    this.db.prepare("DELETE FROM business_studio_validation WHERE scope='rules'").run();
    return this.getRulesDraft();
  }
  previewRule(message:string) {
    const rules=this.getRulesDraft().items.filter(r=>r.enabled)
      .sort((a,b)=>(b.priority??0)-(a.priority??0));
    const text=normalizeRuleText(message);
    for (const rule of rules) {
      const needle=normalizeRuleText(rule.trigger);
      if(rule.match==="equals"?text===needle:rule.match==="starts_with"?text.startsWith(needle):text.includes(needle)) {
        const response=rule.response.replace(/\{(telefone|mensagem)\}/g,(_token,key:string)=>
          key==="telefone"?"[simulação]":message.slice(0,500));
        return {rule:rule.name,reply:response+(rule.action==="menu"?"\n"+(rule.options??[]).map(option=>option.key+". "+option.label).join("\n"):""),
          handoff:rule.action==="handoff",source:"automation"};
      }
    }
    return null;
  }
  publishRules(){
    const draft=this.getRulesDraft();
    if(draft.published)throw new Error("Nenhuma alteração nas regras para publicar.");
    this.assertValidated("rules");
    this.db.exec("BEGIN IMMEDIATE");
    try{
      const automation=new AutomationStore(this.db);
      const old=automation.listRules();
      if(!this.db.prepare("SELECT 1 FROM business_settings_revisions WHERE kind='rules' LIMIT 1").get()){
        this.db.prepare("INSERT INTO business_settings_revisions(kind,snapshot_json,published_at) VALUES('rules',?,?)")
          .run(JSON.stringify({items:old}),new Date().toISOString());
      }
      const keep=new Set(draft.items.map(x=>x.id));
      for(const item of draft.items)automation.saveRule(item);
      for(const item of automation.listRules())if(!keep.has(item.id))automation.deleteRule(item.id);
      this.db.prepare("DELETE FROM business_rule_draft WHERE id=1").run();
      this.db.prepare("INSERT INTO business_settings_revisions(kind,snapshot_json,published_at) VALUES('rules',?,?)")
        .run(JSON.stringify({items:automation.listRules()}),new Date().toISOString());
      this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
    return this.getRulesDraft();
  }
  private digest(scope:"profile"|"engine"|"rules"){
    const value=scope==="profile"?this.getDraft().profile:
      scope==="engine"?this.ai.getPendingAi():this.getRulesDraft().items;
    return hash(JSON.stringify(value));
  }
  markValidated(scope:"profile"|"engine"|"rules"){
    const now=new Date().toISOString();
    this.db.prepare("INSERT INTO business_studio_validation(scope,digest,checked_at) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET digest=excluded.digest,checked_at=excluded.checked_at")
      .run(scope,this.digest(scope),now);
  }
  isValidated(scope:"profile"|"engine"|"rules") {
    const row=this.db.prepare("SELECT digest FROM business_studio_validation WHERE scope=?").get(scope) as {digest:string}|undefined;
    return row?.digest===this.digest(scope);
  }
  assertValidated(scope:"profile"|"engine"|"rules"){
    if(!this.isValidated(scope))throw new StudioValidationError("Valide o rascunho no Laboratório antes de publicar.");
  }
  getValidation(){
    return {profileReady:this.getDraft().published||this.isValidated("profile"),
      engineReady:this.ai.getPendingAi().published||this.isValidated("engine"),
      rulesReady:this.getRulesDraft().published||this.isValidated("rules")};
  }

  integrationStatus(){
    const row=this.db.prepare("SELECT created_at,last_sync_at FROM business_commerce_integrations WHERE id=1").get() as {created_at:string;last_sync_at:string|null}|undefined;
    return {configured:!!row,createdAt:row?.created_at??null,lastSyncAt:row?.last_sync_at??null};
  }
  rotateIntegrationToken(){
    const token=randomBytes(32).toString("base64url");
    const now=new Date().toISOString();
    this.db.prepare("INSERT INTO business_commerce_integrations(id,token_hash,created_at,last_sync_at) VALUES(1,?,?,NULL) ON CONFLICT(id) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,last_sync_at=NULL")
      .run(hash(token),now);
    return {token,...this.integrationStatus(),path:"/admin/integrations/commerce/v1/sync"};
  }
  revokeIntegrationToken(){
    this.db.prepare("DELETE FROM business_commerce_integrations WHERE id=1").run();
    return this.integrationStatus();
  }
  validateIntegrationToken(token:string){
    if(!token || token.length>256)return false;
    const row=this.db.prepare("SELECT token_hash FROM business_commerce_integrations WHERE id=1").get() as {token_hash:string}|undefined;
    if(!row)return false;
    const actual=Buffer.from(hash(token),"hex"),expected=Buffer.from(row.token_hash,"hex");
    return expected.length===actual.length&&timingSafeEqual(actual,expected);
  }
  syncIntegration(raw:unknown){
    const {products,orders}=commerceSync.parse(raw);
    if(new Set(products.map(p=>p.id)).size!==products.length)throw new Error("IDs de produtos duplicados.");
    if(new Set(orders.map(o=>o.id)).size!==orders.length)throw new Error("IDs de pedidos duplicados.");
    const now=new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try{
      // Snapshot dos produtos importados: substitui apenas a origem de integração.
      this.db.prepare("DELETE FROM business_commerce_products WHERE source='integration'").run();
      const insert=this.db.prepare("INSERT INTO business_commerce_products(id,source,name,sku,price,stock,synced_at) VALUES(?,'integration',?,?,?,?,?)");
      for(const product of products)insert.run("integration:"+product.id,product.name,product.sku,product.price,product.stock,now);
      const upsert=this.db.prepare(`INSERT INTO business_commerce_orders(id,source,order_number,financial_status,fulfillment_status,total,created_at,synced_at)
        VALUES(?,'integration',?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET order_number=excluded.order_number,financial_status=excluded.financial_status,
        fulfillment_status=excluded.fulfillment_status,total=excluded.total,created_at=excluded.created_at,synced_at=excluded.synced_at`);
      for(const order of orders)upsert.run("integration:"+order.id,order.number,order.financialStatus,order.fulfillmentStatus,order.total,order.createdAt,now);
      this.db.prepare("UPDATE business_commerce_integrations SET last_sync_at=? WHERE id=1").run(now);
      this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
    return {products:products.length,orders:orders.length,syncedAt:now};
  }

  importCatalog(input: unknown) {
    const items=z.array(catalogItem).min(1).max(2500).parse(input);
    const unique = new Set<string>();
    for (const item of items) {
      if (unique.has(item.id)) throw new Error("O catálogo contém identificadores duplicados.");
      unique.add(item.id);
    }
    const now=new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const stmt=this.db.prepare("INSERT INTO business_commerce_products(id,source,name,sku,price,stock,synced_at) VALUES(?,'manual',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source='manual',name=excluded.name,sku=excluded.sku,price=excluded.price,stock=excluded.stock,synced_at=excluded.synced_at");
      for(const item of items) stmt.run("manual:"+item.id,item.name,item.sku,item.price,item.stock,now);
      this.db.exec("COMMIT");
    } catch(error) {this.db.exec("ROLLBACK");throw error;}
    return {imported:items.length,at:now};
  }
  getCatalog(limit=100): CommerceProduct[] {
    const rows=this.db.prepare("SELECT id,source,name,sku,price,stock,synced_at FROM business_commerce_products ORDER BY name,id LIMIT ?")
      .all(limit) as Array<{id:string;source:"manual"|"shopify";name:string;sku:string;price:string;stock:number|null;synced_at:string}>;
    return rows.map(row=>({id:row.id,source:row.source,name:row.name,sku:row.sku,price:row.price,stock:row.stock,syncedAt:row.synced_at}));
  }
  getOrders() {
    return (this.db.prepare("SELECT id,order_number,financial_status,fulfillment_status,total,created_at,synced_at FROM business_commerce_orders ORDER BY created_at DESC LIMIT 50")
      .all() as Array<{id:string;order_number:string;financial_status:string;fulfillment_status:string;total:string;created_at:string;synced_at:string}>)
      .map(row=>({id:row.id,number:row.order_number,financialStatus:row.financial_status,fulfillmentStatus:row.fulfillment_status,total:row.total,createdAt:row.created_at,syncedAt:row.synced_at}));
  }
  commerceStatus() {
    const enabled=Boolean((this.db.prepare("SELECT enabled FROM business_commerce_state WHERE id=1").get() as {enabled:number}|undefined)?.enabled);
    const count=(this.db.prepare("SELECT COUNT(*) AS count FROM business_commerce_products").get() as {count:number}).count;
    const orders=(this.db.prepare("SELECT COUNT(*) AS count FROM business_commerce_orders").get() as {count:number}).count;
    const last=(this.db.prepare("SELECT MAX(synced_at) AS at FROM business_commerce_products").get() as {at:string|null}).at;
    return {enabled,count,orders,lastSync:last,shopify:this.ai.getShopifyConnection()};
  }
  enableCatalog(enabled: boolean) {
    if(enabled && !this.getCatalog(1).length) throw new Error("Importe ou sincronize um catálogo antes de ativá-lo.");
    this.db.prepare("UPDATE business_commerce_state SET enabled=? WHERE id=1").run(Number(enabled));
    return this.commerceStatus();
  }
  /** A IA só vê os produtos se o administrador ativou a fonte. Pedidos nunca entram no prompt. */
  activeCommerceContext(): string {
    if(!this.commerceStatus().enabled) return "";
    const rows=this.getCatalog(250);
    return ["CATÁLOGO COMPLEMENTAR (última sincronização, não é estoque em tempo real):",
      ...rows.map(p=>"- "+p.name+" | SKU "+p.sku+" | Preço "+(p.price||"não informado")+" | Saldo "+(p.stock??"desconhecido")+" | Atualizado "+p.syncedAt),
      "Não garanta disponibilidade ou entrega sem confirmação. Nunca cite dados de pedidos de outros clientes."].join("\n");
  }

  async syncShopify() {
    const {domain,token}=this.ai.getShopifyCredentials();
    // Destino é validado como *.myshopify.com no cadastro. Nenhuma URL externa é recebida neste endpoint.
    const url="https://"+domain+"/admin/api/2026-10/graphql.json";
    const query = async <T>(q:string):Promise<T> => {
      const response=await this.requestFetch(url,{method:"POST",redirect:"error",signal:AbortSignal.timeout(25000),
        headers:{"Content-Type":"application/json","X-Shopify-Access-Token":token},body:JSON.stringify({query:q})});
      if(!response.ok) throw new Error("A Shopify retornou HTTP "+response.status+". Verifique acesso e permissões.");
      const result=await response.json() as {data?:T;errors?:Array<{message:string}>};
      if(result.errors?.length || !result.data) throw new Error("A Shopify não autorizou a consulta. Verifique read_products, read_inventory e read_orders.");
      return result.data;
    };
    type Edge<T>={edges:Array<{node:T}>};
    type Product={id:string;title:string;variants:Edge<{id:string;sku:string|null;price:string;inventoryQuantity:number|null}>};
    type Order={id:string;name:string;displayFinancialStatus:string|null;displayFulfillmentStatus:string|null;createdAt:string;totalPriceSet:{shopMoney:{amount:string;currencyCode:string}}};
    const productData=await query<{products:Edge<Product>}>("query { products(first:50) { edges { node { id title variants(first:20) { edges { node { id sku price inventoryQuantity } } } } } } }");
    const orderData=await query<{orders:Edge<Order>}>("query { orders(first:50,sortKey:UPDATED_AT,reverse:true) { edges { node { id name displayFinancialStatus displayFulfillmentStatus createdAt totalPriceSet { shopMoney { amount currencyCode } } } } } }");
    if (!productData.products || !orderData.orders) throw new Error("Resposta incompleta da Shopify. Nenhum dado foi alterado.");
    const now=new Date().toISOString();
    const products=productData.products.edges.flatMap(({node})=>node.variants.edges.map(({node:variant})=>({
      id:"shopify:"+variant.id,name:node.title,sku:variant.sku??"",price:variant.price,stock:variant.inventoryQuantity,
    })));
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const insertProduct=this.db.prepare("INSERT INTO business_commerce_products(id,source,name,sku,price,stock,synced_at) VALUES(?,'shopify',?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sku=excluded.sku,price=excluded.price,stock=excluded.stock,synced_at=excluded.synced_at");
      for(const item of products) insertProduct.run(item.id,item.name,item.sku,item.price,item.stock,now);
      const insertOrder=this.db.prepare("INSERT INTO business_commerce_orders(id,source,order_number,financial_status,fulfillment_status,total,created_at,synced_at) VALUES(?,'shopify',?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET order_number=excluded.order_number,financial_status=excluded.financial_status,fulfillment_status=excluded.fulfillment_status,total=excluded.total,created_at=excluded.created_at,synced_at=excluded.synced_at");
      for(const {node} of orderData.orders.edges) insertOrder.run(node.id,node.name,node.displayFinancialStatus??"UNKNOWN",node.displayFulfillmentStatus??"UNKNOWN",
        node.totalPriceSet.shopMoney.amount+" "+node.totalPriceSet.shopMoney.currencyCode,node.createdAt,now);
      this.db.exec("COMMIT");
    }catch(error){this.db.exec("ROLLBACK");throw error;}
    return {products:products.length,orders:orderData.orders.edges.length,at:now,limitedTo:50};
  }
}

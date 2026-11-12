import type { DatabaseSync } from "node:sqlite";
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
type CommerceProduct = CatalogItem & { source: "manual" | "shopify"; syncedAt: string };

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
    return { profile, published: false, updatedAt };
  }
  /** Torna o rascunho oficial apenas após confirmação explícita. */
  publish() {
    const draft = this.getDraft();
    if (draft.published) throw new Error("Não há alterações pendentes para publicar.");
    if (!draft.profile.name.trim()) throw new Error("Informe o nome da empresa antes de publicar.");
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.ai.saveBusiness(draft.profile);
      this.db.prepare("INSERT INTO business_profile_revisions(data_json,published_at) VALUES(?,?)")
        .run(JSON.stringify(draft.profile),now);
      this.db.prepare("DELETE FROM business_profile_draft WHERE id=1").run();
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.getDraft();
  }
  history() {
    return (this.db.prepare("SELECT revision,data_json,published_at FROM business_profile_revisions ORDER BY revision DESC LIMIT 30").all() as Array<{revision:number;data_json:string;published_at:string}>)
      .map(row=>({revision:row.revision,publishedAt:row.published_at,name:businessSchema.parse(JSON.parse(row.data_json)).name}));
  }
  rollback(revision: number) {
    const target = this.db.prepare("SELECT data_json FROM business_profile_revisions WHERE revision=?").get(revision)
      as {data_json:string}|undefined;
    if (!target) throw new Error("Revisão não encontrada.");
    const restore = businessSchema.parse(JSON.parse(target.data_json));
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.ai.saveBusiness(restore);
      this.db.prepare("INSERT INTO business_profile_revisions(data_json,published_at) VALUES(?,?)").run(JSON.stringify(restore),now);
      this.db.prepare("DELETE FROM business_profile_draft WHERE id=1").run();
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    return this.getDraft();
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

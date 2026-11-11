import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { CrmStore } from "../../../crm/crm-store.ts";
import { openDatabase } from "./open-database.ts";
import { runMigrations } from "./migration-runner.ts";

const MIGRATIONS=join(dirname(fileURLToPath(import.meta.url)),"migrations");
const ROOT=resolve(MIGRATIONS,"../../../../../../..");
const NOW="2026-11-11T14:00:00.000Z";
const ALPHA="11111111-1111-4111-8111-111111111111";
const BETA="22222222-2222-4222-8222-222222222222";
const USER="33333333-3333-4333-8333-333333333333";
const FIRST="+5516900000011";
const OTHER="+5516900000022";

function createLegacy(root:string) {
  const oldMigrations=join(root,"migrations-before-0014");
  mkdirSync(oldMigrations,{recursive:true});
  for(const f of readdirSync(MIGRATIONS).filter(f=>f.endsWith(".sql")&&f<"0014")){
    copyFileSync(join(MIGRATIONS,f),join(oldMigrations,f));
  }
  const file=join(root,"legacy.db");
  const db=new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys=ON");
  runMigrations(db,oldMigrations);
  const insertCompany=db.prepare("INSERT INTO crm_companies(id,name,created_at,updated_at) VALUES(?,?,?,?)");
  insertCompany.run(ALPHA,"Empresa Alfa",NOW,NOW);
  insertCompany.run(BETA,"Empresa Beta",NOW,NOW);
  db.prepare("INSERT INTO crm_team_users(id,username,salt,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,'agent',?,?)")
    .run(USER,"operador","0".repeat(32),"0".repeat(128),NOW,NOW);
  const insertLead=db.prepare("INSERT INTO leads(phone,display_name,company,prospecting_state,created_at,updated_at) VALUES(?,?,?,'replied',?,?)");
  insertLead.run(FIRST,"Nome anterior","Empresa Alfa",NOW,NOW);
  insertLead.run(OTHER,"Outro contato","Empresa desconhecida",NOW,NOW);
  db.prepare("INSERT INTO crm_customers(id,lead_phone,name,company_id,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run("44444444-4444-4444-8444-444444444444",FIRST,"Snapshot desatualizado",ALPHA,NOW,NOW);
  const insertOpportunity=db.prepare("INSERT INTO crm_opportunities (id,title,company_id,lead_phone,stage,estimated_cents,owner,created_at,updated_at) VALUES(?,?,?,?,'qualified',100000,?,?,?)");
  insertOpportunity.run("55555555-5555-4555-8555-555555555555","Venda antiga",ALPHA,FIRST,"operador",NOW,NOW);
  insertOpportunity.run("66666666-6666-4666-8666-666666666666","Primeira venda",ALPHA,OTHER,"",NOW,NOW);
  insertOpportunity.run("77777777-7777-4777-8777-777777777777","Outra empresa",BETA,OTHER,"",NOW,NOW);
  db.prepare("INSERT INTO crm_activities(id,opportunity_id,kind,subject,due_at,owner,created_at) VALUES(?,?,'CALL','Retornar',?,?,?)")
    .run("88888888-8888-4888-8888-888888888888","55555555-5555-4555-8555-555555555555","2026-11-12","operador",NOW);
  db.prepare("INSERT INTO crm_campaigns(id,name,created_at,updated_at) VALUES(?,'Campanha histórica',?,?)")
    .run("99999999-9999-4999-8999-999999999999",NOW,NOW);
  db.prepare("INSERT INTO crm_campaign_members(campaign_id,lead_phone,added_at) VALUES(?,?,?)")
    .run("99999999-9999-4999-8999-999999999999",FIRST,NOW);
  db.close();
  return {file,oldMigrations};
}

function expectCanonical(file:string){
  const db=openDatabase(file);
  try {
    expect(db.prepare("PRAGMA integrity_check").get()).toEqual({integrity_check:"ok"});
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(db.prepare("SELECT count(*) AS n FROM leads").get()).toEqual({n:2});
    expect(db.prepare("SELECT company_id FROM leads WHERE phone=?").get(FIRST))
      .toEqual({company_id:ALPHA});
    // Não inventa empresa quando as oportunidades históricas são ambíguas.
    expect(db.prepare("SELECT company_id FROM leads WHERE phone=?").get(OTHER))
      .toEqual({company_id:null});
    expect(db.prepare("SELECT owner_user_id FROM crm_opportunities WHERE id=?")
      .get("55555555-5555-4555-8555-555555555555"))
      .toEqual({owner_user_id:USER});
    expect(db.prepare("SELECT owner_user_id FROM crm_activities WHERE id=?")
      .get("88888888-8888-4888-8888-888888888888"))
      .toEqual({owner_user_id:USER});
    expect(db.prepare("SELECT count(*) AS n FROM crm_campaign_deliveries").get()).toEqual({n:0});
    expect(db.prepare("SELECT count(*) AS n FROM crm_opportunities").get()).toEqual({n:3});
    expect(db.prepare("SELECT count(*) AS n FROM schema_migrations WHERE version='0014_crm_canonical_integrity'").get())
      .toEqual({n:1});
    const crm=new CrmStore(db);
    expect(crm.listCustomers()[0]).toMatchObject({name:"Nome anterior",companyId:ALPHA,leadPhone:FIRST});
    expect(crm.listCampaigns()[0]).toMatchObject({audience:1,sent:0,replied:0,failed:0});
  }finally{db.close();}
}

describe("upgrade/backup/restore offline com dados fictícios",()=>{
  it("faz migração real de 0013 para 0014 e restaura cópia gerada pelo backup-selfhost",()=>{
    const root=mkdtempSync(join(tmpdir(),"wpp-upgrade-"));
    try{
      const {file}=createLegacy(root);
      const conversations=join(root,"conversations");
      mkdirSync(conversations);
      writeFileSync(join(conversations,"5516900000011.json"),'{"fictitious":true,"leadPhone":"+5516900000011"}');
      const snapshots=join(root,"snapshots");
      const script=join(ROOT,"scripts","backup-selfhost.mjs");
      expect(existsSync(script)).toBe(true);
      const backup=spawnSync(process.execPath,[script,"--server-stopped","--dest",snapshots],{
        cwd:ROOT,encoding:"utf8",
        env:{...process.env,DATABASE_PATH:file,CONVERSATIONS_DIR:conversations,BAILEYS_AUTH_DIR:join(root,"no-secrets")},
      });
      expect(backup.status,backup.stderr||backup.stdout).toBe(0);
      const names=readdirSync(snapshots);
      expect(names).toHaveLength(1);
      const archived=join(snapshots,names[0]!);
      expect(readFileSync(join(archived,"conversations","5516900000011.json"),"utf8"))
        .toContain("fictitious");
      const manifest=JSON.parse(readFileSync(join(archived,"manifest.json"),"utf8")) as {requiresOfflineRestore:boolean;includesSessionKeys:boolean};
      expect(manifest).toMatchObject({requiresOfflineRestore:true,includesSessionKeys:false});
      expect(existsSync(join(archived,"baileys-auth"))).toBe(false);
      // Upgrade do banco existente e da cópia, sem alterar o snapshot offline.
      expectCanonical(file);
      const restored=join(root,"restored.db");
      copyFileSync(join(archived,"app.db"),restored);
      expectCanonical(restored);
      // Reinicialização do serviço não pode repetir migrations nem duplicar dados.
      expectCanonical(restored);
    }finally{rmSync(root,{recursive:true,force:true});}
  });
  it("ROLLBACK de migration defeituosa é atômico; reexecução íntegra funciona",()=>{
    const root=mkdtempSync(join(tmpdir(),"wpp-migration-rollback-"));
    try{
      const {file,oldMigrations}=createLegacy(root);
      const bad=join(oldMigrations,"0014_crm_canonical_integrity.sql");
      writeFileSync(bad,"ALTER TABLE leads ADD COLUMN company_id TEXT;\nSELECT * FROM missing_table_for_rollback;");
      const db=new DatabaseSync(file);
      db.exec("PRAGMA foreign_keys=ON");
      expect(()=>runMigrations(db,oldMigrations)).toThrow();
      const cols=db.prepare("PRAGMA table_info(leads)").all() as Array<{name:string}>;
      expect(cols.some(c=>c.name==="company_id")).toBe(false);
      expect(db.prepare("SELECT count(*) AS n FROM schema_migrations WHERE version='0014_crm_canonical_integrity'").get())
        .toEqual({n:0});
      db.close();
      copyFileSync(join(MIGRATIONS,"0014_crm_canonical_integrity.sql"),bad);
      expectCanonical(file);
    }finally{rmSync(root,{recursive:true,force:true});}
  });
});

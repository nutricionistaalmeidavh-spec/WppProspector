import { describe, expect, it } from "vitest";
import { openDatabase } from "../shared/persistence/sqlite/open-database.ts";
import { TeamStore } from "./team-store.ts";

describe("TeamStore",()=>{
  it("hashes credentials, authenticates and immediately revokes a disabled user",()=>{
    const db=openDatabase(":memory:");
    try{
      const team=new TeamStore(db);
      const created=team.create({username:"comercial",password:"SenhaForte!2026",role:"agent"});
      expect(created.username).toBe("comercial");
      expect(JSON.stringify(created)).not.toContain("SenhaForte");
      const stored=db.prepare("SELECT password_hash FROM crm_team_users WHERE id=?").get(created.id) as {password_hash:string};
      expect(stored.password_hash).not.toBe("SenhaForte!2026");
      expect(team.authenticate("comercial","senha errada")).toBeNull();
      const valid=team.authenticate("comercial","SenhaForte!2026");
      expect(valid?.role).toBe("agent");
      expect(team.sessionValid(created.id,valid!.version)).toBe(true);
      team.update(created.id,{active:false});
      expect(team.sessionValid(created.id,valid!.version)).toBe(false);
      expect(team.authenticate("comercial","SenhaForte!2026")).toBeNull();
    }finally{db.close();}
  });
});

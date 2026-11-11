import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export type OperatorRole="manager"|"agent";
export interface TeamUser {id:string;username:string;role:OperatorRole;active:boolean;version:number;createdAt:string}
type Row=Record<string,unknown>;
const str=(row:Row,key:string)=>String(row[key]??"");
const hash=(password:string,salt:string)=>scryptSync(password,salt,64);
const blankSalt="0".repeat(32);

export class TeamStore {
  constructor(private readonly db:DatabaseSync,private readonly clock:()=>Date=()=>new Date()){}
  private publicRow(row:Row):TeamUser{
    return {id:str(row,"id"),username:str(row,"username"),role:str(row,"role") as OperatorRole,
      active:Number(row.active)===1,version:Number(row.version),createdAt:str(row,"created_at")};
  }
  list():TeamUser[]{
    return (this.db.prepare("SELECT id,username,role,active,version,created_at FROM crm_team_users ORDER BY username LIMIT 500")
      .all() as Row[]).map(row=>this.publicRow(row));
  }
  get(id:string):TeamUser|null{
    const row=this.db.prepare("SELECT id,username,role,active,version,created_at FROM crm_team_users WHERE id=?").get(id) as Row|undefined;
    return row?this.publicRow(row):null;
  }
  create(input:{username:string;password:string;role:OperatorRole}):TeamUser{
    const username=input.username.trim();
    if(!/^[a-zA-Z0-9._-]{3,40}$/.test(username))throw new Error("Usuário deve ter 3–40 caracteres simples.");
    if(input.password.length<12||input.password.length>128)throw new Error("Senha deve conter de 12 a 128 caracteres.");
    if(!["manager","agent"].includes(input.role))throw new Error("Perfil inválido.");
    const salt=randomBytes(16).toString("hex"),id=randomUUID(),at=this.clock().toISOString();
    const digest=hash(input.password,salt).toString("hex");
    this.db.prepare("INSERT INTO crm_team_users(id,username,salt,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
      .run(id,username,salt,digest,input.role,at,at);
    return this.get(id)!;
  }
  authenticate(username:string,password:string):TeamUser|null{
    const row=this.db.prepare("SELECT * FROM crm_team_users WHERE username=? COLLATE NOCASE")
      .get(username.trim()) as Row|undefined;
    const stored=row&&row.active===1?str(row,"password_hash"):"";
    const actual=hash(password,row?str(row,"salt"):blankSalt);
    const expected=stored?Buffer.from(stored,"hex"):Buffer.alloc(64);
    if(expected.length!==64||!timingSafeEqual(actual,expected)||!row||row.active!==1)return null;
    return this.publicRow(row);
  }
  sessionValid(id:string,version:number):boolean{
    const row=this.db.prepare("SELECT active,version FROM crm_team_users WHERE id=?").get(id) as Row|undefined;
    return !!row&&Number(row.active)===1&&Number(row.version)===version;
  }
  update(id:string,patch:{active?:boolean;role?:OperatorRole}):TeamUser|null{
    const user=this.get(id);if(!user)return null;
    if(patch.role!==undefined&&!["manager","agent"].includes(patch.role))throw new Error("Perfil inválido.");
    const role=patch.role??user.role,active=patch.active??user.active;
    if(role!==user.role||active!==user.active){
      this.db.prepare("UPDATE crm_team_users SET role=?,active=?,version=version+1,updated_at=? WHERE id=?")
        .run(role,active?1:0,this.clock().toISOString(),id);
    }
    return this.get(id);
  }
}

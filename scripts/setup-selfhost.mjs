import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const secureHex=()=>randomBytes(32).toString("hex");

/** Pure renderer: credentials are generated only locally, never written into source. */
export function renderLocalEnv(template,{access,session,credentials}){
  if(!access||!session||access===session)throw new Error("Segredos distintos são obrigatórios.");
  let output=template;
  const set=(key,value)=>{
    const line=new RegExp("^"+key+"=.*$","m");
    output=line.test(output)?output.replace(line,key+"="+value):
      output.trimEnd()+"\n"+key+"="+value+"\n";
  };
  set("WHATSAPP_PROVIDER","baileys");
  set("LLM_PROVIDER","rules");
  set("ADMIN_ACCESS_SECRET",access);
  set("ADMIN_SESSION_SECRET",session);
  if(credentials) set("WHATSAPP_CREDENTIALS_KEY",credentials);
  set("HOST","127.0.0.1");
  set("META_ACCESS_TOKEN","");
  set("ANTHROPIC_API_KEY","");
  return output;
}
function runNpm(args,cwd=root){
  const executable=process.platform==="win32"?"npm.cmd":"npm";
  const result=spawnSync(executable,args,{cwd,stdio:"inherit",shell:process.platform==="win32"});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error("Falha em npm "+args.join(" ")+" (código "+result.status+")");
}
export function setupSelfhost(){
  const major=Number(process.versions.node.split(".")[0]);
  if(major<24)throw new Error("Use Node.js 24 ou superior para instalar WppProspector.");
  const env=join(root,".env");
  if(!existsSync(env)){
    const template=readFileSync(join(root,".env.example"),"utf8");
    writeFileSync(env,renderLocalEnv(template,{access:secureHex(),session:secureHex(),credentials:secureHex()}),
      {mode:0o600,flag:"wx"});
    console.info("Arquivo .env local criado com segredos aleatórios. Não o compartilhe.");
  }else console.info("Arquivo .env existente preservado sem alterações.");
  runNpm(["ci"]);
  // Dependência gratuita e explícita para o modo local. Não altera package-lock.
  runNpm(["install","--no-save","--package-lock=false","--workspaces=false",
    "baileys@6.7.24","pino@9.14.0","qrcode-terminal@0.12.0"],join(root,"apps/server"));
  runNpm(["run","build"]);
  console.info("Setup finalizado. Inicie com npm start e abra http://localhost:3000/admin/.");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{setupSelfhost();}catch(error){console.error(error instanceof Error?error.message:error);process.exitCode=1;}
}

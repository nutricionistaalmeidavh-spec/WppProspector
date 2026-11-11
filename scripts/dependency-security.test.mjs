import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const load=path=>JSON.parse(readFileSync(join(root,path),"utf8"));
function tuple(version){return version.replace(/^[^0-9]*/,"").split(".").slice(0,3).map(Number)}
function atLeast(version,minimum){
 const a=tuple(version),b=tuple(minimum);
 return a.some((v,i)=>v>b[i]&&a.slice(0,i).every((x,j)=>x===b[j]))||a.every((v,i)=>v===b[i]);
}

test("as aplicações e contratos não fixam uma versão de Zod vulnerável",()=>{
 for(const dir of ["apps/server","apps/panel","packages/contracts"]){
   const pkg=load(dir+"/package.json");
   assert.ok(atLeast(pkg.dependencies.zod,"4.6.6"),dir+" requer zod >=4.6.6");
 }
});

test("a importação XLSX usa pacote corrigido, não o artefato 0.18.5 do npm",()=>{
 const pkg=load("apps/panel/package.json");
 assert.match(pkg.dependencies.xlsx,/^https:\/\/cdn\.sheetjs\.com\/xlsx-0\.20\.3\/xlsx-0\.20\.3\.tgz$/);
});

test("o build mantém Vite corrigido sem trocar a linha major",()=>{
 const pkg=load("apps/panel/package.json");
 assert.ok(atLeast(pkg.devDependencies.vite,"6.4.4"));
 assert.ok(tuple(pkg.devDependencies.vite)[0]===6);
});

test("o lockfile bloqueia as transições vulneráveis de dependências indiretas",()=>{
 const lock=load("package-lock.json");
 for(const [name,min] of [["brace-expansion","5.0.12"],["source-map-js","1.2.2"]]){
  const deps=Object.entries(lock.packages).filter(([p])=>p==="node_modules/"+name || p.endsWith("/node_modules/"+name));
  assert.ok(deps.length,name+" precisa existir no lockfile");
  for(const [,meta] of deps)assert.ok(atLeast(meta.version,min),name+" "+meta.version+" ainda vulnerável");
 }
 for(const [name,min] of [["xlsx","0.20.3"],["zod","4.6.6"],["vite","6.4.4"]]){
   const meta=lock.packages["node_modules/"+name];
   assert.ok(meta,name+" ausente no lockfile");
   assert.ok(atLeast(meta.version,min),name+" "+meta.version+" ainda vulnerável");
 }
});

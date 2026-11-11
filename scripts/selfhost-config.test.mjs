import { test } from "node:test";
import { strict as assert } from "node:assert";
import { renderLocalEnv } from "./setup-selfhost.mjs";

test("configuração self-hosted usa regras locais e segredos distintos sem API comercial",()=>{
  const template=[
    "WHATSAPP_PROVIDER=meta",
    "LLM_PROVIDER=anthropic",
    "ADMIN_ACCESS_SECRET=",
    "ADMIN_SESSION_SECRET=",
    "META_ACCESS_TOKEN=",
    "ANTHROPIC_API_KEY=",
  ].join("\n");
  const result=renderLocalEnv(template,{access:"a".repeat(64),session:"b".repeat(64)});
  assert.match(result,/^WHATSAPP_PROVIDER=baileys$/m);
  assert.match(result,/^LLM_PROVIDER=rules$/m);
  assert.match(result,/^ADMIN_ACCESS_SECRET=a{64}$/m);
  assert.match(result,/^ADMIN_SESSION_SECRET=b{64}$/m);
  assert.match(result,/^META_ACCESS_TOKEN=$/m);
  assert.match(result,/^ANTHROPIC_API_KEY=$/m);
});

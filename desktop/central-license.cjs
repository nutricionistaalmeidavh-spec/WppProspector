'use strict';
// Cliente do mesmo Worker de licenciamento usado pelo PDV ArtiSys e Oficina.
// O core do CRM e seus dados continuam locais; somente a ativação exige rede.
const PRODUCT='WPPPROSPECTOR';
const DEFAULT_ENDPOINT='https://pdv-artisys.sistema-artisys.workers.dev';
function validEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||''));}
function validInstallationId(value){return /^[A-Za-z0-9._:-]{8,128}$/.test(String(value||''));}
function validateReceipt(receipt,installationId,now=new Date()){
  return Boolean(receipt&&receipt.product===PRODUCT&&validInstallationId(installationId)
    &&receipt.installationId===installationId&&validEmail(receipt.accountEmail)
    &&typeof receipt.licenseId==='string'&&/^[-_a-zA-Z0-9]{4,128}$/.test(receipt.licenseId)
    &&(!receipt.expiresAt||(Number.isFinite(Date.parse(receipt.expiresAt))&&Date.parse(receipt.expiresAt)>now.getTime())));
}
function endpointUrl(endpoint,path){
  const url=new URL(String(endpoint||DEFAULT_ENDPOINT));
  if(url.protocol!=='https:')throw Error('A Central de Licenças exige HTTPS.');
  return url.origin+path;
}
async function activateCentral({email,code,installationId,endpoint=DEFAULT_ENDPOINT,fetchImpl=fetch}){
  const normalized=String(email||'').trim().toLowerCase();
  if(!validEmail(normalized)||!/^[0-9]{6}$/.test(String(code||''))||!validInstallationId(installationId))throw Error('Dados de ativação inválidos.');
  const response=await fetchImpl(endpointUrl(endpoint,'/v1/activation/verify'),{
    method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(10000),
    body:JSON.stringify({email:normalized,code,product:PRODUCT,installationId})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(String(payload.error||'A Central não conseguiu validar esta licença.'));
  const receipt={licenseId:payload.licenseId,accountEmail:payload.accountEmail,product:payload.product,
    installationId,expiresAt:payload.expiresAt||null,activatedAt:payload.activatedAt};
  if(receipt.accountEmail!==normalized||!validateReceipt(receipt,installationId))throw Error('A Central retornou uma licença incompatível.');
  return receipt;
}
async function checkCentral({installationId,endpoint=DEFAULT_ENDPOINT,fetchImpl=fetch}){
  if(!validInstallationId(installationId))throw Error('Identidade desta instalação inválida.');
  const url=endpointUrl(endpoint,'/v1/license/status')+'?installationId='+encodeURIComponent(installationId)+'&product='+PRODUCT;
  const response=await fetchImpl(url,{method:'GET',signal:AbortSignal.timeout(8000),headers:{accept:'application/json'}});
  if(!response.ok)throw Error('Não foi possível consultar a Central de Licenças.');
  const payload=await response.json();
  if(payload.product!==PRODUCT||typeof payload.active!=='boolean')throw Error('Resposta incompatível da Central de Licenças.');
  return {active:payload.active,product:PRODUCT,expiresAt:payload.expiresAt||null};
}
module.exports={PRODUCT,DEFAULT_ENDPOINT,activateCentral,checkCentral,validateReceipt};

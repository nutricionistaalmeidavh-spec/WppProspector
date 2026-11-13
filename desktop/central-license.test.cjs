'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {activateCentral,checkCentral,validateReceipt,PRODUCT,DEFAULT_ENDPOINT}=require('./central-license.cjs');

test('activation sends the product and installation identity to the existing ArtiSys Central',async()=>{
  const fetchImpl=async(url,options)=>{
    assert.equal(url,DEFAULT_ENDPOINT+'/v1/activation/verify');
    assert.equal(options.method,'POST');
    const body=JSON.parse(options.body);
    assert.deepEqual(body,{email:'crm@example.com',code:'123456',product:PRODUCT,installationId:'wpp-12345678'});
    return {ok:true,status:200,json:async()=>({licenseId:'lic-crm',accountEmail:'crm@example.com',product:PRODUCT,expiresAt:null,activatedAt:'2026-11-13T22:00:00Z'})};
  };
  const receipt=await activateCentral({email:' CRM@Example.com ',code:'123456',installationId:'wpp-12345678',fetchImpl});
  assert.deepEqual(receipt,{licenseId:'lic-crm',accountEmail:'crm@example.com',product:PRODUCT,installationId:'wpp-12345678',expiresAt:null,activatedAt:'2026-11-13T22:00:00Z'});
  assert.equal(validateReceipt(receipt,'wpp-12345678'),true);
  assert.equal(validateReceipt(receipt,'wpp-87654321'),false);
});

test('activation rejects invalid inputs before any network request',async()=>{
  const fetchImpl=async()=>{throw Error('must not fetch')};
  for(const params of [{email:'bad',code:'123456',installationId:'wpp-12345678'},
    {email:'a@example.com',code:'12345',installationId:'wpp-12345678'},
    {email:'a@example.com',code:'123456',installationId:'short'}]){
    await assert.rejects(activateCentral({...params,fetchImpl}),/inválid/i);
  }
});

test('activation reports full device cap without replacing the previous license',async()=>{
  await assert.rejects(
    activateCentral({email:'crm@example.com',code:'111111',installationId:'wpp-12345678',fetchImpl:async()=>({ok:false,status:409,json:async()=>({error:'Limite de computadores atingido.'})})}),
    /Limite de computadores/
  );
});

test('status sends the CRM product, validates server response and does not assume offline is active',async()=>{
  const fetchImpl=async(url)=>{
    assert.equal(url,DEFAULT_ENDPOINT+'/v1/license/status?installationId=wpp-12345678&product='+PRODUCT);
    return {ok:true,status:200,json:async()=>({active:true,product:PRODUCT,expiresAt:null})};
  };
  assert.deepEqual(await checkCentral({installationId:'wpp-12345678',fetchImpl}),{active:true,product:PRODUCT,expiresAt:null});
  await assert.rejects(checkCentral({installationId:'wpp-12345678',fetchImpl:async()=>{throw Error('network down')}}),/network down/);
  await assert.rejects(checkCentral({installationId:'wpp-12345678',fetchImpl:async()=>({ok:true,status:200,json:async()=>({active:true,product:'PDV'})})}),/incompatível/);
});

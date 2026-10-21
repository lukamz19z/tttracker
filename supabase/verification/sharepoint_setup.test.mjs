import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
const ts=require(path.join(root,'v2/node_modules/typescript'));
function load(file,mocks={}){
 const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)(name=>name in mocks?mocks[name]:name==='server-only'?{}:name.endsWith('.module.css')?{default:{}}:name.startsWith('./')?load(path.posix.join(path.posix.dirname(file),name+(fs.existsSync(path.join(root,path.posix.join(path.posix.dirname(file),name+'.tsx')))?'.tsx':'.ts')),mocks):name.startsWith('@/')?load('v2/'+name.slice(2)+(name.startsWith('@/components/')?'.tsx':'.ts'),mocks):(()=>{try{return require(path.join(root,'v2/node_modules',name));}catch{return require(name);}})(),exports);return exports;
}
const guid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const runtimeId=guid(1),setupId=guid(2),tenant=guid(3),org=guid(4),actor=guid(5),siteRecord=guid(6),integration=guid(7);
const siteId=`customer.sharepoint.com,${guid(8)},${guid(9)}`,siteUrl='https://customer.sharepoint.com/sites/Training';
function env(){const values={TTTRACKER_MICROSOFT_CLIENT_ID:runtimeId,TTTRACKER_MICROSOFT_CLIENT_SECRET:'SYNTHETIC-RUNTIME-SECRET',TTTRACKER_MICROSOFT_SETUP_CLIENT_ID:setupId,TTTRACKER_MICROSOFT_SETUP_CLIENT_SECRET:'SYNTHETIC-SETUP-SECRET',NEXT_PUBLIC_APP_URL:'http://localhost:3001',NODE_ENV:'development'};const prior={};for(const [k,v]of Object.entries(values)){prior[k]=process.env[k];process.env[k]=v;}return()=>{for(const [k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}};}
test('separate setup identity targets customer tenant and requests delegated scope with PKCE, never offline access',()=>{const restore=env();try{const setup=load('v2/lib/integrations/sharepoint-setup.ts');const url=new URL(setup.setupAuthorisationUrl(tenant,'state','nonce','challenge'));assert.ok(url.pathname.includes(tenant));assert.equal(url.searchParams.get('client_id'),setupId);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('nonce'),'nonce');assert.equal(url.searchParams.get('scope'),'openid profile https://graph.microsoft.com/Sites.FullControl.All');assert.ok(!url.toString().includes('SECRET'));assert.ok(!url.toString().includes('offline_access'));assert.ok(setup.microsoftSetupReadiness().ready);process.env.TTTRACKER_MICROSOFT_SETUP_CLIENT_ID=runtimeId;assert.equal(setup.microsoftSetupReadiness().ready,false);assert.throws(()=>setup.setupAuthorisationUrl(tenant,'s','n','c'),/SETUP_REQUIRED/);}finally{restore();}});
test('delegated token is used only inside verified session, then discarded; wrong tenant/nonce/signature fail closed',async()=>{
 const restore=env(),oldFetch=global.fetch;let payload={iss:`https://login.microsoftonline.com/${tenant}/v2.0`,aud:setupId,tid:tenant,nonce:'nonce',oid:guid(10),exp:Math.floor(Date.now()/1000)+300};let signature=true;const calls=[];
 const setup=load('v2/lib/integrations/sharepoint-setup.ts',{jose:{decodeJwt:()=>payload,createRemoteJWKSet:()=>({}),jwtVerify:async(_token,_keys,options)=>{assert.deepEqual(options.algorithms,['RS256']);if(!signature)throw Error('invalid signature');return{payload};}}});
 global.fetch=async(url,init)=>{calls.push({url,init});if(url.includes('/token'))return Response.json({id_token:'signed-id-token',access_token:'SYNTHETIC-DELEGATED-TOKEN',scope:'Sites.FullControl.All'});return Response.json({id:siteId,webUrl:siteUrl});};
 try{let retained;const result=await setup.withMicrosoftSetupSession(tenant,'SYNTHETIC-CODE','verifier','nonce',async graph=>{retained=graph;await graph.resolve(siteUrl);return {status:'success'};});assert.deepEqual(result,{status:'success'});assert.equal(calls[1].init.headers.Authorization,'Bearer SYNTHETIC-DELEGATED-TOKEN');await assert.rejects(retained.resolve(siteUrl),/SCOPE_INVALID/);assert.ok(!JSON.stringify(result).includes('TOKEN'));assert.equal(calls[0].init.body.get('grant_type'),'authorization_code');assert.equal(calls[0].init.body.get('code_verifier'),'verifier');for(const wrong of [{...payload,tid:guid(11)},{...payload,nonce:'wrong'}]){payload=wrong;await assert.rejects(setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>assert.fail()),/WRONG_TENANT|NONCE_INVALID/);}signature=false;await assert.rejects(setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>assert.fail()),/SIGNATURE_INVALID/);}finally{restore();global.fetch=oldFetch;}
});
test('grants write to runtime app only, reuses existing write, safely refuses read upgrade and rejects foreign site identity',async()=>{
 const setup=load('v2/lib/integrations/sharepoint-setup.ts');const old=global.fetch,calls=[];let permissions=[];
 global.fetch=async(url,init)=>{calls.push({url,init});if(init.method==='POST'){const body=JSON.parse(init.body);assert.deepEqual(body.roles,['write']);assert.equal(body.grantedToIdentities[0].application.id,runtimeId);permissions=[{id:'permission-1',roles:['write'],grantedToIdentitiesV2:[{application:{id:runtimeId}}]}];return Response.json(permissions[0],{status:201});}if(url.endsWith('/permissions'))return Response.json({value:permissions});return Response.json({id:`foreign.sharepoint.com,${guid(8)},${guid(9)}`,webUrl:siteUrl});};
 try{const graph=new setup.SetupGraph(()=> 'delegated');assert.equal((await graph.grant(siteId,runtimeId)).id,'permission-1');await graph.grant(siteId,runtimeId);assert.equal(calls.filter(c=>c.init.method==='POST').length,1);permissions[0].roles=['read'];await assert.rejects(graph.grant(siteId,runtimeId),/UPGRADE_REQUIRED/);await assert.rejects(graph.resolve(siteUrl),/SCOPE_INVALID/);assert.ok(!calls.some(c=>['DELETE','PATCH'].includes(c.init.method)));}finally{global.fetch=old;}
});
test('Graph maps administrator rights, invalid site and Retry-After safely without leaking raw provider errors',async()=>{
 const setup=load('v2/lib/integrations/sharepoint-setup.ts'),old=global.fetch;try{for(const [status,code]of [[403,'MEMBER_ACCESS_REQUIRED'],[404,'RESOURCE_NOT_FOUND'],[429,'RATE_LIMITED'],[503,'PROVIDER_UNAVAILABLE']]){global.fetch=async()=>new Response('SYNTHETIC-SECRET-RESPONSE',{status,headers:{'Retry-After':'120'}});await assert.rejects(new setup.SetupGraph(()=> 'token').resolve(siteUrl),e=>e.message.endsWith(code)&&!e.message.includes('SECRET')&&(!(status===429||status===503)||e.retryAfter===120));}}finally{global.fetch=old;}
});
function fixture({organisation=org,microsoftTenant=tenant,denied=false,foreignSite=false,verification='Verified',failSite=false,identityFailure=false}={}){
 const calls=[],states=new Map(),selected=[{id:siteRecord,site_url:siteUrl},{id:guid(12),site_url:'https://customer.sharepoint.com/sites/Projects'}];
 const admin={from:table=>{let filters={},value;const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q;},in:(_k,ids)=>{filters.ids=ids;return q;},insert:v=>{calls.push({table,insert:v});if(table==='v2_integration_oauth_states')states.set(v.state_hash,v);return Promise.resolve({});},update:v=>{value=v;return q;},then:(yes,no)=>Promise.resolve(table==='v2_sharepoint_sites'&&!value?{data:foreignSite?[]:selected.filter(s=>filters.ids?.includes(s.id))}:{data:null}).then(r=>{if(value)calls.push({table,update:value,filters});return r;}).then(yes,no)};return q;},rpc:async(_name,args)=>{const row=states.get(args.p_hash);if(!row||row.actor_id!==args.p_actor||row.organisation_id!==args.p_org||row.provider!==args.p_provider||row.consumed_at||Date.parse(row.expires_at)<=Date.now())return{error:true};row.consumed_at=new Date().toISOString();return{data:row};}};
 const mocks={'@/lib/integrations/session-binding':{integrationSessionHash:async()=> 'synthetic-session-hash'},'@/lib/integrations/server':{integrationContext:async requested=>{if(denied||requested!==organisation)throw Error('INTEGRATION_ACCESS_DENIED');return{org:organisation,admin,context:{userId:actor}};},integrationAudit:async(...args)=>calls.push({audit:args}),integrationError:e=>({code:e.message,message:e.message})},'@/lib/integrations/sharepoint-locations':{connectedMicrosoft:async()=>({id:integration,tenant_id:microsoftTenant}),siteUrl:s=>s,verifyCandidateSite:async(_org,id)=>{calls.push({runtimeVerification:id});return{status:verification};}}};
 const realSetup=load('v2/lib/integrations/sharepoint-setup.ts');mocks['@/lib/integrations/sharepoint-setup']={...realSetup,withMicrosoftSetupSession:async(t,_code,_verifier,_nonce,operation)=>{assert.equal(t,microsoftTenant);if(identityFailure)throw realSetup.setupFailure("INTEGRATION_SETUP_OBJECT_ID_MISSING",{expectedTenantId:tenant,returnedTenantId:tenant,signature:"Valid",audience:"Valid",objectId:"Missing",access_token:"SECRET"});return operation({resolve:async url=>{if(failSite&&url.includes('Projects'))throw Error('INTEGRATION_MICROSOFT_ADMIN_REQUIRED');return{id:siteId};},grant:async(_id,target)=>{calls.push({grant:target});return{id:'safe-permission'};}});}};
 return {start:load('v2/app/api/integrations/sharepoint/site-authorisation/route.ts',mocks).POST,callback:load('v2/app/api/integrations/sharepoint/site-authorisation/callback/route.ts',mocks).GET,calls,states,selected};
}
const next=require(path.join(root,'v2/node_modules/next/server'));
function startRequest(sites,organisation=org){return new next.NextRequest('http://localhost:3001/api/integrations/sharepoint/site-authorisation',{method:'POST',headers:{origin:'http://localhost:3001','Content-Type':'application/json'},body:JSON.stringify({organisation,sites})});}
function callbackRequest(response,overrideState){const cookie=response.cookies.get('tt-sharepoint-setup').value,state=overrideState??cookie.split('.')[1];return new next.NextRequest('http://localhost:3001/api/integrations/sharepoint/site-authorisation/callback?state='+encodeURIComponent(state)+'&code=SYNTHETIC-CODE',{headers:{cookie:'tt-sharepoint-setup='+cookie}});}
test('start binds hashed one-time state to org/actor/tenant/sites and HttpOnly cookie; callback grants only selected sites and verifies runtime',async()=>{const restore=env();try{const f=fixture(),response=await f.start(startRequest([siteRecord]));assert.equal(response.status,200);const stored=f.calls.find(c=>c.insert).insert;assert.equal(stored.actor_id,actor);assert.equal(stored.organisation_id,org);assert.equal(stored.expected_tenant,tenant);assert.equal(stored.provider,'sharepoint_setup');assert.equal(stored.setup_payload.sites.length,1);assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));assert.ok(!JSON.stringify(stored).includes('SECRET'));const result=await f.callback(callbackRequest(response));assert.ok(result.headers.get('location').endsWith('result=site_authorisation'));assert.deepEqual(f.calls.filter(c=>c.grant).map(c=>c.grant),[runtimeId]);assert.ok(f.calls.some(c=>c.runtimeVerification===siteRecord));assert.equal(f.calls.find(c=>c.update?.setup_results).update.setup_results[0].status,'Verified');assert.ok(!JSON.stringify(f.calls).includes('SYNTHETIC-CODE'));assert.equal((await f.callback(callbackRequest(response))).headers.get('location').includes('failed'),true);}finally{restore();}});
test('RBAC/entitlement context denial, cross-org site IDs, wrong org, invalid/expired state all prevent grants',async()=>{const restore=env();try{for(const options of [{denied:true},{foreignSite:true}]){const f=fixture(options);assert.equal((await f.start(startRequest([siteRecord]))).status,403);assert.equal(f.states.size,0);}const f=fixture();assert.equal((await f.start(startRequest([siteRecord],guid(20)))).status,403);const response=await f.start(startRequest([siteRecord]));await f.callback(callbackRequest(response,'wrong-state'));assert.equal(f.calls.filter(c=>c.grant).length,0);for(const row of f.states.values())row.expires_at='2000-01-01T00:00:00Z';await f.callback(callbackRequest(response));assert.equal(f.calls.filter(c=>c.grant).length,0);}finally{restore();}});
test('mixed multi-site results retain successes, pending runtime verification never becomes Verified, no Microsoft token storage',async()=>{const restore=env();try{const f=fixture({failSite:true}),response=await f.start(startRequest([siteRecord,guid(12)]));await f.callback(callbackRequest(response));const results=f.calls.find(c=>c.update?.setup_results).update.setup_results;assert.deepEqual(results.map(r=>r.status),['Verified','Attention Required']);assert.equal(f.calls.filter(c=>c.runtimeVerification).length,1);const pending=fixture({verification:'Permission Required'}),s=await pending.start(startRequest([siteRecord]));await pending.callback(callbackRequest(s));assert.equal(pending.calls.find(c=>c.update?.setup_results).update.setup_results[0].status,'Authorised');assert.ok(!JSON.stringify(f.calls).includes('access_token'));assert.ok(!JSON.stringify(f.calls).includes('refresh_token'));}finally{restore();}});
test('revocation is explicitly unavailable rather than acquiring unattended FullControl; runtime workers cannot use setup identity',async()=>{const restore=env();try{const f=fixture();const request=new next.NextRequest('http://localhost:3001/api/integrations/sharepoint/site-authorisation',{method:'POST',headers:{origin:'http://localhost:3001'},body:JSON.stringify({organisation:org,operation:'revoke',sites:[siteRecord]})});assert.match((await(await f.start(request)).json()).code,/REVOCATION_MANUAL_REQUIRED/);assert.equal(f.states.size,0);for(const file of ['v2/lib/integrations/sharepoint.ts','v2/app/api/integrations/sharepoint/worker/route.ts'])assert.ok(!fs.readFileSync(path.join(root,file),'utf8').includes('MICROSOFT_SETUP_CLIENT'));}finally{restore();}});


test('same platform setup app connects independent customer tenants without callback/site cross-use',async()=>{
 const restore=env();try{
  const a=fixture(),orgB=guid(21),tenantB=guid(22),b=fixture({organisation:orgB,microsoftTenant:tenantB});
  const startA=await a.start(startRequest([siteRecord])),startB=await b.start(startRequest([siteRecord],orgB));
  const urlA=new URL((await startA.json()).url),urlB=new URL((await startB.json()).url);
  assert.equal(urlA.searchParams.get('client_id'),urlB.searchParams.get('client_id'));assert.ok(urlA.pathname.includes(tenant));assert.ok(urlB.pathname.includes(tenantB));
  await b.callback(callbackRequest(startA));assert.equal(b.calls.filter(c=>c.grant).length,0);
  await a.callback(callbackRequest(startA));await b.callback(callbackRequest(startB));
  assert.equal(a.calls.filter(c=>c.grant).length,1);assert.equal(b.calls.filter(c=>c.grant).length,1);
  assert.ok(a.calls.filter(c=>c.update).every(c=>c.filters.organisation_id===org));assert.ok(b.calls.filter(c=>c.update).every(c=>c.filters.organisation_id===orgB));
  const mismatch=fixture(),response=await mismatch.start(startRequest([siteRecord]));for(const row of mismatch.states.values())row.expected_tenant=tenantB;
  await mismatch.callback(callbackRequest(response));assert.equal(mismatch.calls.filter(c=>c.grant).length,0);
 }finally{restore();}
});

test('real JOSE signature verification rejects tampering, invalid tenant issuer, nonce and audience',async()=>{
 const restore=env(),oldFetch=global.fetch,jose=require(path.join(root,'v2/node_modules/jose'));const {privateKey,publicKey}=await jose.generateKeyPair('RS256');
 let claims={tid:tenant,nonce:'nonce',oid:guid(10)},audience=setupId,issuer=`https://login.microsoftonline.com/${tenant}/v2.0`,token;
 const setup=load('v2/lib/integrations/sharepoint-setup.ts',{jose:{...jose,createRemoteJWKSet:()=>publicKey}});
 const sign=()=>new jose.SignJWT(claims).setProtectedHeader({alg:'RS256'}).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 global.fetch=async()=>Response.json({access_token:'SYNTHETIC-DELEGATED-TOKEN',id_token:token,scope:'Sites.FullControl.All'});
 try{
  token=await sign();assert.equal(await setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>true),true);
  const original=token;token=token.split('.').slice(0,2).join('.')+'.'+Buffer.from('invalid').toString('base64url');await assert.rejects(setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>assert.fail()));
  token=original;audience=runtimeId;token=await sign();await assert.rejects(setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>assert.fail()));
  audience=setupId;issuer=`https://login.microsoftonline.com/${guid(22)}/v2.0`;token=await sign();await assert.rejects(setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>assert.fail()));
  issuer=`https://login.microsoftonline.com/${tenant}/v2.0`;claims={...claims,nonce:'wrong'};token=await sign();await assert.rejects(setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>assert.fail()),/WRONG_TENANT|NONCE_INVALID/);
 }finally{restore();global.fetch=oldFetch;}
});


test('site register makes native authorisation primary, explains missing setup app and keeps PowerShell advanced',()=>{
 const React=require(path.join(root,'v2/node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'v2/node_modules/react-dom/server'));
 function render(setupReady,manage=true){let index=0;const values=[{configured:true,setupReady,connection:{tenant_id:tenant,microsoft_tenant_verified_at:'2026-10-12T00:00:00Z',status:'setup_required'},sites:[{id:siteRecord,site_name:'Training',site_url:siteUrl,permission_status:'candidate',is_active:true}],locations:[],rules:[],profiles:[],jobs:[],types:[],capabilities:[],authorisationResults:[{id:siteRecord,status:'Attention Required',message:'Microsoft administrator required',code:'INTEGRATION_MICROSOFT_ADMIN_REQUIRED'}]},'SharePoint Sites',false,'','',[siteRecord]];
 const component=load('v2/components/integrations/sharepoint-workspace.tsx',{react:{...React,useState:initial=>[index<values.length?values[index++]:typeof initial==='function'?initial():initial,()=>{}],useEffect:()=>{},useCallback:fn=>fn},'@/components/people/configuration-surface':{ConfigurationSurface:()=>null},'@/components/people/token-input':{TokenInput:()=>null},'@/components/materials/workflow-controls':{ChoicePicker:()=>null}});
 return renderToStaticMarkup(React.createElement(component.SharePointWorkspace,{organisation:org,manage,permissions:{}}));
 }
 const missing=render(false);assert.match(missing,/<button[^>]*disabled=""[^>]*>Approve Selected/);assert.match(missing,/Microsoft approval is not available yet/);assert.match(missing,/<summary>Advanced \/ Manual Setup<\/summary>/);assert.match(missing,/Manual PowerShell Authorisation/);assert.doesNotMatch(missing,/Sites.FullControl.All/);
 const ready=render(true);assert.match(ready,/<button class="tt-button-primary">Approve Selected/);assert.match(ready,/Retry Failed/);assert.match(ready,/A Microsoft administrator needs to approve access/);
 const readOnly=render(true,false);assert.match(readOnly,/<button[^>]*disabled=""[^>]*>Approve Selected/);
});

test('PKCE/nonce mismatch or changed candidate URL fails before delegated exchange and grants',async()=>{
 const restore=env();try{for(const tamper of ['challenge','nonce_hash','session_hash','site_url']){const f=fixture(),response=await f.start(startRequest([siteRecord]));for(const row of f.states.values()){if(tamper==='site_url')row.setup_payload.sites=[{id:siteRecord,site_url:'https://foreign.sharepoint.com/sites/Elsewhere'}];else row.setup_payload[tamper]='wrong';}await f.callback(callbackRequest(response));assert.equal(f.calls.filter(c=>c.grant).length,0);}}finally{restore();}
});


test('setup session binding uses verified Supabase session identity and rejects same actor in another login session',async()=>{
 let claims={sub:actor,session_id:guid(30)},error=null;
 const module=load('v2/lib/integrations/session-binding.ts',{'@/lib/supabase/server':{createSupabaseServer:async()=>({auth:{getClaims:async()=>({data:{claims},error})}})}});
 const first=await module.integrationSessionHash(actor);claims.session_id=guid(31);assert.notEqual(await module.integrationSessionHash(actor),first);claims.sub=guid(32);await assert.rejects(module.integrationSessionHash(actor),/SESSION_INVALID/);claims.sub=actor;error=Error('unverified');await assert.rejects(module.integrationSessionHash(actor),/SESSION_INVALID/);
});


test('missing profile/oid reproduces old rejection; profile request retains every identity check with specific diagnostics',async()=>{
 const restore=env(),oldFetch=global.fetch,jose=require(path.join(root,'v2/node_modules/jose'));
 const {privateKey,publicKey}=await jose.generateKeyPair('RS256');let claims={tid:tenant,nonce:'nonce'};
 const sign=()=>new jose.SignJWT(claims).setProtectedHeader({alg:'RS256'}).setIssuer(`https://login.microsoftonline.com/${tenant}/v2.0`).setAudience(setupId).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 let token=await sign();const setup=load('v2/lib/integrations/sharepoint-setup.ts',{jose:{...jose,createRemoteJWKSet:()=>publicKey}});
 global.fetch=async()=>Response.json({id_token:token,access_token:'OPAQUE-SYNTHETIC',scope:'Sites.FullControl.All'});
 try{await assert.rejects(setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>assert.fail()),error=>{assert.equal(error.message,'INTEGRATION_SETUP_OBJECT_ID_MISSING');assert.equal(error.diagnostics.signature,'Valid');assert.equal(error.diagnostics.tenantMatch,'Yes');assert.equal(error.diagnostics.audience,'Valid');assert.equal(error.diagnostics.objectId,'Missing');assert.equal(error.diagnostics.administrator,'Not checked');return true;});claims={...claims,oid:guid(10)};token=await sign();assert.equal(await setup.withMicrosoftSetupSession(tenant,'code','v','nonce',async()=>true),true);assert.ok(new URL(setup.setupAuthorisationUrl(tenant,'s','n','c')).searchParams.get('scope').split(' ').includes('profile'));}finally{restore();global.fetch=oldFetch;}
});

test('safe token diagnostics distinguish tenant, issuer, audience, nonce, client, missing scopes/tokens and expiry',async()=>{
 const restore=env(),oldFetch=global.fetch,jose=require(path.join(root,'v2/node_modules/jose')),{privateKey,publicKey}=await jose.generateKeyPair('RS256');
 const setup=load('v2/lib/integrations/sharepoint-setup.ts',{jose:{...jose,createRemoteJWKSet:()=>publicKey}});const base={tid:tenant,nonce:'nonce',oid:guid(10)};
 try{for(const scenario of [
 {claims:{tid:guid(40)},code:'WRONG_TENANT',key:'tenantMatch',value:'No'},
 {issuer:'https://invalid.example',code:'ISSUER_INVALID',key:'issuer',value:'Invalid'},
 {audience:runtimeId,code:'AUDIENCE_INVALID',key:'audience',value:'Invalid'},
 {claims:{nonce:'wrong'},code:'NONCE_INVALID',key:'nonce',value:'Invalid'},
 {claims:{azp:runtimeId},code:'CLIENT_INVALID'},
 {scope:'Sites.Read.All',code:'DELEGATED_SCOPE_MISSING',key:'delegatedScope',value:'Missing'},
 {missing:'id_token',code:'ID_TOKEN_MISSING'},
 {missing:'access_token',code:'ACCESS_TOKEN_MISSING'},
 {expires:'-5m',code:'TOKEN_TIME_INVALID'}
 ]){
 const token=await new jose.SignJWT({...base,...scenario.claims}).setProtectedHeader({alg:'RS256'}).setIssuer(scenario.issuer??`https://login.microsoftonline.com/${tenant}/v2.0`).setAudience(scenario.audience??setupId).setIssuedAt().setExpirationTime(scenario.expires??'5m').sign(privateKey);
 const response={id_token:token,access_token:'SYNTHETIC-ACCESS-SECRET',scope:scenario.scope??'Sites.FullControl.All'};if(scenario.missing)delete response[scenario.missing];
 global.fetch=async()=>Response.json(response);await assert.rejects(setup.withMicrosoftSetupSession(tenant,'SYNTHETIC-CODE','v','nonce',async()=>assert.fail()),error=>{assert.equal(error.message,'INTEGRATION_SETUP_'+scenario.code);if(scenario.key)assert.equal(error.diagnostics[scenario.key],scenario.value);const safe=JSON.stringify(setup.safeSetupDiagnostics(error));assert.ok(!safe.includes(token));assert.ok(!safe.includes('SECRET'));assert.ok(!safe.includes('SYNTHETIC-CODE'));return true;});
 }}finally{restore();global.fetch=oldFetch;}
});

test('Microsoft error codes distinguish consent, enterprise app installation and PKCE without exposing raw descriptions',async()=>{
 const restore=env(),oldFetch=global.fetch,setup=load('v2/lib/integrations/sharepoint-setup.ts');
 try{for(const [code,expected]of [[65001,'CONSENT_MISSING'],[65004,'CONSENT_MISSING'],[700016,'APP_NOT_INSTALLED'],[7000229,'APP_NOT_INSTALLED'],[501481,'PKCE_INVALID'],[7000215,'TOKEN_EXCHANGE_FAILED']]){global.fetch=async()=>Response.json({error_codes:[code],error_description:'SECRET raw auth code'},{status:400});await assert.rejects(setup.withMicrosoftSetupSession(tenant,'SECRET-CODE','v','nonce',async()=>assert.fail()),error=>{assert.ok(error.message.endsWith(expected));assert.ok(!JSON.stringify(error).includes('SECRET'));return true;});}}finally{restore();global.fetch=oldFetch;}
});

test('diagnostic allowlist excludes tokens, arbitrary claims, client secrets and provider error strings',()=>{
 const setup=load('v2/lib/integrations/sharepoint-setup.ts');assert.deepEqual(setup.safeSetupDiagnostics({diagnostics:{signature:'Valid',expectedTenantId:tenant,returnedTenantId:'SECRET',access_token:'SECRET',clientSecret:'SECRET',issuer:'https://bad.example/?secret=value',nonce:'SECRET'}}),{signature:'Valid',expectedTenantId:tenant});
});

test('site access and administrator grant capability failures have independent safe evidence',async()=>{
 const old=global.fetch,setup=load('v2/lib/integrations/sharepoint-setup.ts');
 try{global.fetch=async()=>new Response('SECRET',{status:403});const graph=new setup.SetupGraph(()=> 'secret');await assert.rejects(graph.resolve(siteUrl),error=>error.message==='INTEGRATION_SITE_MEMBER_ACCESS_REQUIRED'&&error.diagnostics.siteMembership.startsWith('Failed'));
 global.fetch=async(_url,init)=>init.method==='POST'?new Response('SECRET',{status:403}):Response.json({value:[]});await assert.rejects(new setup.SetupGraph(()=> 'secret').grant(siteId,runtimeId),error=>error.message==='INTEGRATION_MICROSOFT_ADMIN_REQUIRED'&&error.diagnostics.administrator.startsWith('Failed'));
 }finally{global.fetch=old;}
});

test('UI exposes labelled safe diagnostics and explicitly marks checks not reached',()=>{
 const React=require(path.join(root,'v2/node_modules/react')),{renderToStaticMarkup}=require(path.join(root,'v2/node_modules/react-dom/server'));
 const {MicrosoftSetupDiagnostics}=load('v2/components/integrations/microsoft-setup-diagnostics.tsx');const html=renderToStaticMarkup(React.createElement(MicrosoftSetupDiagnostics,{diagnostics:{signature:'Valid',expectedTenantId:tenant,returnedTenantId:tenant,audience:'Valid',objectId:'Missing',administrator:'Not checked'}}));assert.match(html,/ID Token Signature/);assert.match(html,/Expected Tenant ID/);assert.match(html,/Not checked/);assert.ok(!html.includes('access_token'));
});


test('callback persists only allowlisted stage diagnostics and exact error code, with no delegated or raw tokens',async()=>{
 const restore=env();try{const f=fixture({identityFailure:true}),response=await f.start(startRequest([siteRecord]));await f.callback(callbackRequest(response));const result=f.calls.find(c=>c.update?.setup_results).update.setup_results[0];assert.equal(result.code,'INTEGRATION_SETUP_OBJECT_ID_MISSING');assert.equal(result.diagnostics.objectId,'Missing');assert.equal(result.diagnostics.signature,'Valid');assert.equal(result.diagnostics.returnedTenantId,tenant);assert.ok(!JSON.stringify(result).includes('SECRET'));assert.ok(!('access_token' in result.diagnostics));assert.equal(f.calls.filter(c=>c.grant).length,0);}finally{restore();}
});


test('profile thumbnail proxy downloads only bounded display bytes and never forwards Graph bearer to provider content',async()=>{
 const restore=env(),oldFetch=global.fetch,calls=[];
 const token='header.'+Buffer.from(JSON.stringify({tid:tenant,azp:runtimeId,roles:['Sites.Selected']})).toString('base64url')+'.signature';
 global.fetch=async(url,init)=>{calls.push({url,init});if(url.includes('/oauth2/'))return Response.json({access_token:token});if(url.includes('graph.microsoft.com'))return new Response(null,{status:302,headers:{location:'https://customer.sharepoint.com/thumbnail-content'}});return new Response(new Uint8Array([255,216,255]),{headers:{'Content-Type':'image/jpeg'}});};
 try{const {graphForSite}=load('v2/lib/integrations/sharepoint.ts');const graph=await graphForSite({tenant_id:tenant,site_id:siteId,drive_id:'library'});const result=await graph.thumbnail('stable-item');assert.equal(result.mime,'image/jpeg');assert.equal(result.bytes.length,3);assert.ok(calls.some(c=>c.url.includes('/thumbnails/0/small/content')));const provider=calls.find(c=>c.url.includes('/thumbnail-content'));assert.equal(provider.init.headers,undefined);assert.equal(provider.init.redirect,'error');assert.ok(!calls.some(c=>c.url.endsWith('/items/stable-item/content')));}finally{global.fetch=oldFetch;restore();}
});

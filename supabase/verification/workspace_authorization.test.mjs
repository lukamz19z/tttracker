import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const dependency = createRequire(import.meta.url);
import { test  } from "node:test";import assert from "node:assert/strict";
import fs from "node:fs";import path from "node:path";const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const ts=dependency(path.join(root,'v2/node_modules/typescript'));
function load(file,mocks) {const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const exports={};new Function('require','exports',code)(name=>{if(name==='server-only')return {};if(name in mocks)return mocks[name];throw Error(`Unexpected import ${name}`);},exports);return exports;}
function platform({status='active',role='owner',record=true,authenticated=true}={}) {
 const calls=[];
 const admin={from(table){calls.push(table);const filters={};return {select(){return this;},eq(k,v){filters[k]=v;return this;},async maybeSingle(){return {data:record&&status===filters.status?{user_id:'user',role,status,display_name:'Neutral Operator'}:null,error:null};}};}};
 const mocks={'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');},redirect:()=>{throw Error('LOGIN_REQUIRED');}},'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'@/lib/supabase/server':{createSupabaseServer:async()=>({auth:{getClaims:async()=>({data:{claims:authenticated?{sub:'user',email:'operator@example.test'}:{}},error:null})}})}};
 return {api:load('v2/lib/platform/server.ts',mocks),calls};
}
test('active canonical platform record authorizes platform console only',async()=>{const p=platform();assert.equal((await p.api.requirePlatformAdmin()).userId,'user');assert.equal(await p.api.isPlatformAdmin('user'),true);assert.deepEqual(p.calls,['v2_platform_admins','v2_platform_admins']);});
test('organisation administrator without platform record is denied',async()=>{const p=platform({record:false});assert.equal(await p.api.isPlatformAdmin('user'),false);await assert.rejects(p.api.requirePlatformAdmin(),/FORBIDDEN/);await assert.rejects(p.api.requirePlatformPage(),/NOT_FOUND/);});
test('suspended platform user is denied even with privileged platform role',async()=>{const p=platform({status:'suspended'});assert.equal(await p.api.isPlatformAdmin('user'),false);await assert.rejects(p.api.requirePlatformAdmin(),/FORBIDDEN/);});
test('platform support permissions do not include owner/admin-only writes',async()=>{const p=platform({role:'support'});await p.api.requirePlatformAdmin();await assert.rejects(p.api.requirePlatformAdmin(['owner','admin']),/FORBIDDEN/);});
test('unauthenticated platform request cannot read authority table',async()=>{const p=platform({authenticated:false});await assert.rejects(p.api.requirePlatformAdmin(),/UNAUTHENTICATED/);assert.deepEqual(p.calls,[]);});
for(const [file,capability] of [['v2/app/api/settings/project-identifier/route.ts','organisation.settings.configure'],['v2/app/api/projects/route.ts','projects.create']]) {
 test(`${capability} mutation checks dynamic permission before any service write`,async()=>{
  let writes=0,requested;
  const api=load(file,{'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},'@/lib/workspace/context':{requireWorkspacePermission:async(org,permission)=>{requested=[org,permission];throw Error('WORKSPACE_PERMISSION_DENIED');}},'@/lib/supabase/admin':{createSupabaseAdmin:()=>{writes++;throw Error('Unexpected write');}},'@/lib/projects/numbering':{}});
  const result=await api.POST({json:async()=>({organisationId:'org-a'})});assert.equal(result.status,403);assert.deepEqual(requested,['org-a',capability]);assert.equal(writes,0);
 });
}

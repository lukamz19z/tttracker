import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const dependency = createRequire(import.meta.url);
import { test  } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");const ts=dependency(path.join(root,"v2/node_modules/typescript"));
const own={id:"org-a",code:"ORG",name:"Neutral Organisation"};
const sections=[['workspace_home','Home','',null],['workspace_projects','Projects','projects','projects'],['workspace_people','People','people','people'],['workspace_assets','Assets','assets','assets'],['workspace_settings','Settings','settings',null]].map(([section_key,label,route_segment,module_key])=>({section_key,label,route_segment,module_key,sort_order:10,implementation_status:'ready',default_enabled:true}));
function harness({orgs=[own],modules=['projects','people'],permissions={'projects.view':true,'people.view':true},platform=false,partyProjects=[],cookie,setupStatus='completed'}={}) {
 const calls=[];
 const admin={from(table){const filters={};const builder={select(){return this;},eq(k,v){filters[k]=v;return this;},neq(){return this;},order(){return this;},async maybeSingle(){if(table==='v2_organisation_setup_state')return {data:{status:setupStatus}};if(table==='v2_platform_admins')return {data:platform?{role:'owner'}:null,error:null};throw Error(table);},then(resolve,reject){let data;
 if(table==='organisation_users') data=orgs.map(organisations=>({organisations}));
 else if(table==='v2_section_definitions')data=sections;
 else if(table==='v2_organisation_section_settings')data=[];
 else if(table==='organisation_modules')data=modules.map(module_key=>({module_key}));
 else throw Error(table);
 return Promise.resolve({data,error:null}).then(resolve,reject);}};calls.push(table);return builder;}};
 const session={auth:{getClaims:async()=>({data:{claims:{sub:'user',email:'user@example.test'}}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:{modules,permissions},error:null};}};
 const mocks={
 'server-only':{},'next/headers':{cookies:async()=>({get:()=>cookie?{value:cookie}:undefined})},
 'next/navigation':{notFound:()=>{throw Error('NOT_FOUND');},redirect:(route)=>{throw Error(`REDIRECT:${route}`);}},
 '@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'@/lib/supabase/server':{createSupabaseServer:async()=>session},
 '@/lib/platform/server':{isPlatformAdmin:async()=>platform},
 '@/lib/projects/list':{listAccessibleProjects:async(id)=>partyProjects.filter(p=>!id||p.organisationId===id)},
 '@/lib/projects/access':{resolveProjectAccess:async()=>({kind:'party',hostOrganisationId:'host-org',parties:[{id:'party',organisationId:'client-org',name:'Neutral Client'}]})},
 '@/lib/projects/access-selection':{selectProjectParticipant:(a)=>a},
 };
 function load(file){const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','exports',code)(name=>{if(name in mocks)return mocks[name];if(name==='./navigation')return load('v2/lib/workspace/navigation.ts');if(name==='@/lib/workspace/context')return load('v2/lib/workspace/context.ts');throw Error(name);},exports);return exports;}
 return {context:load('v2/lib/workspace/context.ts'),list:load('v2/lib/projects/list-context.ts'),calls};
}
test('workspace context filters real section catalogue using module and permission access',async()=>{
 const h=harness();const c=await h.context.requireWorkspaceContext('org-a');assert.equal(c.contextKind,'organisation');assert.deepEqual(c.sections.map(s=>s.key),['workspace_home','workspace_projects','workspace_people']);assert.equal(c.organisation.organisationName,'Neutral Organisation');assert.ok(!h.calls.some(c=>Array.isArray(c)&&c[0]==='tttracker_v2_project_access'));
});
test('direct configure boundary rejects view-only organisation user',async()=>{
 const h=harness({permissions:{'organisation.settings.view':true}});await assert.rejects(h.context.requireWorkspacePermission('org-a','organisation.settings.configure'),/WORKSPACE_PERMISSION_DENIED/);
});
test('direct project creation requires the dynamic create permission',async()=>{
 const h=harness();await assert.rejects(h.context.requireWorkspacePermission('org-a','projects.create'),/WORKSPACE_PERMISSION_DENIED/);
});
test('explicit unknown organisation never falls back to another tenant',async()=>{
 await assert.rejects(harness().context.requireWorkspaceContext('unrelated'),/WORKSPACE_ORGANISATION_ACCESS_DENIED/);
});
test('party-only home resolves participant identity, not host organisation',async()=>{
 const h=harness({orgs:[],partyProjects:[{id:'project',party:true,organisationId:'client-org',participantName:'Neutral Client'}]});
 const c=await h.list.requireProjectListContext('client-org');assert.equal(c.contextKind,'client');assert.equal(c.organisation.organisationId,'client-org');assert.equal(c.projectOnly,true);assert.deepEqual(c.sections.map(s=>s.label),['Home','Projects']);assert.deepEqual(c.permissions,{});
});
test('party switcher retains legitimate own memberships and permitted party contexts',async()=>{
 const h=harness({partyProjects:[{id:'project',party:true,organisationId:'client-org',participantName:'Neutral Client'}]});
 const c=await h.list.requireProjectListContext('client-org');assert.deepEqual(c.memberships.map(m=>m.organisationId),['org-a','client-org']);
});
test('revoked saved workspace preference returns to a legitimate workspace',async()=>{
 const h=harness({cookie:'revoked-org'});const c=await h.list.requireProjectListContext();assert.equal(c.organisation.organisationId,'org-a');
});
test('explicit denied organisation does not use preference recovery',async()=>{
 const h=harness({cookie:'org-a'});await assert.rejects(h.list.requireProjectListContext('revoked-org'),/WORKSPACE_ORGANISATION_ACCESS_DENIED/);
});
test('platform authority does not add tenant permissions or links',async()=>{
 const c=await harness({platform:true,permissions:{}}).context.requireWorkspaceContext('org-a');assert.equal(c.platformAdmin,true);assert.deepEqual(c.sections.map(s=>s.key),['workspace_home']);assert.equal(c.permissions['people.view'],undefined);
});

test('direct foundation pages deny unpermitted and disabled modules',async()=>{
 await assert.rejects(harness({permissions:{}}).context.requireWorkspaceSection('org-a','workspace_people'),/NOT_FOUND/);
 await assert.rejects(harness({modules:[]}).context.requireWorkspaceSection('org-a','workspace_people'),/NOT_FOUND/);
 const c=await harness().context.requireWorkspaceSection('org-a','workspace_people');assert.equal(c.organisation.organisationId,'org-a');
});

test('personal account remains accessible during tenant setup without granting capabilities',async()=>{
 const h=harness({setupStatus:'in_progress',permissions:{}});
 await assert.rejects(h.context.requireWorkspaceContext('org-a'),/REDIRECT:\/setup/);
 const c=await h.list.requireProjectListContext('org-a','personal');assert.equal(c.organisation.organisationId,'org-a');assert.deepEqual(c.permissions,{});
});

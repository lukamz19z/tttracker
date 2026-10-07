const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const ts = require(path.join(root, "v2/node_modules/typescript"));
function load(file, mocks) {
 const output = {};
 const code = ts.transpileModule(fs.readFileSync(path.join(root,file),"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 new Function("require","exports",code)(name => name === "server-only" ? {} : mocks[name], output);
 return output;
}
const policy=load('v2/lib/materials/access-policy.ts',{});
class ProjectAccessError extends Error { constructor(message,status=403){super(message);this.status=status;} }
test('Materials page handles permission/scope denial without hiding lookup or authentication failures',async()=>{
 let failure;
 const helper=load('v2/lib/materials/page-access.ts',{
  './security':{requireMaterialsContext:async()=>{if(failure)throw failure;return {allowed:true};}},
  './access-policy':policy,'@/lib/projects/access':{ProjectAccessError}
 });
 assert.deepEqual(await helper.materialsPageContext('project',null),{allowed:true});
 for(const e of [new policy.MaterialsSecurityError('MATERIALS_PERMISSION_DENIED'),new policy.MaterialsSecurityError('MATERIALS_SCOPE_DENIED'),new ProjectAccessError('MATERIALS_PERMISSION_DENIED')]){
  failure=e;assert.equal(await helper.materialsPageContext('project',null,'import'),null);
 }
 for(const e of [new Error('DATABASE_FAILURE'),new ProjectAccessError('UNAUTHENTICATED',401),new ProjectAccessError('PROJECT_ACCESS_DENIED')]){
  failure=e;await assert.rejects(helper.materialsPageContext('project',null),e);
 }
});
test('new organisation administrator seeding includes full catalogue and preserves existing denies',async()=>{
 const capabilities=['view','import','check_bundles','manage_deliveries','manage_issues','manage_movements','manage_reservations','manage_amendments','configure'];
 const grants=new Map([['import',false]]);
 const admin={from(table){return {
  select(){return this;},eq(){return this;},
  maybeSingle:async()=>({data:table==='v2_roles'?{id:'role',code:'admin'}:{status:'active'},error:null}),
  upsert:async(rows,options)=>{
   if(table==='v2_role_permissions'){
    assert.equal(options.ignoreDuplicates,true);
    for(const row of rows)if(!grants.has(row.permission_id))grants.set(row.permission_id,row.allowed);
   }
   return {error:null};
  },
  then(resolve,reject){return Promise.resolve({data:capabilities.map(id=>({id})),error:null}).then(resolve,reject);}
 };}};
 const helper=load('v2/lib/invitations/provision.ts',{'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin}});
 await helper.ensureInvitationAccess({organisationId:'org',userId:'user',roleCode:'admin',invitationId:'invite',invitedBy:null});
 assert.equal(grants.size,9);assert.equal(grants.get('import'),false);
 grants.clear();
 await helper.ensureInvitationAccess({organisationId:'new-org',userId:'new-user',roleCode:'admin',invitationId:'invite',invitedBy:null});
 assert.equal(grants.size,9);assert.ok([...grants.values()].every(Boolean));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
const ts=require(path.join(root,'v2/node_modules/typescript'));
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>name==='server-only'?{}:name in mocks?mocks[name]:name.startsWith('@/')?load('v2/'+name.slice(2)+'.ts',mocks):require(name),exports);return exports;}
const resolver=load('v2/lib/integrations/resolver.ts');
const dest={id:'d',organisation_id:'a',context:'training',root_path:'People',folder_template:'{person_display_name}/Training/{training_category}',filename_template:'{employee_number}_{training_type}_{expiry_date}.pdf',conflict_policy:'version',is_active:true,access_profile_id:'p',site_id:'s'};
test('organisation destination resolves People training folder + filename-safe dates',()=>{const d=resolver.resolveDestination(dest,'a','training',{person_display_name:'Alex / Smith',training_category:'Certificates',employee_number:'EMP-42',training_type:'CPR',expiry_date:'2027-10-04'},'operational');assert.deepEqual(d.folderSegments,['People','Alex - Smith','Training','Certificates']);assert.equal(d.filename,'EMP-42_CPR_04-10-2027.pdf');});
test('People filename tokens resolve canonical employee number, Training Type, date and evidence side',()=>{
 const values={employee_number:'EMP-0042',person_display_name:'Alex Smith',training_type:'CPR',issue_date:'2026-10-10',expiry_date:'2027-10-10',document_side:'Front'};
 assert.equal(resolver.renderPath('{employee_number}_{training_type}_{expiry_date}_{document_side}','training',values,true),'EMP-0042_CPR_10-10-2027_Front');
 assert.equal(resolver.renderPath('{employee_number} - {person_display_name}','training',values),'EMP-0042 - Alex Smith');
 assert.throws(()=>resolver.renderPath('{certificate_number}','training',values,true),/INTEGRATION_TOKEN_INVALID/);
 assert.throws(()=>resolver.renderPath('{employee_number}_{training_type}','training',{training_type:'CPR'},true),/INTEGRATION_EMPLOYEE_NUMBER_MISSING/);
});
test('front/back Training filenames use the configured side token or a collision-safe fallback',()=>{
 const values={employee_number:'1600',person_display_name:'Luka Zetovic',training_category:'Licences',training_type:'Drivers Licence',expiry_date:'2029-10-29',document_side:'Front'};
 const front=resolver.resolveDestination({...dest,filename_template:'{employee_number}_{training_type}_{expiry_date}'},'a','training',values,'operational');
 const back=resolver.resolveDestination({...dest,filename_template:'{employee_number}_{training_type}_{expiry_date}'},'a','training',{...values,document_side:'Back'},'operational');
 assert.equal(front.filename,'1600_Drivers Licence_29-10-2029 - Front');
 assert.equal(back.filename,'1600_Drivers Licence_29-10-2029 - Back');
 const explicit=resolver.resolveDestination({...dest,filename_template:'{employee_number}_{training_type}_{document_side}_{expiry_date}.pdf'},'a','training',values,'operational');
 assert.equal(explicit.filename,'1600_Drivers Licence_Front_29-10-2029.pdf');
 const single=resolver.resolveDestination({...dest,filename_template:'{employee_number}_{training_type}_{expiry_date}'},'a','training',{...values,document_side:'Single'},'operational');
 assert.equal(single.filename,'1600_Drivers Licence_29-10-2029');
});
test('wrong organisation, context, confidential collection and unsupported tokens fail closed',()=>{for(const args of [['b','training','operational'],['a','projects','operational'],['a','training','confidential']])assert.throws(()=>resolver.resolveDestination(dest,args[0],args[1],{},args[2]));assert.throws(()=>resolver.renderPath('{asset_id}','training',{asset_id:'x'}));assert.throws(()=>resolver.renderPath('../outside','projects',{}));});
test('project/asset contexts only expose canonical tokens and sanitize paths',()=>{assert.equal(resolver.renderPath('{project_number} - {project_name}/Quality','projects',{project_number:'P-001',project_name:'Example'}),'P-001 - Example/Quality');assert.equal(resolver.renderPath('{asset_type}/{registration}','assets',{asset_type:'Vehicle',registration:'TEST'}),'Vehicle/TEST');});
test('Graph layer requires server-only tenant-specific credentials, rejects unsafe scopes, maps rate limits safely',async()=>{
 const original=global.fetch;const env={...process.env};Object.assign(process.env,{TTTRACKER_MICROSOFT_CLIENT_ID:'app',TTTRACKER_MICROSOFT_CLIENT_SECRET:'SYNTHETIC',NEXT_PUBLIC_APP_URL:'https://example.test'});
 const tenant='11111111-1111-4111-8111-111111111111';let roles=['Sites.Selected'],returnedTenant=tenant;const calls=[];
 global.fetch=async(url,options)=>{calls.push([url,options]);if(url.includes('/token'))return Response.json({access_token:'x.'+Buffer.from(JSON.stringify({tid:returnedTenant,appid:'app',roles})).toString('base64url')+'.x'});return Response.json({id:'site'});};
 try{const graph=load('v2/lib/integrations/sharepoint.ts');const client=await graph.graphForSite({tenant_id:tenant,site_id:'site',drive_id:'drive'});await client.site();assert.ok(calls[0][0].includes(tenant));assert.ok(calls[1][0].endsWith('/sites/site'));returnedTenant='22222222-2222-4222-8222-222222222222';await assert.rejects(graph.graphForSite({tenant_id:tenant}),/RUNTIME_PERMISSIONS_UNSAFE/);returnedTenant=tenant;roles=['Sites.ReadWrite.All'];await assert.rejects(graph.graphForSite({tenant_id:tenant}),/RUNTIME_PERMISSIONS_UNSAFE/);assert.throws(()=>graph.graphFailure(429,'45'),e=>e.message==='INTEGRATION_RATE_LIMITED'&&e.retryAfter===45);assert.throws(()=>graph.tenantId('common'));}finally{global.fetch=original;process.env=env;}
});
test('folder lookup is idempotent and upload conflict defaults never silently replace',async()=>{
 const original=global.fetch;const env={...process.env};Object.assign(process.env,{TTTRACKER_MICROSOFT_CLIENT_ID:'app',TTTRACKER_MICROSOFT_CLIENT_SECRET:'SYNTHETIC',NEXT_PUBLIC_APP_URL:'https://example.test'});const tenant='11111111-1111-4111-8111-111111111111';const calls=[];
 global.fetch=async(url,options={})=>{calls.push([url,options]);if(url.includes('/token'))return Response.json({access_token:'x.'+Buffer.from(JSON.stringify({tid:tenant,appid:'app',roles:['Sites.Selected']})).toString('base64url')+'.x'});if(options.method==='PUT')return Response.json({error:'private provider details'},{status:409});return Response.json({id:'folder',folder:{}});};
 try{const graph=load('v2/lib/integrations/sharepoint.ts');const client=await graph.graphForSite({tenant_id:tenant,site_id:'site',drive_id:'drive'});assert.equal((await client.ensureFolder('root','Training')).id,'folder');assert.equal(calls.filter(c=>c[1].method==='POST').length,1);await assert.rejects(client.upload('folder','synthetic.pdf',new Uint8Array([1])),/INTEGRATION_CONFLICT/);assert.ok(calls.at(-1)[0].includes('conflictBehavior=fail'));await assert.rejects(client.ensureFolder('root','../bad'),/PATH_INVALID/);}finally{global.fetch=original;process.env=env;}
});
test('integration tables revoke browser access; state and job claims are atomic and tenant scoped',()=>{const sql=fs.readFileSync(path.join(root,'supabase/migrations/20261005200000_organisation_sharepoint_integration.sql'),'utf8');assert.match(sql,/revoke all on public.%I from anon,authenticated/);assert.match(sql,/consumed_at is null and expires_at>now\(\)/);assert.match(sql,/organisation_id=p_org and actor_id=p_actor/);assert.match(sql,/unique\(organisation_id,document_id,fingerprint\)/);assert.match(sql,/native_mode='inherit'/);assert.doesNotMatch(sql,/client_secret|access_token|refresh_token/);});


test('a customer tenant token cannot authorise a site in another Microsoft tenant',async()=>{
 const original=global.fetch,env={...process.env};const tenant='11111111-1111-4111-8111-111111111111';
 Object.assign(process.env,{TTTRACKER_MICROSOFT_CLIENT_ID:'app',TTTRACKER_MICROSOFT_CLIENT_SECRET:'SYNTHETIC',NEXT_PUBLIC_APP_URL:'https://example.test'});
 const calls=[];global.fetch=async(url)=>{calls.push(url);if(url.includes('/token'))return Response.json({access_token:'x.'+Buffer.from(JSON.stringify({tid:tenant,appid:'app',roles:['Sites.Selected']})).toString('base64url')+'.x'});return Response.json({error:'synthetic foreign tenant permission denied'},{status:403});};
 try{const graph=await load('v2/lib/integrations/sharepoint.ts').graphForSite({tenant_id:tenant});await assert.rejects(graph.resolveSite('https://othercustomer.sharepoint.com/sites/Operations'),/INTEGRATION_SITE_PERMISSION_REQUIRED/);assert.ok(calls[0].includes(tenant));assert.equal(calls.length,2);}finally{global.fetch=original;process.env=env;}
});


test('multiple locations use stable libraries, configurable roots and specific worker routing',()=>{
 const rule={...dest,location_id:'loc',relationship_type_id:null};const location={id:'loc',organisation_id:'a',site_id:'s',name:'Personnel',drive_id:'library-2',drive_name:'Documents',root_path:'Corporate',is_active:true};
 const result=resolver.resolveLocationDestination(rule,location,'a','training',{person_display_name:'Alex Smith',training_category:'First Aid',employee_number:'EMP-42',training_type:'CPR',expiry_date:'2027-10-04'},'operational');
 assert.equal(result.driveId,'library-2');assert.equal(result.folderSegments[0],'Corporate');assert.equal(result.filename,'EMP-42_CPR_04-10-2027.pdf');
 assert.throws(()=>resolver.resolveLocationDestination(rule,{...location,organisation_id:'b'},'a','training',{},'operational'));
 assert.equal(resolver.selectRoutingRule([rule,{...rule,id:'specific',relationship_type_id:'worker'}],'a','training','worker').id,'specific');
 assert.equal(resolver.selectRoutingRule([rule],'b','training',null),null);
});
test('bulk grant covers selected customer sites using an admin session, never runtime elevated permissions',()=>{
 const locations=load('v2/lib/integrations/sharepoint-locations.ts',{'@/lib/supabase/admin':{},'./sharepoint':{},'./server':{},'./entitlements':{},'./resolver':resolver});
 const script=locations.bulkSiteGrant('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',['https://customer.sharepoint.com/sites/People','https://customer.sharepoint.com/sites/Projects']);
 assert.match(script,/Connect-MgGraph -TenantId '22222222/);assert.match(script,/roles = @\('write'\)/);assert.match(script,/Disconnect-MgGraph/);assert.match(script,/sites\/People/);assert.match(script,/sites\/Projects/);assert.doesNotMatch(script,/client_secret|access_token|refresh_token|sites\/Other/);
 assert.throws(()=>locations.bulkSiteGrant('invalid','22222222-2222-4222-8222-222222222222',[]));assert.throws(()=>locations.siteUrl('https://attacker.example/sites/People'));
});


test('location access checks every organisation/site/library; losing one site preserves the others',async()=>{
 const sites=[{id:'s1',organisation_id:'a',integration_id:'i',site_id:'remote-1',verified_at:'yes',permission_status:'verified',is_active:true},{id:'s2',organisation_id:'a',integration_id:'i',site_id:'remote-2',verified_at:null,permission_status:'permission_required',is_active:true},{id:'s3',organisation_id:'a',integration_id:'i',site_id:'remote-3',verified_at:'yes',permission_status:'verified',is_active:true}];
 const locs=[1,2,3].map(n=>({id:'l'+n,organisation_id:'a',site_id:'s'+n,drive_id:'d'+n,is_active:true}));locs.push({id:'foreign',organisation_id:'b',site_id:'s1',drive_id:'d1',is_active:true});
 const admin={from:table=>{const filters=[];const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q},single:async()=>({data:(table==='v2_sharepoint_locations'?locs:sites).find(row=>filters.every(([key,value])=>row[key]===value))??null})};return q;}};
 const graphCalls=[];const layer=load('v2/lib/integrations/sharepoint-locations.ts',{'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'./server':{loadIntegration:async()=>({id:'i',tenant_id:'verified-a',microsoft_tenant_verified_at:'yes',status:'connected'})},'./entitlements':{},'./resolver':resolver,'./sharepoint':{graphForSite:async scope=>{graphCalls.push(scope);return {drives:async()=>[{id:scope.drive_id}]}}}});
 assert.equal((await layer.locationScope('a','l1')).location.drive_id,'d1');
 await assert.rejects(layer.locationScope('a','l2'),/SITE_PERMISSION_REQUIRED/);
 assert.equal((await layer.locationScope('a','l3')).location.drive_id,'d3');
 await assert.rejects(layer.locationScope('a','foreign'),/SCOPE_INVALID/);
 assert.equal(graphCalls.length,2);assert.ok(graphCalls.every(c=>c.tenant_id==='verified-a'));
});


test('person folder provisioning reuses stable IDs and rename preserves parent and contents',async()=>{
 const rule={...dest,context:'people',folder_template:'{person_display_name}',location_id:'loc',rename_policy:'keep',child_folders:[]};
 const item={id:'stable-folder',name:'Original Name',folder:{},eTag:'version-1',contents:['certificate.pdf']};let renames=0,creates=0,saved;
 const tables={v2_document_destinations:rule,v2_integration_access_profiles:{classification:'operational',native_mode:'inherit'},v2_people:{id:'person',display_name:'New Name',employee_number:'EMP-42',relationship_type_id:null},v2_sharepoint_locations:{id:'loc',organisation_id:'a',site_id:'s',drive_id:'library',root_path:'People',is_active:true},v2_sharepoint_sites:{id:'s',organisation_id:'a',integration_id:'i',site_id:'remote-site',verified_at:'yes',permission_status:'verified',is_active:true},v2_sharepoint_folder_links:{drive_item_id:'stable-folder',site_id:'remote-site',drive_id:'library',parent_item_id:'original-parent',path_snapshot:'People/Original Name'}};
 const admin={rpc:async()=>({data:true}),from:table=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:tables[table]}),maybeSingle:async()=>({data:tables[table]}),upsert:async value=>{saved=value;return {error:null}}};return q;}};
 const graph={drives:async()=>[{id:'library'}],metadata:async()=>item,child:async()=>null,ensureFolder:async()=>{creates++;return item},renameFolder:async(id,name,etag)=>{assert.equal(id,'stable-folder');assert.equal(etag,'version-1');renames++;item.name=name;return item}};
 const layer=load('v2/lib/integrations/sharepoint-locations.ts',{'@/lib/supabase/admin':{createSupabaseAdmin:()=>admin},'./server':{loadIntegration:async()=>({id:'i',tenant_id:'customer',microsoft_tenant_verified_at:'yes',status:'connected'}),integrationAudit:async()=>{}},'./entitlements':{requireIntegrationEntitlement:async()=>{}},'./resolver':resolver,'./sharepoint':{graphForSite:async()=>graph}});
 const job={rule_id:'d',location_id:'loc',entity_kind:'person',entity_id:'person',actor_id:'actor'};
 assert.equal(await layer.provisionFolder('a',job),'existing');assert.equal(creates,0);assert.equal(renames,0);assert.equal(saved.drive_item_id,'stable-folder');
 rule.rename_policy='rename';assert.equal(await layer.provisionFolder('a',job),'renamed');assert.equal(saved.drive_item_id,'stable-folder');assert.equal(saved.parent_item_id,'original-parent');assert.deepEqual(item.contents,['certificate.pdf']);assert.equal(renames,1);
 assert.equal(await layer.provisionFolder('a',job),'existing');assert.equal(renames,1);assert.equal(creates,0);
});


test('Microsoft retry policy honors seconds, HTTP-date and transient provider errors',()=>{
 const graph=load('v2/lib/integrations/sharepoint.ts');
 assert.throws(()=>graph.graphFailure(503,'120'),e=>e.message==='INTEGRATION_PROVIDER_UNAVAILABLE'&&e.retryAfter===120);
 const until=new Date(Date.now()+60000).toUTCString();assert.throws(()=>graph.graphFailure(429,until),e=>e.message==='INTEGRATION_RATE_LIMITED'&&e.retryAfter>=59&&e.retryAfter<=60);
 assert.throws(()=>graph.graphFailure(500,'invalid'),e=>e.retryAfter===30);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
const ts=require(path.join(root,'v2/node_modules/typescript'));
const next=require(path.join(root,'v2/node_modules/next/server'));
function load(file,mocks={}){const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('require','exports',code)(name=>name in mocks?mocks[name]:require(name),exports);return exports;}
function fixture(){
 const calls=[];let current={person_id:'person-a',name:'Alex Smith',document_id:'photo-a',version:'photo-a',can_manage:true,pending:false};
 const state={denied:false,uploadFailure:false};
 const doc={id:'photo-a',sharepoint_etag:'version-a'};
 const session={rpc:async(name,args)=>{calls.push({rpc:name,args});if(state.denied)return {error:{message:'PEOPLE_PERMISSION_DENIED'}};if(args.p_action==='scope')return {data:{id:'person-a',display_name:'Alex Smith',source:'admin_upload'}};if(args.p_action==='assign')current={...current,document_id:args.p_document};if(args.p_action==='remove')current={...current,document_id:null};return {data:{id:current.document_id}};}};
 const q={update:()=>q,eq:()=>q,then:resolve=>resolve({error:null})};
 const route=load('v2/app/api/people/profile-photo/route.ts',{
 'next/server':next,'next/navigation':{unstable_rethrow:()=>{}},
 '@/lib/people/server':{requirePeopleContext:async()=>({organisation:{organisationId:'org-a'},userId:'user-a',permissions:{'people.profile_photo.view':true,'people.profile_photo.manage':true}}),peopleError:e=>({status:e.message.includes('PERMISSION')?403:422,error:e.message})},
 '@/lib/supabase/server':{createSupabaseServer:async()=>session},'@/lib/supabase/admin':{createSupabaseAdmin:()=>({from:()=>q})},
 '@/lib/people/profile-photo':{resolvePersonPhoto:async(org,person)=>{calls.push({resolve:{org,person}});if(state.denied)throw Error('PEOPLE_PERMISSION_DENIED');return current;},photoDocumentInput:person=>({personId:person.id}),personPhotoThumbnail:async()=>{calls.push({thumbnail:true});return {bytes:new Uint8Array([255,216,255]),mime:'image/jpeg'};},publishPendingProfilePhotos:async()=>({published:0,deferred:0})},
 '@/lib/documents/service':{getDocumentMetadata:async()=>doc,uploadDocument:async()=>{calls.push({upload:true});if(state.uploadFailure)throw Error('DOCUMENT_PROVIDER_UNAVAILABLE');return {id:'photo-b'};},documentError:e=>({error:e.message})}
 });
 return {route,state,calls,current:()=>current};
}
const get=(extra='',headers={})=>new next.NextRequest('http://localhost:3001/api/people/profile-photo?organisation=org-a'+extra,{headers});
function post(action='upload',origin='http://localhost:3001'){const body=new FormData();body.set('organisation','org-a');body.set('person','person-a');body.set('action',action);if(action==='upload')body.set('file',new File([new Uint8Array([255,216,255])],'Photo.jpg',{type:'image/jpeg'}));return new next.NextRequest('http://localhost:3001/api/people/profile-photo',{method:'POST',headers:{origin},body});}
test('linked account resolver does not assume Person UUID equals User UUID',async()=>{const f=fixture();const r=await f.route.GET(get());assert.equal(r.status,200);assert.deepEqual(f.calls[0].resolve,{org:'org-a',person:null});assert.equal((await r.json()).person_id,'person-a');assert.equal(r.headers.get('cache-control'),'no-store');});
test('display thumbnail uses private ETag cache and 304 never calls SharePoint',async()=>{const f=fixture();const first=await f.route.GET(get('&person=person-a&image=1'));assert.equal(first.headers.get('content-type'),'image/jpeg');assert.match(first.headers.get('cache-control'),/^private/);assert.equal(first.headers.get('vary'),'Cookie');const etag=first.headers.get('etag');assert.ok(etag);const second=await f.route.GET(get('&person=person-a&image=1',{'if-none-match':etag}));assert.equal(second.status,304);assert.equal(f.calls.filter(c=>c.thumbnail).length,1);f.state.denied=true;assert.equal((await f.route.GET(get('&person=person-a&image=1',{'if-none-match':etag}))).status,403);});
test('provider failure retains A; successful replacement assigns B only after upload; removal retains files',async()=>{const f=fixture();f.state.uploadFailure=true;assert.equal((await f.route.POST(post())).status,422);assert.equal(f.current().document_id,'photo-a');assert.equal(f.calls.some(c=>c.args?.p_action==='assign'),false);f.state.uploadFailure=false;assert.equal((await f.route.POST(post())).status,200);assert.equal(f.current().document_id,'photo-b');assert.equal((await f.route.POST(post('remove'))).status,200);assert.equal(f.current().document_id,null);});
test('origin and capability denial reject before upload',async()=>{const f=fixture();assert.equal((await f.route.POST(post('upload','https://untrusted.test'))).status,403);f.state.denied=true;assert.equal((await f.route.POST(post())).status,403);assert.equal(f.calls.some(c=>c.upload),false);});
test('avatar displays instantaneous initials and recovers after image failure',()=>{
 let saved='';const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 const {PersonAvatar}=load('v2/components/people/person-avatar.tsx',{'next/image':{default:'image'},'react/jsx-runtime':jsx,react:{useState:()=>[saved,value=>{saved=value;}]}});
 const base={organisation:'org-a',personId:'person-a',name:'Alex Smith'};
 const fallback=PersonAvatar(base);assert.equal(fallback.props.children.props.children,'AS');
 const photo=PersonAvatar({...base,documentId:'photo-a'});assert.equal(photo.props.children.props.alt,'Alex Smith profile photo');assert.equal(photo.props.children.props.unoptimized,true);assert.equal(photo.props.children.props.style.objectFit,'cover');photo.props.children.props.onError();assert.equal(PersonAvatar({...base,documentId:'photo-a'}).props.children.props.children,'AS');
 assert.equal(PersonAvatar({...base,documentId:'photo-b'}).props.children.props.alt,'Alex Smith profile photo');
});

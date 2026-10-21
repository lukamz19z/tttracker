import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'../..');
const ts=require(path.join(root,'v2/node_modules/typescript'));
function route({rows=[],failure=false,platformReady=true,error=null}={}){
 const calls=[];const admin={from:table=>{calls.push({table});const q={select:()=>q,or:value=>{calls.push({filter:value});return q},lte:()=>q,order:()=>q,limit:async()=>({data:rows,error}),update:value=>{calls.push({update:value});return q},eq:(key,value)=>{calls.push({key,value});return q},in:()=>q};return q;}};
 const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(root,'v2/app/api/integrations/sharepoint/worker/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',code)(name=>name==='@/lib/people/profile-photo'?{publishPendingProfilePhotos:async()=>({published:0,deferred:0})}:name==='@/lib/documents/publication'?{processPublicationJob:async()=>({status:'synced'})}:name==='@/lib/supabase/admin'?{createSupabaseAdmin:()=>admin}:name==='@/lib/integrations/sharepoint'?{microsoftConfig:()=>{if(!platformReady)throw new Error('missing');}}:name==='@/lib/integrations/sharepoint-locations'?{processFolderBatch:async(org,kind,actor)=>{calls.push({org,kind,actor});if(failure)throw new Error('INTEGRATION_NOT_ENTITLED');return {processed:1}}}:name==='next/server'?require(path.join(root,'v2/node_modules/next/server')):require(name),exports);
 return {...exports,calls};
}
const request=value=>new Request('http://localhost:3001/api/integrations/sharepoint/worker',{headers:value?{authorization:'Bearer '+value}:{}});
test('worker denies anonymous/wrong/byte-length-mismatched secrets before touching jobs',async()=>{
 const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='x'.repeat(32);
 try{const worker=route();for(const value of [null,'wrong','\u00e9'.repeat(32)])assert.equal((await worker.GET(request(value))).status,403);assert.equal(worker.calls.length,0);}finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});
test('worker fails closed on missing Microsoft platform setup',async()=>{
 const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='x'.repeat(32);
 try{const worker=route({platformReady:false});assert.equal((await worker.GET(request(process.env.CRON_SECRET))).status,503);assert.equal(worker.calls.length,0);}finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});
test('worker selects due work with expired leases only and preserves organisation + recorded actor authority',async()=>{
 const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='x'.repeat(32);
 try{const worker=route({rows:[{id:'job-a',organisation_id:'org-a',entity_kind:'person'}]});const result=await worker.GET(request(process.env.CRON_SECRET));assert.deepEqual(await result.json(),{processed:1,deferred:0});assert.match(worker.calls.find(c=>c.filter).filter,/lease_until.lt/);assert.deepEqual(worker.calls.find(c=>c.org),{org:'org-a',kind:'person',actor:null});assert.equal(result.headers.get('cache-control'),'no-store');}finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});
test('suspended work cools down within its own organisation without leaking raw errors',async()=>{
 const previous=process.env.CRON_SECRET;process.env.CRON_SECRET='x'.repeat(32);
 try{const worker=route({rows:[{id:'job-a',organisation_id:'org-a',entity_kind:'project'}],failure:true});const result=await worker.GET(request(process.env.CRON_SECRET));assert.deepEqual(await result.json(),{processed:0,deferred:1});assert.ok(worker.calls.some(c=>c.key==='organisation_id'&&c.value==='org-a'));assert.ok(worker.calls.some(c=>c.key==='id'&&c.value==='job-a'));assert.ok(worker.calls.find(c=>c.update).update.available_at);}finally{if(previous===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previous;}
});
test('scheduler and local invocation use the same protected worker with no embedded credential',()=>{
 const config=JSON.parse(fs.readFileSync(path.join(root,'v2/vercel.json')));assert.deepEqual(config.crons,[{path:'/api/integrations/sharepoint/worker',schedule:'* * * * *'}]);
 const script=fs.readFileSync(path.join(root,'v2/scripts/sharepoint-worker.mjs'),'utf8');assert.match(script,/redirect: 'error'/);assert.match(script,/process.env.CRON_SECRET/);assert.doesNotMatch(script,/console\.(log|error)\([^\n]*(?:secret|Authorization)/);assert.ok(script.includes('/api/integrations/sharepoint/worker'));
});

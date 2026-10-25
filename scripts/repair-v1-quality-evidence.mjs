// Explicit, scoped maintenance: node scripts/repair-v1-quality-evidence.mjs <revision UUID> --apply
// Default is a metadata-only dry run. Credentials remain server-side and are never printed.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const revisionId=process.argv[2];
if(!/^[0-9a-f-]{36}$/i.test(revisionId || '')) throw Error('Supply one canonical Revision UUID.');
if(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='ixqwakkxycwjtttvsukx.supabase.co') throw Error('This maintenance tool is restricted to the existing V1 backend.');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(name=>{const target=name.startsWith('@/')?path.resolve(name.slice(2)):name.startsWith('.')?path.resolve(path.dirname(file),name):null;return target?load(target+(path.extname(target)?'':'.ts')):require(name)},exports);return exports;}
const service=load('lib/quality/server.ts').createQualityAdminSupabase();
const {data:files,error}=await service.from('tower_quality_files').select('*').eq('revision_id',revisionId).in('file_role',['before_photo','after_photo']).order('created_at');
if(error)throw Error(error.message);
const publish=load('lib/quality/evidence-publication.ts').ensurePublishedQualityEvidence;
const graph=load('lib/sharepoint/graph.ts');
const checkedFolders=new Set();
for(const file of files || []){
 if(process.argv.includes('--verify')) {
   if(!checkedFolders.has(file.sharepoint_folder_id)) {
     checkedFolders.add(file.sharepoint_folder_id);
     const folder=await graph.listDriveChildren({driveId:file.sharepoint_drive_id,parentItemId:file.sharepoint_folder_id});
     console.log({folderContents:folder.value.map(item=>item.name)});
   }
   const content=await graph.downloadDriveItemContent({driveId:file.sharepoint_drive_id,itemId:file.annotated_sharepoint_item_id});
   const sharp=require('sharp'),info=await sharp(content.content).metadata();
   console.log({fileName:file.file_name,bytes:content.content.length,width:info.width,height:info.height,format:info.format});
   if(file===(files || [])[0]) {const output=path.join(os.tmpdir(),'tt-current-rect01-before.jpg');fs.writeFileSync(output,content.content);console.log('Downloaded current annotated evidence: '+output);}
   continue;
 }
 if(!process.argv.includes('--apply')){console.log({fileId:file.id,role:file.file_role,fileName:file.file_name});continue;}
 const repaired=await publish(service,file);console.log({fileId:repaired.id,role:repaired.file_role,fileName:repaired.file_name,annotated:Boolean(repaired.annotated_sharepoint_item_id)});
}
console.log(process.argv.includes('--apply')?'Scoped evidence repair complete.':'Dry run complete; no files changed.');

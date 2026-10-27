import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToString} from 'react-dom/server';
const require=createRequire(import.meta.url),ts=require('typescript');
const cache=new Map();let signedIn=true,providerMounts=0;
const mockSupabase={auth:{getSession:async()=>({data:{session:null}})}};
const mocks={
 '@/lib/supabase':{createSupabaseBrowser:()=>mockSupabase},
 '@/lib/supabase-server':{createSupabaseServer:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:'fixture-user'}:null}})}})},
 'next/navigation':{redirect:url=>{throw Error('REDIRECT:'+url)},useParams:()=>({employeeId:'fixture-employee'}),usePathname:()=>'/people/ppe',useRouter:()=>({push(){},replace(){}})},
 'next/link':({children,href,...props})=>React.createElement('a',{...props,href},children),
};
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
 new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText)(name=>{
  if(name in mocks)return mocks[name];
  if(name.startsWith('@/')||name.startsWith('.')){const base=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name);const target=[base,base+'.ts',base+'.tsx',path.join(base,'index.ts')].find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());if(!target)throw Error('Module not found: '+name);return load(target);}
  return require(name);
 },exports);return exports;
}
const realAccess=load('components/access/access-provider.tsx');
mocks['@/components/access/access-provider']={...realAccess,AccessProvider:props=>{providerMounts++;return React.createElement(realAccess.AccessProvider,props);}};
const register=load('components/people/ppe-register.tsx').PpeRegister;
const config=load('app/(protected)/people/ppe/configuration/page.tsx').default;
for(const Component of [register,config])assert.throws(()=>renderToString(React.createElement(Component)),/useAccess must be used inside AccessProvider/);
console.log('PASS reproduced original crash with the actual React hook in PpeRegister and PpeConfiguration, without a provider.');
const layout=load('app/(protected)/layout.tsx').default;
for(const file of [
 'app/(protected)/people/page.tsx',
 'app/(protected)/people/ppe/page.tsx',
 'app/(protected)/people/ppe/configuration/page.tsx',
 'app/(protected)/people/[employeeId]/page.tsx',
 'app/(protected)/people/training/page.tsx',
 'app/(protected)/people/crews/page.tsx',
 'app/(protected)/people/training/configuration/page.tsx',
 'app/(protected)/people/training/configuration/workflow/page.tsx',
]){
 providerMounts=0;const Page=load(file).default;
 const html=renderToString(await layout({children:React.createElement(Page)}));
 assert.ok(!html.includes('useAccess must be used inside AccessProvider'));assert.equal(providerMounts,1);
 console.log('PASS authenticated initial React render, exactly one provider: '+file);
}
providerMounts=0;signedIn=false;
await assert.rejects(layout({children:React.createElement(register)}),/REDIRECT:\/login/);
assert.equal(providerMounts,0);console.log('PASS signed-out/expired authentication redirects before mounting protected children.');
// A missing provider must still throw: do not replace real access with defaults.
assert.throws(()=>renderToString(React.createElement(register)),/useAccess must be used inside AccessProvider/);
console.log('PASS strict hook invariant remains intact; no fake permissions or AccessProvider implementation changes.');

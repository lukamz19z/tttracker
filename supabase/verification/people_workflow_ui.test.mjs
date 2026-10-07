import { createRequire } from "node:module";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ts = require(path.join(root, "v2/node_modules/typescript"));

function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(
    fs.readFileSync(path.join(root, file), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
  new Function("require", "exports", code)((name) => {
    if (name in mocks) return mocks[name];
    if(name === "./people-ui")return {BackLink:"back-link",PeopleDateInput:"date-input"};
    if (name === "server-only") return {};
    if(name.endsWith(".module.css"))return {default:new Proxy({}, {get:(_,k)=>String(k)})};
    if(name==="lucide-react")return new Proxy({}, {get:(_,k)=>k});
    if (name.startsWith("./"))
      return load(
        path.posix.join(path.posix.dirname(file), name) + ".ts",
        mocks,
      );
    if (name.startsWith("@/"))
      return load("v2/" + name.slice(2) + ".ts", mocks);
    return require(name);
  }, exports);
  return exports;
}


const {resolveTokens,resolveDocumentRule}=load('v2/lib/people/document-rules.ts');
const {minimumClassification,fieldApplies}=load('v2/lib/people/onboarding-types.ts');
test('safe folder and filename tokens sanitise input and reject arbitrary expressions',()=>{
 assert.equal(resolveTokens('People/{person_display_name}/Training',{person_display_name:'Synthetic/Person'},true),'People/Synthetic-Person/Training');
 assert.throws(()=>resolveTokens('../{person_id}',{}),/INVALID_PATH/);assert.throws(()=>resolveTokens('{sql}',{}),/INVALID_PATH_TOKEN/);
 assert.equal(resolveTokens('{employee_number}_{training_type}_{expiry_date}',{employee_number:'EMP-0042',training_type:'Ticket',expiry_date:'04-10-2027'}),'EMP-0042_Ticket_04-10-2027');
});
test('relationship-specific rules, nested folders and unique revisions preserve provider identity',()=>{
 const rules=[{id:'root',category:'root',folder_template:'People',filename_template:'unused',provider:'internal',is_active:true},{id:'default',category:'training',folder_template:'{person_display_name}',filename_template:'{training_type}_{expiry_date}',provider:'internal',is_active:true,parent_id:'root',date_format:'DD-MM-YYYY'},{id:'specific',category:'training',relationship_type_id:'contractor',folder_template:'Contractors/{person_id}',filename_template:'{training_type}',provider:'sharepoint',is_active:true}];
 const values={person_id:'synthetic',person_display_name:'Example',training_type:'Ticket',expiry_date:'2027-10-04'};
 const a=resolveDocumentRule(rules,'training',null,values,'revision-a');const b=resolveDocumentRule(rules,'training',null,values,'revision-b');assert.equal(a.folder,'People/Example');assert.equal(a.filename,'Ticket_04-10-2027_revision-a');assert.notEqual(a.filename,b.filename);assert.equal(resolveDocumentRule(rules,'training','contractor',values,'revision-c').provider,'sharepoint');
 assert.throws(()=>resolveDocumentRule([...rules,{...rules[1],id:'ambiguous'}],'training',null,values,'r'),/AMBIGUOUS/);
});
test('semantic minima and declarative conditional applicability are label independent',()=>{
 assert.equal(minimumClassification('bank_account'),'confidential');assert.equal(minimumClassification('address'),'private');assert.equal(minimumClassification('training_request'),'operational');assert.equal(fieldApplies({condition:{field:'held',equals:true}},{held:false}),false);assert.equal(fieldApplies({condition:{field:'held',equals:true}},{held:true}),true);
});
const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props}),Fragment:'fragment'};
function walk(tree,type){if(Array.isArray(tree))return tree.flatMap(t=>walk(t,type));if(!tree||typeof tree!=='object')return [];return [...(tree.type===type?[tree]:[]),...walk(tree.props?.children,type)];}
function words(t){if(Array.isArray(t))return t.map(words).join(' ');if(typeof t==='string'||typeof t==='number')return String(t);return t&&typeof t==='object'?words(t.props?.children):'';}
const Fields=load('v2/components/people/onboarding-fields.tsx',{react:{useState:v=>[v,()=>{}]},'react/jsx-runtime':jsx}).OnboardingFields;
test('external renderer supports section navigation and never renders Confidential collection input',()=>{
 const tree=Fields({definition:{sections:[{name:'Payroll design',fields:[{key:'bank',label:'Account',type:'bank_account',classification:'confidential'}]},{name:'Next',fields:[]}]},answers:{}});
 assert.equal(walk(tree,'input').length,0);assert.match(words(tree),/Confidential collection unavailable/);assert.match(words(tree),/Payroll design/);assert.match(words(tree),/Next/);
});
test('reviewer without exact private-domain grant never renders private answer values',()=>{
 const tree=Fields({definition:{sections:[{name:'Contact',fields:[{key:'phone',label:'Phone',type:'phone',classification:'private',domain:'personal_contact'}]}]},answers:{phone:'SYNTHETIC_PRIVATE_VALUE'},readOnly:true,permissions:{'people.private.emergency_contact.view':true}});
 assert.doesNotMatch(words(tree),/SYNTHETIC_PRIVATE_VALUE/);assert.match(words(tree),/Restricted private/);
});
test('mobile evidence contract uses one configured front/back request and optional linked qualifications',()=>{
 const tree=Fields({definition:{sections:[{name:'Training',fields:[{key:'ticket',label:'Ticket',type:'training_request',classification:'operational',training_type_id:'t'}]}]},answers:{},training:{t:{document_requirement:'front_back',requires_issue_date:true,validity_mode:'automatic',linked_types:[{id:'linked',name:'Linked ticket'}]}}});
 assert.equal(walk(tree,'input').filter(n=>n.props.type==='file').length,2);assert.match(words(tree),/Linked ticket/);
});

"use client";
import { TokenInput } from "@/components/people/token-input";
import styles from "./sharepoint-wizard.module.css";
export function tokenLabel(token:string) {
 return ({person_display_name:"Employee Name",employee_number:"Employee Number",asset_identifier:"Asset ID",training_type:"Training Type",training_category:"Training Category",training_option:"Option / Class",document_side:"Document Side",issue_date:"Issue Date",expiry_date:"Expiry Date",document_type:"Document Type",employment_type:"Employment Type",project_number:"Project Number",project_name:"Project Name"} as Record<string,string>)[token]??token.split("_").map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(" ");
}
export function templateParts(value:string){return value.split(/(\{[^{}]+\})/g).filter(Boolean);}
export function DocumentTemplateBuilder({value,onChange,tokens,filename=false}:{value:string;onChange:(value:string)=>void;tokens:readonly string[];filename?:boolean}) {
 const levels=filename?[value]:value.split("/");
 function update(index:number,next:string){onChange(levels.map((level,i)=>i===index?next:level).join("/"));}
 return <div className={styles.templateBuilder}>
 {levels.map((level,index)=><section key={index} className={styles.templateLevel} aria-label={filename?"Filename":`Folder Level ${index+1}`}>
 <div className={styles.levelHeader}><strong>{filename?"Filename":`Folder Level ${index+1}`}</strong>{!filename&&<button type="button" className="tt-button-subtle" aria-label={`Remove Folder Level ${index+1}`} onClick={()=>onChange(levels.filter((_,i)=>i!==index).join("/"))}>Remove</button>}</div>
 <div className={styles.templatePieces}>{templateParts(level).map((part,i)=>part.startsWith("{")?<button key={i} type="button" className={styles.tokenChip} aria-label={`Remove ${tokenLabel(part.slice(1,-1))} from ${filename?"filename":`Folder Level ${index+1}`}`} title="Dynamic field; click to remove" onClick={()=>{const parts=templateParts(level);parts.splice(i,1);update(index,parts.join(""));}}>{tokenLabel(part.slice(1,-1))} x</button>:<input key={i} className={`tt-input ${styles.literalChip}`} aria-label={`Fixed text ${i+1} in ${filename?"filename":`Folder Level ${index+1}`}`} title="Fixed text" style={{width:Math.max(54,part.length*8+24),maxWidth:"100%"}} value={part} onChange={e=>{const parts=templateParts(level);parts[i]=e.target.value;update(index,parts.join(""));}}/>)}</div>
 <div className={styles.actions}><select className="tt-input" aria-label={`Add field to ${filename?"filename":`Folder Level ${index+1}`}`} style={{width:180,maxWidth:"100%"}} value="" onChange={e=>{if(e.target.value)update(index,level+`{${e.target.value}}`);}}><option value="">+ Add Field</option>{tokens.map(token=><option key={token} value={token}>{tokenLabel(token)}</option>)}</select><button type="button" className="tt-button-subtle" onClick={()=>update(index,level+"Text")}>+ Add Text</button></div>
 </section>)}
 {!filename&&<button type="button" className="tt-button-secondary" onClick={()=>onChange(value?value+"/New Folder":"New Folder")}>+ Add Folder Level</button>}
 <details><summary>Advanced Template</summary><label>Template<TokenInput value={value} onChange={onChange} tokens={tokens}/></label></details>
 </div>;
}

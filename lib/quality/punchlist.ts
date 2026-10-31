import type { DetailSchema, DetailValues } from "./operational-details";
export const punchlistFields = ["tower", "externalReference", "member", "segment", "leg", "drawing", "defectType", "description", "inspector", "inspectorComment", "sourceDate", "assignedFlag", "photos"] as const;
export type PunchlistRow = Record<typeof punchlistFields[number], string> & { rowKey: string; towerId?: string; issueTypeId?:string; operationalDetails?:DetailValues };
export type ImportIssueType={id:string;name:string;detail_schema?:DetailSchema|null};
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
export function punchlistSourceKey(projectId:string,sourceName:string){const slug=sourceName.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"punchlist";return `${projectId}:punchlist:${slug}`.slice(0,200);}
const aliases:Record<string,string[]>={
  tower:["towerno","towernumber"],externalReference:["externaldefectnumber","externalreference","referencenumber","defectno","defectnumber","findingno","findingnumber","punchlistno","punchlistnumber"],
  member:["memberno","membernumber"],segment:["section","towersection"],drawing:["drawingno","drawingnumber"],defectType:["defect","issuetype","findingtype"],description:["finding","defectdescription"],inspector:["inspector","inspectedby","raisedby"],sourceDate:["date","inspectiondate","sourcedate","dateraised"],
};
function fieldAlias(field:{key:string;label:string}) {const key=normalize(field.key),label=normalize(field.label);const aliases=[key,label,normalize(field.key.replace(/_/g," ")),normalize(field.label.replace(/\b(current|existing|required|quantity|qty|bolt|packer|action|change)\b/gi," "))];if(/^(existing|current)/.test(key)||/^(existing|current)/.test(label))aliases.push(key.replace(/^(existing|current)/,""),label.replace(/^(existing|current)/,""),"current"+key.replace(/^(existing|current)/,""));if(/quantity|qty/.test(key+label))aliases.push("qty","quantity");return new Set(aliases.filter(Boolean));}
function typedValue(value:unknown,field:{type:string}) {
  const text=String(value??"").trim();if(!text)return undefined;
  if(["number","quantity"].includes(field.type))return /^-?\d+(\.\d+)?$/.test(text)?Number(text):text;
  if(field.type==="toggle")return /^(true|yes|on|1)$/i.test(text)?true:/^(false|no|off|0)$/i.test(text)?false:text;
  if(field.type==="multi-select")return text.split(/[;,|]/).map(part=>part.trim()).filter(Boolean);
  return text;
}
export function suggestPunchlistMapping(columns: string[],issueTypes:ImportIssueType[]=[]):Record<string,string> {
  const normalized=columns.map(column=>({column,key:normalize(column)}));
  const result:Record<string,string>=Object.fromEntries(punchlistFields.map(key=>[key,normalized.find(entry=>[normalize(key),...(aliases[key]||[])].includes(entry.key))?.column||""]));
  for(const issue of issueTypes)for(const field of issue.detail_schema?.fields||[]){const alias=fieldAlias(field);result[`operational:${issue.id}:${field.key}`]=normalized.find(entry=>alias.has(entry.key))?.column||"";}
  return result;
}
export function mapPunchlistRows(rows: Record<string, unknown>[], mapping: Record<string, string>,issueTypes:ImportIssueType[]=[]): PunchlistRow[] {
  return rows.map((source, index) => {
    const row={...Object.fromEntries(punchlistFields.map(key=>[key,String(source[mapping[key]]??"").trim()])),rowKey:String(index+2)} as PunchlistRow;
    const issue=issueTypes.find(candidate=>normalize(candidate.name)===normalize(row.defectType));
    if(issue){row.issueTypeId=issue.id;const values:DetailValues={};for(const field of issue.detail_schema?.fields||[]){const column=mapping[`operational:${issue.id}:${field.key}`];if(column){const value=typedValue(source[column],field);if(value!==undefined)values[field.key]=value as DetailValues[string];}}row.operationalDetails=values;}
    return row;
  });
}
export function punchlistPhotoNames(value: string) { return value.split(/[;|\n]/).map(name => name.trim()).filter(Boolean); }
/** Exact reference followed only by an optional numeric image suffix. Never fuzzy match. */
export function matchPunchlistPhotos(rows: PunchlistRow[], files: {name:string}[], assignments: Record<number,string> = {}) {
  const matches = files.map((file, index) => {
    const name = file.name.toUpperCase(), stem = name.replace(/\.[^.]+$/, "");
    const candidates = rows.filter(row => {
      if (punchlistPhotoNames(row.photos).some(photo => photo.toUpperCase() === name)) return true;
      const reference = row.externalReference.trim().toUpperCase();
      return reference && (stem === reference || (stem.startsWith(reference) && /^[_ -]\d+$/.test(stem.slice(reference.length))));
    });
    const assigned = assignments[index];
    const rowKey = assigned === "skip" ? null : assigned ? rows.find(row => row.rowKey === assigned)?.rowKey : candidates.length === 1 ? candidates[0].rowKey : null;
    return {index, rowKey:rowKey || null, candidates:candidates.map(row=>row.rowKey), state:assigned === "skip" ? "skipped" : rowKey ? "matched" : candidates.length > 1 ? "ambiguous" : "unmatched"};
  });
  const duplicateReferences = [...new Set(rows.filter((row,index)=>rows.some((other,j)=>j!==index && other.externalReference.trim().toUpperCase()===row.externalReference.trim().toUpperCase())).map(row=>row.externalReference))];
  return {matches, duplicateReferences, findingsWithoutPhotos:rows.filter(row=>!matches.some(match=>match.rowKey===row.rowKey))};
}
export function qualityItemMatches(item: { source_type?: string | null; external_reference?: string | null; fli_number?: string | null; status: string; finding?: string | null; other_issue_text?: string | null; member_number?: string | null; tower_segment?: string | null; leg?: string | null }, search: string, status: string, source: string) {
  const done = ["Rectified", "Verified"].includes(item.status);
  return (source === "All" || (source === "Imported" ? item.source_type === "punchlist" : item.source_type !== "punchlist"))
    && (status === "All" || (status === "Open" ? !done : status === "Rectified" ? done : item.status === status))
    && [item.fli_number, item.external_reference, item.member_number, item.tower_segment, item.leg, item.other_issue_text, item.finding].join(" ").toLowerCase().includes(search.trim().toLowerCase());
}

export function samePunchlistSource(a:Partial<PunchlistRow>|null|undefined,b:PunchlistRow){return Boolean(a && punchlistFields.every(key=>a[key]===b[key]) && a.issueTypeId===b.issueTypeId && JSON.stringify(a.operationalDetails||{})===JSON.stringify(b.operationalDetails||{}));}

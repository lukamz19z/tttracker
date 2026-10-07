import type { MaterialItem, MaterialBundle, MaterialOption } from "./types";

export function materialIssueMetadata(material: MaterialItem | MaterialBundle) {
  if ("material_kind" in material) return { materialItemId: material.id, bundleId: material.bundle_id ?? "", bundleReference: material.bundle_reference ?? "", towerId: material.tower_id ?? "", itemReference: material.item_reference, description: material.description ?? "", affectedSegment: material.segment ?? "", unit: material.unit ?? "ea", drawing: material.drawing_reference ?? "", profile: material.profile ?? "", expectedQuantity: material.required_quantity, materialKind: material.material_kind };
  return { materialItemId: "", bundleId: material.id, bundleReference: material.bundle_reference, towerId: material.tower_id ?? "", itemReference: material.bundle_reference, description: material.package_context ?? material.segment ?? "", affectedSegment: material.segment ?? "", unit: "ea", drawing: "", profile: "", expectedQuantity: material.required_quantity, materialKind: "bundle" };
}

export const traceabilityFields = ["quantity", "sourceType", "sourceTower", "sourceLocation", "destinationTower", "destinationLocation", "docket", "reference", "notes"] as const;
export type TraceabilityField = typeof traceabilityFields[number];
export function eventFormFields(option: MaterialOption | undefined): Set<TraceabilityField> {
  const configured = option?.settings?.form_fields;
  if (Array.isArray(configured)) return new Set(configured.filter((field): field is TraceabilityField => typeof field === "string" && traceabilityFields.some((valid) => valid === field)));
  if (option?.settings?.resolves_quantity) return new Set(["quantity", "sourceType", "destinationTower", "destinationLocation", "docket", "reference", "notes"]);
  if (option?.settings?.reverses_quantity) return new Set(["quantity", "docket", "reference", "notes"]);
  if (["source_identified", "dispatched"].includes(option?.option_key ?? "")) return new Set(["quantity", "sourceType", "destinationTower", "docket", "reference", "notes"]);
  return new Set(["docket", "reference", "notes"]);
}

export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth()+1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;
}
export function parseLocalDateTime(text: string): string | null {
  const m = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/); if (!m) return null;
  const [, day, month, year, hour, minute] = m.map(Number);
  const d = new Date(year,month-1,day,hour,minute);
  if (d.getFullYear()!==year || d.getMonth()!==month-1 || d.getDate()!==day || d.getHours()!==hour || d.getMinutes()!==minute) return null;
  return d.toISOString();
}

export function traceabilityEventPayload(draft:Record<string,string>, fields:Set<TraceabilityField>, sourceSettings:Record<string,unknown>|null|undefined) {
  const usesSource=fields.has("sourceType")||fields.has("sourceTower")||fields.has("sourceLocation");
  return {...draft,quantity:fields.has("quantity")?draft.quantity:"0",sourceTypeKey:usesSource?draft.sourceTypeKey:"",
    sourceTowerId:usesSource&&sourceSettings?.requires_tower?draft.sourceTowerId:"",
    sourceLocationId:usesSource&&sourceSettings?.requires_location?draft.sourceLocationId:"",
    destinationTowerId:fields.has("destinationTower")?draft.destinationTowerId:"",
    destinationLocationId:fields.has("destinationLocation")?draft.destinationLocationId:"",
    docketId:fields.has("docket")?draft.docketId:""};
}

export function deliveryBlockedReasons(input:{busy:boolean;creating:boolean;canManage:boolean;towerId:string;selectedCount:number;scheduling:boolean;scheduledFor:string}):string[] {
 const reasons:string[]=[];
 if(input.busy)reasons.push("Wait for Materials to finish loading.");
 if(input.creating)reasons.push("Saving delivery...");
 if(!input.canManage)reasons.push("Delivery management permission is required.");
 if(!input.towerId)reasons.push("Select a destination tower.");
 if(input.selectedCount===0)reasons.push("Choose at least one eligible bundle.");
 if(input.scheduling&&(!input.scheduledFor||Number.isNaN(Date.parse(input.scheduledFor))))reasons.push("Choose a valid planned date/time to continue.");
 return reasons;
}

import type {PpeType} from "./ppe";
export type InventorySize={id:string;product_id:string;label:string;active:boolean;sort_order:number;minimum:number|null;on_hand:number};
export type InventoryProduct={id:string;name:string;code:string|null;category:string;active:boolean;description:string|null;tracks_sizes:boolean;ppe_type_id:string|null;sort_order:number;notes:string|null;created_at:string;updated_at:string};
export type InventoryPermission="view"|"products"|"receive"|"issue"|"adjust"|"export";
export type InventoryData={products:InventoryProduct[];sizes:InventorySize[];definitions:PpeType[];permissions:Record<InventoryPermission,boolean>};
export type InventoryPerson={id:string;full_name:string;payroll_id:string|null;crew_label:string;sizes:Record<string,string|null>};
export type InventoryMovement={id:string;product_size_id:string;batch_id:string;movement_type:string;quantity_delta:number;employee_id:string|null;employee_name:string|null;employee_number:string|null;crew_label:string|null;product_name:string;size_label:string;performed_by_label:string;occurred_at:string;notes:string|null;reversal_of:string|null;batch:{reference:string|null;supplier:string|null}|null};
export type StockLine={size_id:string;quantity:number;employee_id?:string;reversal_of?:string};
export const movementLabel=(m:Pick<InventoryMovement,"movement_type"|"quantity_delta">)=>({receipt:"Stock Received",issue:"Issued to Person",reversal:"Issue Reversal",adjustment:m.quantity_delta>0?"Manual Adjustment +":"Manual Adjustment -"}[m.movement_type]||m.movement_type);
export function suggestedSize(product:InventoryProduct,person:InventoryPerson|undefined,sizes:InventorySize[]){
 const value=product.ppe_type_id?person?.sizes[product.ppe_type_id]:null;
 return sizes.find(s=>s.product_id===product.id&&s.active&&(!product.tracks_sizes||value?.trim().toUpperCase()===s.label.trim().toUpperCase()))?.id||"";
}
export function inventoryCsv(rows:unknown[][]){return "\ufeff"+rows.map(row=>row.map(value=>{let text=String(value??"");if(/^[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}).join(",")).join("\r\n");}

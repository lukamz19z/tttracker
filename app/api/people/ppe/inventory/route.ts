import {NextRequest,NextResponse} from "next/server";
import {inventoryAccess,inventoryError} from "@/lib/people/ppe-inventory-server";
import {ppeBody,invalidPpe,uuidPattern} from "@/lib/people/ppe-server";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){try{
 const {service,permissions}=await inventoryAccess(request);
 async function loadProducts(){const rows=[];for(let offset=0;;offset+=1000){const result=await service.from("people_ppe_inventory_products").select("*").order("sort_order").order("name").order("id").range(offset,offset+999);if(result.error)throw new Error(`PPE inventory products query failed: ${result.error.message}`);rows.push(...result.data);if(result.data.length<1000)return rows;}}
 async function loadSizes(){const rows=[];for(let offset=0;;offset+=1000){const result=await service.from("v1_ppe_inventory_balances").select("*").order("sort_order").order("id").range(offset,offset+999);if(result.error)throw new Error(`PPE inventory balances query failed: ${result.error.message}`);rows.push(...result.data);if(result.data.length<1000)return rows;}}
 const [products,sizes,definitions]=await Promise.all([loadProducts(),loadSizes(),service.from("people_ppe_types").select("id,name,source_field,active,requires_size,size_options,sort_order,updated_at").order("sort_order")]);
 if(definitions.error)throw new Error(`PPE inventory sizing definitions query failed: ${definitions.error.message}`);
 return NextResponse.json({products,sizes,definitions:definitions.data,permissions},{headers:{"Cache-Control":"private, no-store"}});
}catch(error){return inventoryError(error);}}
export async function POST(request:NextRequest){try{
 const {service}=await inventoryAccess(request,"products");const body=await ppeBody(request);
 if(body.id&&!uuidPattern.test(String(body.id)))invalidPpe("Select a valid product.");
 if(body.id&&typeof body.updated_at!=="string")invalidPpe("Refresh the product before editing.");
 for(const key of ["name","category","code","description","notes"])if(body[key]!=null&&(typeof body[key]!=="string"||body[key].length>(key==="name"?120:2000)))invalidPpe(`Check product ${key}.`);
 if(!body.name?.trim())invalidPpe("Enter a product name.");
 if(typeof body.active!=="boolean"||typeof body.tracks_sizes!=="boolean"||!Number.isInteger(body.sort_order))invalidPpe("Check product settings.");
 if(body.ppe_type_id&&!uuidPattern.test(String(body.ppe_type_id)))invalidPpe("Select a valid PPE size mapping.");
 if(!Array.isArray(body.sizes)||body.sizes.length<1||body.sizes.length>100||body.sizes.some((s:unknown)=>!s||typeof s!=="object"||!("label" in s)||typeof s.label!=="string"||s.label.length>120||!("minimum" in s)||(s.minimum!==null&&(!Number.isInteger(s.minimum)||Number(s.minimum)<0))))invalidPpe("Enter valid sizes and non-negative minimums.");
 const {data,error}=await service.rpc("v1_ppe_inventory_save_product",{p_data:body});
 if(error)invalidPpe(error.message);if(!data)throw new Error("PPE product save succeeded without returning a product ID.");
 return NextResponse.json({id:data});
}catch(error){return inventoryError(error);}}

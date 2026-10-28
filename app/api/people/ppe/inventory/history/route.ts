import {NextRequest,NextResponse} from "next/server";
import {inventoryAccess,inventoryError} from "@/lib/people/ppe-inventory-server";
import {invalidPpe,uuidPattern} from "@/lib/people/ppe-server";
export async function GET(request:NextRequest){try{
 const q=request.nextUrl.searchParams;const {service,canSeeCrews}=await inventoryAccess(request,q.get("export")==="1"?"export":"view");
 const offset=Number(q.get("offset")||0);if(!Number.isInteger(offset)||offset<0)invalidPpe("Invalid history page.");
 for(const key of ["employee","size","product"])if(q.get(key)&&!uuidPattern.test(q.get(key)||""))invalidPpe("Choose a valid history filter.");
 let query=service.from("people_ppe_inventory_movements").select("*,batch:people_ppe_inventory_batches(reference,supplier),size:people_ppe_inventory_sizes!inner(product_id)").order("occurred_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+49);
 if(q.get("before")){if(!Number.isFinite(Date.parse(q.get("before")||"")))invalidPpe("Invalid history export date.");query=query.lte("created_at",q.get("before"));}
 if(q.get("employee"))query=query.eq("employee_id",q.get("employee"));
 if(q.get("size"))query=query.eq("product_size_id",q.get("size"));
 if(q.get("product"))query=query.eq("size.product_id",q.get("product"));
 if(q.get("issues")==="1")query=query.in("movement_type",["issue","reversal"]);
 const result=await query;if(result.error)throw new Error(`PPE inventory history query failed: ${result.error.message}`);
 return NextResponse.json({rows:result.data.map(row=>({...row,crew_label:canSeeCrews?row.crew_label:"Crew not available"})),more:result.data.length===50},{headers:{"Cache-Control":"private, no-store"}});
}catch(error){return inventoryError(error);}}

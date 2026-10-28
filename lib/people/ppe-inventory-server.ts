import {NextRequest,NextResponse} from "next/server";
import {ppeAccess} from "./ppe-server";
import {userHasAccess} from "@/lib/access/server";
import type {InventoryPermission} from "./ppe-inventory";
export async function inventoryAccess(request:NextRequest,capability:InventoryPermission="view"){
 const context=await ppeAccess(request);
 const keys:InventoryPermission[]=["view","products","receive","issue","adjust","export"];
 const values=await Promise.all(keys.map(key=>userHasAccess(context.service,context.user.id,`people.ppe_inventory.${key}`)));
 const permissions=Object.fromEntries(keys.map((key,index)=>[key,values[index]])) as Record<InventoryPermission,boolean>;
 if(!permissions.view||!permissions[capability])throw new Error("PPE_FORBIDDEN");
 return {...context,permissions};
}
export function inventoryError(error:unknown){
 const message=error instanceof Error?error.message:"PPE inventory operation failed.";
 const status=message==="PPE_FORBIDDEN"?403:/authentication token|must be logged in/.test(message)?401:message.startsWith("PPE_INVALID:")?400:500;
 if(status===500)console.error("PPE inventory",error);
 return NextResponse.json({error:status===403?"You do not have permission for this PPE inventory action.":message.replace(/^PPE_INVALID:/,"")},{status});
}

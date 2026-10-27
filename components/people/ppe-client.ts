import {createSupabaseBrowser} from "@/lib/supabase";
export async function ppeRequest<T>(path:string,init:RequestInit={}){
 const {data:{session}}=await createSupabaseBrowser().auth.getSession();
 if(!session)throw new Error("Please sign in to use PPE records.");
 const headers=new Headers(init.headers);headers.set("Authorization",`Bearer ${session.access_token}`);if(init.body)headers.set("Content-Type","application/json");
 const response=await fetch(path,{...init,headers,cache:"no-store"});const text=await response.text();
 if(!response.headers.get("content-type")?.includes("application/json"))throw new Error(`PPE service returned HTTP ${response.status} instead of JSON.`);
 let payload;try{payload=JSON.parse(text);}catch{throw new Error("PPE service returned invalid JSON.");}
 if(!response.ok)throw new Error(payload.error||`PPE request failed (${response.status}).`);return payload as T;
}

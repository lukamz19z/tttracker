import { AppState } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { cachedMaterials, refreshMaterials } from "@/lib/api/materials";
import type { MaterialPayload } from "@/types/materials";

type Value={data:MaterialPayload|null;loading:boolean;refreshing:boolean;cachedAt:string|null;error:string|null;refresh:()=>Promise<void>};
const Ctx=createContext<Value|undefined>(undefined);
export function MaterialsProvider({children}:PropsWithChildren){
 const {profile}=useAuth(); const {online}=useSync(); const projectId=profile?.projectId??null;
 const [data,setData]=useState<MaterialPayload|null>(null),[loading,setLoading]=useState(false),[refreshing,setRefreshing]=useState(false),[cachedAt,setCachedAt]=useState<string|null>(null),[error,setError]=useState<string|null>(null);
 const load=useCallback(async(refresh=false)=>{if(!projectId){setData(null);setCachedAt(null);return;} refresh?setRefreshing(true):setLoading(true);setError(null);try{const cached=await cachedMaterials(projectId);if(cached){setData(cached.value);setCachedAt(cached.updatedAt);}if(online){try{const latest=await refreshMaterials(projectId);setData(latest);setCachedAt(new Date().toISOString());}catch(e){if(!cached)throw e;setError(e instanceof Error?`${e.message} Showing cached materials.`:"Showing cached materials.");}}}catch(e){setError(e instanceof Error?e.message:"Materials could not be loaded.");}finally{setLoading(false);setRefreshing(false);}},[online,projectId]);
 useEffect(()=>{void load(false);},[load]);
 useEffect(()=>{const sub=AppState.addEventListener("change",state=>{if(state==="active"&&online)void load(true)});return()=>sub.remove();},[load,online]);
 const value=useMemo(()=>({data,loading,refreshing,cachedAt,error,refresh:()=>load(true)}),[data,loading,refreshing,cachedAt,error,load]); return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export function useMaterials(){const c=useContext(Ctx);if(!c)throw new Error("useMaterials must be used inside MaterialsProvider");return c;}

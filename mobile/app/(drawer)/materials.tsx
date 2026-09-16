import { router, type Href } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Boxes, Search, PackageOpen, Wrench, AlertTriangle, ArrowRightLeft, Truck } from "lucide-react-native";
import { useMaterials } from "@/contexts/MaterialsContext";
import { MaterialsShell } from "@/components/materials/MaterialsShell";

const links=[
 ["Search","Search members, bundles and bolts offline.","/materials/search",Search],
 ["Bundles","Required, checked and delivered bundles.","/materials/bundles",Boxes],
 ["Members","Browse members by bundle / tower / segment.","/materials/members",PackageOpen],
 ["Bolts","Search the project bolt register.","/materials/bolts",Wrench],
 ["Missing & Excess","Open material events and receipts.","/materials/missing",AlertTriangle],
 ["Transfers","Tower-to-tower bundle movements.","/materials/transfers",ArrowRightLeft],
 ["Deliveries","Open the existing mobile delivery workflow.","/(drawer)/truck-delivery",Truck],
] as const;
export default function MaterialsHome(){const {data,loading}=useMaterials();return <MaterialsShell root title="Materials" subtitle="One project cache powers every material search and register below.">{loading&&!data?<ActivityIndicator/>:<View style={s.stats}><Stat label="Towers" value={data?.towers.length??0}/><Stat label="Bundles" value={data?.bundles.length??0}/><Stat label="Members" value={data?.members.length??0}/><Stat label="Bolts" value={data?.bolts.length??0}/></View>}{links.map(([title,desc,href,Icon])=><Pressable key={title} style={s.link} onPress={()=>router.push(href as Href)}><Icon size={21} color="#2563eb"/><View style={{flex:1}}><Text style={s.title}>{title}</Text><Text style={s.desc}>{desc}</Text></View><Text style={s.go}>›</Text></Pressable>)}</MaterialsShell>}
function Stat({label,value}:{label:string;value:number}){return<View style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.statLabel}>{label}</Text></View>}
const s=StyleSheet.create({stats:{flexDirection:"row",flexWrap:"wrap",gap:8},stat:{minWidth:"47%",flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e8f0",borderRadius:14,padding:13},statValue:{fontSize:22,fontWeight:"900",color:"#0f172a"},statLabel:{fontSize:11,color:"#64748b",fontWeight:"700"},link:{flexDirection:"row",alignItems:"center",gap:12,padding:15,backgroundColor:"#fff",borderRadius:16,borderWidth:1,borderColor:"#e2e8f0"},title:{fontWeight:"900",color:"#0f172a"},desc:{fontSize:12,color:"#64748b",marginTop:3},go:{fontSize:26,color:"#94a3b8"}});

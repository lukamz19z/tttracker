import { QualitySelector, type QualitySelectorOption } from "@/components/quality/QualitySelector";
import { MaterialsShell } from "@/components/materials/MaterialsShell";
import { useMaterials } from "@/contexts/MaterialsContext";
import { loadMaterialProjectUsers, type MaterialProjectUser } from "@/lib/api/materials";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ChevronDown, Save } from "lucide-react-native";

const clean=(value:unknown)=>String(value??"").trim();
function dateDb(value:string){const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());if(!match)return null;const [,day,month,year]=match;const date=new Date(Date.UTC(Number(year),Number(month)-1,Number(day)));return date.getUTCDate()===Number(day)&&date.getUTCMonth()+1===Number(month)?`${year}-${month}-${day}`:null;}
function mutationId(){return `material-missing-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}

export default function ReportMissingMaterialScreen(){
  const {data,towerName,reportMissingMaterial,online}=useMaterials();
  const params=useLocalSearchParams<{towerId?:string}>();
  const [towerId,setTowerId]=useState(clean(params.towerId));
  const [itemId,setItemId]=useState("");
  const [itemLabel,setItemLabel]=useState("");
  const [description,setDescription]=useState("");
  const [category,setCategory]=useState("Other");
  const [specification,setSpecification]=useState("");
  const [quantity,setQuantity]=useState("1");
  const [unit,setUnit]=useState("ea");
  const [segment,setSegment]=useState("");
  const [member,setMember]=useState("");
  const [drawing,setDrawing]=useState("");
  const [urgency,setUrgency]=useState("Normal");
  const [requiredBy,setRequiredBy]=useState("");
  const [notes,setNotes]=useState("");
  const [towerOpen,setTowerOpen]=useState(false);
  const [itemOpen,setItemOpen]=useState(false);
  const [categoryOpen,setCategoryOpen]=useState(false);
  const [urgencyOpen,setUrgencyOpen]=useState(false);
  const [assigneeOpen,setAssigneeOpen]=useState(false);
  const [notifyOpen,setNotifyOpen]=useState(false);
  const [projectUsers,setProjectUsers]=useState<MaterialProjectUser[]>([]);
  const [assignedToUserId,setAssignedToUserId]=useState("");
  const [notifyUserIds,setNotifyUserIds]=useState<string[]>([]);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{if(data?.projectId&&online)void loadMaterialProjectUsers(data.projectId).then(setProjectUsers).catch(()=>setProjectUsers([]));},[data?.projectId,online]);
  const towers=data?.towers||[];
  const towerOptions=towers.map(row=>({id:clean(row.id),label:clean(row.name)||clean(row.line)||"Tower"}));
  const itemOptions=useMemo<QualitySelectorOption[]>(()=>{
    const rows:QualitySelectorOption[]=[];
    for(const row of (data?.bundles||[]).filter(item=>!towerId||item.tower_id===towerId)) rows.push({id:`bundle:${clean(row.id)}`,label:`Bundle ${clean(row.bundle_no)}`,subtitle:clean(row.section)});
    for(const row of (data?.members||[]).filter(item=>!towerId||item.tower_id===towerId)) rows.push({id:`member:${clean(row.id)}`,label:clean(row.mark_no)||"Member",subtitle:[clean(row.tower_segment||row.section),clean(row.drawing_number)].filter(Boolean).join(" · ")});
    for(const row of (data?.bolts||[]).filter(item=>!towerId||item.tower_id===towerId)) {
      const packer=clean(row.item_type)==="packer";
      const label=packer?`${[clean(row.bolt_diameter),clean(row.packer_no)].filter(Boolean).join(" mm ")} Packer${row.packer_mark?` · ${clean(row.packer_mark)}`:""}`:[clean(row.bolt_diameter),clean(row.length)].filter(Boolean).join(" × ")||"Bolt";
      rows.push({id:`${packer?"packer":"bolt"}:${clean(row.id)}`,label,subtitle:[clean(row.tower_segment),clean(row.drawing_number),clean(row.dn_sn)].filter(Boolean).join(" · ")});
    }
    return rows;
  },[data?.bolts,data?.bundles,data?.members,towerId]);
  async function submit(){
    if(!towerId||!description.trim()||Number(quantity)<=0){Alert.alert("Item details required","Choose a tower, describe the material and enter a positive quantity.");return;}
    const due=requiredBy.trim()?dateDb(requiredBy):null;
    if(requiredBy.trim()&&!due){Alert.alert("Check Required By","Enter a valid date as DD/MM/YYYY.");return;}
    setSaving(true);
    try{
      const [sourceTable,sourceRecordId]=itemId?itemId.split(":",2):["",""];
      await reportMissingMaterial({towerId,clientMutationId:mutationId(),itemReference:itemLabel||description.trim(),description:description.trim(),quantity:Number(quantity),unit:unit.trim()||"ea",category,specification:specification.trim()||undefined,sourceTable:sourceTable?`tower_${sourceTable==='member'?'material_members':sourceTable==='bolt'||sourceTable==='packer'?'material_bolts':'required_bundles'}`:undefined,sourceRecordId:sourceRecordId||undefined,materialType:sourceTable==="packer"?"packer":category.toLowerCase(),boltSize:sourceTable==="bolt"?itemLabel:undefined,segment:segment.trim()||undefined,memberNumber:member.trim()||undefined,drawingNumber:drawing.trim()||undefined,urgency,requiredBy:due,notes:notes.trim()||undefined,assignedToUserId:assignedToUserId||null,notifyUserIds});
      Alert.alert(online?"Missing material reported":"Saved for sync",online?"It is now linked to the tower and will appear in Materials and the next Daily Docket.":"The report is safely queued and will sync when connected.");
      router.back();
    }catch(error){Alert.alert("Could not report material",error instanceof Error?error.message:"Please retry.");}
    finally{setSaving(false);}
  }
  return <MaterialsShell title="Report Missing Material" subtitle="Report against the tower’s existing material history.">
    <Text style={styles.label}>Tower *</Text><Pressable style={styles.selector} onPress={()=>setTowerOpen(true)}><Text style={styles.value}>{towerName(towerId)||"Choose tower"}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
    <Text style={styles.label}>Find existing material</Text><Pressable style={styles.selector} onPress={()=>setItemOpen(true)}><Text style={styles.value}>{itemLabel||"Search bundle, member or bolt"}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
    <Text style={styles.label}>Or add other material</Text><TextInput value={description} onChangeText={setDescription} placeholder="e.g. Grid mesh – Bottom Crossarm" style={styles.input}/>
    <View style={styles.two}><View style={styles.grow}><Text style={styles.label}>Category</Text><Pressable style={styles.selector} onPress={()=>setCategoryOpen(true)}><Text style={styles.value}>{category}</Text><ChevronDown size={16} color="#64748b"/></Pressable></View><View style={styles.grow}><Text style={styles.label}>Quantity</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.input}/></View></View>
    <View style={styles.two}><View style={styles.grow}><Text style={styles.label}>Specification</Text><TextInput value={specification} onChangeText={setSpecification} placeholder="Size / spec" style={styles.input}/></View><View style={styles.grow}><Text style={styles.label}>Unit</Text><TextInput value={unit} onChangeText={setUnit} style={styles.input}/></View></View>
    <Text style={styles.label}>Segment / location</Text><TextInput value={segment} onChangeText={setSegment} placeholder="Optional" style={styles.input}/>
    <View style={styles.two}><View style={styles.grow}><Text style={styles.label}>Member</Text><TextInput value={member} onChangeText={setMember} placeholder="Optional" style={styles.input}/></View><View style={styles.grow}><Text style={styles.label}>Drawing</Text><TextInput value={drawing} onChangeText={setDrawing} placeholder="Optional" style={styles.input}/></View></View>
    <Text style={styles.label}>Urgency</Text><Pressable style={styles.selector} onPress={()=>setUrgencyOpen(true)}><Text style={styles.value}>{urgency}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
    <Text style={styles.label}>Required By · DD/MM/YYYY</Text><TextInput value={requiredBy} onChangeText={setRequiredBy} placeholder="Optional" style={styles.input}/>
    {projectUsers.length>0?<><Text style={styles.label}>Assigned To · Optional</Text><Pressable style={styles.selector} onPress={()=>setAssigneeOpen(true)}><Text style={styles.value}>{projectUsers.find(user=>user.id===assignedToUserId)?.name||"Not assigned"}</Text><ChevronDown size={18} color="#64748b"/></Pressable><Text style={styles.label}>Also Notify · Optional</Text><Pressable style={styles.selector} onPress={()=>setNotifyOpen(true)}><Text style={styles.value}>{notifyUserIds.map(id=>projectUsers.find(user=>user.id===id)?.name).filter(Boolean).join(", ")||"No additional recipients"}</Text><ChevronDown size={18} color="#64748b"/></Pressable></>:null}
    <Text style={styles.label}>Notes</Text><TextInput value={notes} onChangeText={setNotes} multiline style={[styles.input,styles.notes]}/>
    <Pressable disabled={saving} onPress={()=>void submit()} style={styles.save}><Save size={17} color="#fff"/><Text style={styles.saveText}>{saving?"Saving…":online?"Report Missing":"Save Pending Sync"}</Text></Pressable>
    <QualitySelector visible={towerOpen} title="Choose tower" options={towerOptions} onClose={()=>setTowerOpen(false)} onSelect={row=>{setTowerId(row.id);setTowerOpen(false);}}/>
    <QualitySelector visible={itemOpen} title="Search tower materials" options={itemOptions} onClose={()=>setItemOpen(false)} onSelect={row=>{setItemId(row.id);setItemLabel(row.label);setDescription(row.label);const selectedPacker=row.id.startsWith("packer:");const selectedBolt=data?.bolts.find(item=>clean(item.id)===row.id.split(":")[1]);const selectedMember=data?.members.find(item=>clean(item.id)===row.id.split(":")[1]);setSpecification(selectedPacker?[clean(selectedBolt?.bolt_diameter),clean(selectedBolt?.packer_no)].filter(Boolean).join(" mm "):row.subtitle||"");setSegment(clean(selectedPacker?selectedBolt?.tower_segment:selectedMember?.tower_segment||selectedMember?.section)||segment);setDrawing(clean(selectedPacker?selectedBolt?.drawing_number:selectedMember?.drawing_number)||drawing);setMember(clean(selectedMember?.mark_no)||member);setCategory(row.id.startsWith("member:")?"Steel":selectedPacker?"Packer":row.id.startsWith("bolt:")?"Bolt":"Bundle");}}/>
    <QualitySelector visible={categoryOpen} title="Material category" options={["Steel","Bolt","Packer","Mesh","Fitting","Consumable","Other"].map(value=>({id:value,label:value}))} onClose={()=>setCategoryOpen(false)} onSelect={row=>setCategory(row.id)}/>
    <QualitySelector visible={urgencyOpen} title="Urgency" options={["Normal","Urgent","Critical"].map(value=>({id:value,label:value}))} onClose={()=>setUrgencyOpen(false)} onSelect={row=>setUrgency(row.id)}/>
    <QualitySelector visible={assigneeOpen} title="Assign to" options={[{id:"",label:"Not assigned"},...projectUsers.map(user=>({id:user.id,label:user.name,subtitle:user.role}))]} onClose={()=>setAssigneeOpen(false)} onSelect={row=>setAssignedToUserId(row.id)}/>
    <QualitySelector visible={notifyOpen} title="Notify an additional person" options={projectUsers.filter(user=>user.id!==assignedToUserId).map(user=>({id:user.id,label:`${notifyUserIds.includes(user.id)?"✓ ":""}${user.name}`,subtitle:user.role}))} onClose={()=>setNotifyOpen(false)} onSelect={row=>setNotifyUserIds(ids=>ids.includes(row.id)?ids.filter(id=>id!==row.id):[...ids,row.id])}/>
  </MaterialsShell>;
}

const styles=StyleSheet.create({label:{marginTop:3,marginBottom:4,fontSize:10,fontWeight:"900",color:"#64748b",textTransform:"uppercase"},selector:{minHeight:46,borderRadius:12,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",paddingHorizontal:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},value:{flex:1,color:"#0f172a",fontSize:13,fontWeight:"800"},input:{minHeight:44,borderRadius:12,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",paddingHorizontal:12,color:"#0f172a"},two:{flexDirection:"row",gap:8},grow:{flex:1,minWidth:0},notes:{minHeight:76,textAlignVertical:"top",paddingTop:10},save:{minHeight:48,borderRadius:13,backgroundColor:"#b45309",alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8},saveText:{color:"#fff",fontWeight:"900"}});

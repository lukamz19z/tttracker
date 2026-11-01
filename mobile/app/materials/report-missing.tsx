import { QualitySelector, type QualitySelectorOption } from "@/components/quality/QualitySelector";
import { MaterialsShell } from "@/components/materials/MaterialsShell";
import { useMaterials } from "@/contexts/MaterialsContext";
import { loadMaterialProjectUsers, searchMaterialRegister, type MaterialProjectUser, type MaterialSearchResult } from "@/lib/api/materials";
import { normalizeMissingMaterialType } from "@/lib/materials/canonical-material-type";
import { useLocalSearchParams, router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Camera, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Save, Trash2 } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { persistOfflineFile, removeOfflineFile } from "@/lib/offline/files";

const clean=(value:unknown)=>String(value??"").trim();
type Kind="bundle"|"member"|"bolt"|"j_bolt"|"nut"|"washer"|"packer"|"mesh"|"grid_mesh"|"plate"|"other";
type ExcessPhoto={localPhotoId:string;clientEvidenceId:string;uri:string;name:string;mimeType:string};
const TYPES:{id:Kind;label:string}[]=[{id:"bundle",label:"Bundle"},{id:"member",label:"Member"},{id:"bolt",label:"Bolt"},{id:"j_bolt",label:"J-Bolt"},{id:"nut",label:"Nut"},{id:"washer",label:"Washer"},{id:"packer",label:"Packer"},{id:"mesh",label:"Mesh"},{id:"grid_mesh",label:"Grid Mesh"},{id:"plate",label:"Plate"},{id:"other",label:"Other"}];
const dateDisplay=(date:Date)=>`${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}`;
const dateDb=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
function mutationId(){return `material-missing-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
function dateFromDb(value:string){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);return match?new Date(Number(match[1]),Number(match[2])-1,Number(match[3])):new Date();}

export default function ReportMissingMaterialScreen(){
  const {data,towerName,reportMissingMaterial,online}=useMaterials();
  const params=useLocalSearchParams<{towerId?:string}>();
  const [towerId,setTowerId]=useState(clean(params.towerId));
  const [issueType,setIssueType]=useState<"missing"|"excess">("missing");
  const [location,setLocation]=useState("Tower pad");
  const [disposition,setDisposition]=useState("Pickup Required");
  const [dispositionOpen,setDispositionOpen]=useState(false);
  const [kind,setKind]=useState<Kind>("bundle");
  const [sourceMode,setSourceMode]=useState<"existing"|"manual">("existing");
  const [itemId,setItemId]=useState("");
  const [itemLabel,setItemLabel]=useState("");
  const [description,setDescription]=useState("");
  const [specification,setSpecification]=useState("");
  const [category,setCategory]=useState("Bundle");
  const [quantity,setQuantity]=useState("1");
  const [unit,setUnit]=useState("ea");
  const [segment,setSegment]=useState("");
  const [member,setMember]=useState("");
  const [drawing,setDrawing]=useState("");
  const [urgency,setUrgency]=useState("Normal");
  const [requiredBy,setRequiredBy]=useState("");
  const [notes,setNotes]=useState("");
  const [excessPhotos,setExcessPhotos]=useState<ExcessPhoto[]>([]);
  const [towerOpen,setTowerOpen]=useState(false);
  const [typeOpen,setTypeOpen]=useState(false);
  const [itemOpen,setItemOpen]=useState(false);
  const [itemPickerKey,setItemPickerKey]=useState(0);
  const [urgencyOpen,setUrgencyOpen]=useState(false);
  const [assigneeOpen,setAssigneeOpen]=useState(false);
  const [notifyOpen,setNotifyOpen]=useState(false);
  const [dateOpen,setDateOpen]=useState(false);
  const [calendarMonth,setCalendarMonth]=useState(()=>new Date());
  const [assignmentUsers,setAssignmentUsers]=useState<MaterialProjectUser[]>([]);
  const [notifyUsers,setNotifyUsers]=useState<MaterialProjectUser[]>([]);
  const [assignedToUserId,setAssignedToUserId]=useState("");
  const [notifyUserIds,setNotifyUserIds]=useState<string[]>([]);
  const [saving,setSaving]=useState(false);
  const [catalogueQuery,setCatalogueQuery]=useState("");
  const [catalogueResults,setCatalogueResults]=useState<MaterialSearchResult[]>([]);
  const [catalogueLoading,setCatalogueLoading]=useState(false);
  const catalogueRequest=useRef(0);
  async function chooseExcessPhotos(camera:boolean){const permission=camera?await ImagePicker.requestCameraPermissionsAsync():await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted){Alert.alert("Photo permission required","Enable camera or photo access in Settings.");return;}const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:0.88}):await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.88,allowsMultipleSelection:true,selectionLimit:8});if(result.canceled)return;const added:ExcessPhoto[]=[];for(const asset of result.assets){const uri=await persistOfflineFile(asset.uri,"excess-report");const id=`excess-${Date.now()}-${Math.random().toString(36).slice(2,9)}`;added.push({localPhotoId:id,clientEvidenceId:id,uri,name:asset.fileName||`excess-${Date.now()}.jpg`,mimeType:asset.mimeType||"image/jpeg"});}setExcessPhotos(current=>[...current,...added]);}
  useEffect(()=>{if(data?.projectId&&online)void loadMaterialProjectUsers(data.projectId).then(choices=>{setAssignmentUsers(choices.assignmentUsers);setNotifyUsers(choices.notifyUsers);}).catch(()=>{setAssignmentUsers([]);setNotifyUsers([]);});},[data?.projectId,online]);
  useEffect(()=>{
    const requestId=++catalogueRequest.current;
    let cancelled=false;
    if(sourceMode!=="existing"||!itemOpen||!data?.projectId||!towerId||catalogueQuery.trim().length<2||!online){setCatalogueResults([]);setCatalogueLoading(false);return;}
    const timer=setTimeout(()=>{
      const searchKind=kind==="bundle"?"bundle":kind==="member"?"member":["bolt","j_bolt","nut","washer","packer","plate"].includes(kind)?"bolt":null;
      if(!searchKind){setCatalogueResults([]);setCatalogueLoading(false);return;}
      setCatalogueLoading(true);
      void searchMaterialRegister(data.projectId,searchKind,towerId,catalogueQuery).then(results=>{
        if(cancelled||requestId!==catalogueRequest.current)return;
        const filtered=kind==="packer"?results.filter(row=>/packer|spacer/i.test(`${row.record.item_type||""} ${row.record.bolt_type||""} ${row.title} ${row.subtitle}`)):
          kind==="j_bolt"?results.filter(row=>/j.?bolt|anchor/i.test(`${row.record.item_type||""} ${row.record.bolt_type||""} ${row.title} ${row.subtitle}`)):
          ["bolt","nut","washer","plate"].includes(kind)?results.filter(row=>{const type=String(row.record.item_type||"").toLowerCase();return kind==="bolt"?type==="bolt":kind==="nut"?type==="nut":kind==="washer"?type==="washer":type.includes("plate");}):results;
        setCatalogueResults(filtered);
      }).catch(()=>{if(!cancelled&&requestId===catalogueRequest.current)setCatalogueResults([]);}).finally(()=>{if(!cancelled&&requestId===catalogueRequest.current)setCatalogueLoading(false);});
    },300);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[catalogueQuery,data?.projectId,itemOpen,kind,online,sourceMode,towerId]);

  const towers=data?.towers||[];
  const towerOptions=towers.map(row=>({id:clean(row.id),label:clean(row.name)||clean(row.line)||"Tower"}));
  const segments=useMemo(()=>[...new Set([
    ...(data?.bundles||[]).filter(row=>!towerId||row.tower_id===towerId).map(row=>clean(row.section)),
    ...(data?.members||[]).filter(row=>!towerId||row.tower_id===towerId).flatMap(row=>[clean(row.tower_segment),clean(row.section)]),
    ...(data?.bolts||[]).filter(row=>!towerId||row.tower_id===towerId).map(row=>clean(row.tower_segment)),
  ].filter(Boolean))].sort((a,b)=>a.localeCompare(b)),[data?.bolts,data?.bundles,data?.members,towerId]);
  const [segmentOpen,setSegmentOpen]=useState(false);
  const itemOptions=useMemo<QualitySelectorOption[]>(()=>{
    const rows:QualitySelectorOption[]=[];
    if(sourceMode!=="existing")return rows;
    if(online)return catalogueResults.map(row=>({id:`${row.kind}:${row.id}`,label:row.title,subtitle:row.subtitle}));
    if(kind==="bundle")for(const row of (data?.bundles||[]).filter(item=>!towerId||item.tower_id===towerId))rows.push({id:`bundle:${clean(row.id)}`,label:`Bundle ${clean(row.bundle_no)}`,subtitle:clean(row.section)});
    if(kind==="member")for(const row of (data?.members||[]).filter(item=>!towerId||item.tower_id===towerId))rows.push({id:`member:${clean(row.id)}`,label:clean(row.mark_no)||"Member",subtitle:[clean(row.tower_segment||row.section),clean(row.drawing_number),clean(row.bundle_reference)].filter(Boolean).join(" · ")});
    if(["bolt","j_bolt","nut","washer","packer","plate"].includes(kind))for(const row of (data?.bolts||[]).filter(item=>!towerId||item.tower_id===towerId)){
      const type=clean(row.item_type).toLowerCase(),boltType=clean(row.bolt_type).toLowerCase();
      if(kind==="packer"&&type!=="packer")continue;
      if(kind!=="packer"&&type==="packer")continue;
      if(kind==="j_bolt"&&!/j.?bolt|anchor/.test(`${type} ${boltType}`))continue;
      if(kind==="bolt"&&type!=="bolt")continue;
      if(kind==="nut"&&type!=="nut")continue;
      if(kind==="washer"&&type!=="washer")continue;
      if(kind==="plate"&&!/plate/.test(type))continue;
      const bolt=[clean(row.bolt_diameter),clean(row.length)].filter(Boolean).join(" × ");
      const packer=[clean(row.bolt_diameter),clean(row.packer_no)].filter(Boolean).join(" mm ");
      const label=kind==="packer"?`${packer||clean(row.packer_mark)||"Packer"} Packer${row.packer_mark?` · ${clean(row.packer_mark)}`:""}`:[clean(row.item_type),kind==="j_bolt"?clean(row.bolt_type):"",bolt,clean(row.dn_sn)].filter(Boolean).join(" · ")||"Material";
      rows.push({id:`${kind==="packer"?"packer":"bolt"}:${clean(row.id)}`,label,subtitle:[clean(row.tower_segment),clean(row.drawing_number),clean(row.dn_sn)].filter(Boolean).join(" · ")});
    }
    return rows;
  },[catalogueResults,data?.bolts,data?.bundles,data?.members,kind,online,sourceMode,towerId]);
  const selectedSummary=useMemo(()=>{
    if(!itemId)return null;
    const [table,id]=itemId.split(":",2);
    const bundle=data?.bundles.find(row=>clean(row.id)===id);
    const selectedMember=data?.members.find(row=>clean(row.id)===id);
    const bolt=data?.bolts.find(row=>clean(row.id)===id);
    const segmentsForItem=[clean(bundle?.section),clean(selectedMember?.tower_segment||selectedMember?.section),clean(bolt?.tower_segment)].filter(Boolean);
    return {segments:[...new Set(segmentsForItem)],drawing:clean(selectedMember?.drawing_number||bolt?.drawing_number),member:clean(selectedMember?.mark_no),bundle:clean(selectedMember?.bundle_reference),table};
  },[data?.bolts,data?.bundles,data?.members,itemId]);

  function selectKind(next:Kind){setKind(next);setCategory(TYPES.find(type=>type.id===next)?.label||"Other");setItemId("");setItemLabel("");setDescription("");setSpecification("");setSegment("");setMember("");setDrawing("");setUnit("ea");setQuantity("1");}
  function selectExisting(row:QualitySelectorOption){
    const [table,id]=row.id.split(":",2);const bundle=data?.bundles.find(item=>clean(item.id)===id);const selectedMember=data?.members.find(item=>clean(item.id)===id);const bolt=data?.bolts.find(item=>clean(item.id)===id);
    const remote=catalogueResults.find(item=>item.id===id)?.record;
    setItemId(row.id);setItemLabel(row.label);setDescription(row.label);setCategory(TYPES.find(type=>type.id===kind)?.label||"Other");
    const spec=kind==="packer"?[clean(bolt?.bolt_diameter),clean(bolt?.packer_no)].filter(Boolean).join(" mm "):kind==="member"?[clean(selectedMember?.mark_no),clean(selectedMember?.pn_final)].filter(Boolean).join(" · "):kind==="bundle"?"":[clean(bolt?.bolt_diameter),clean(bolt?.length)].filter(Boolean).join(" × ");
    const knownSegments=[...new Set([clean(bundle?.section),clean(selectedMember?.tower_segment||selectedMember?.section),clean(bolt?.tower_segment)].filter(Boolean))];
    setSpecification(spec);setSegment(knownSegments.length===1?knownSegments[0]:"");setDrawing(clean(selectedMember?.drawing_number||bolt?.drawing_number));setMember(clean(selectedMember?.mark_no));setSourceMode("existing");
    if(remote){
      const remoteSegments=[clean(remote.section),clean(remote.tower_segment),clean(remote.segment)].filter(Boolean);
      if(remoteSegments.length===1)setSegment(remoteSegments[0]);
      setDrawing(clean(remote.drawing_number)||clean(remote.drawing_no)||clean(remote.drawing));
      setMember(clean(remote.mark_no)||clean(remote.member_number)||clean(remote.member_mark));
      setUnit(clean(remote.unit)||"ea");
      const remoteSpec=clean(remote.specification)||[clean(remote.bolt_diameter),clean(remote.length)].filter(Boolean).join(" × ")||[clean(remote.packer_no)].filter(Boolean).join(" mm ");
      if(remoteSpec)setSpecification(remoteSpec);
    }
    if(table==="bundle")setQuantity("1");
  }
  async function submit(){
    const finalDescription=sourceMode==="existing"?itemLabel:description.trim()||category;
    if(!towerId||!finalDescription||Number(quantity)<=0){Alert.alert("Item details required","Choose a tower, material and positive quantity.");return;}
    if(sourceMode==="existing"&&!itemId){Alert.alert("Choose a material","Select an existing register item or switch to Manual.");return;}
    setSaving(true);
    try{
      const [sourceTable,sourceRecordId]=sourceMode==="existing"&&itemId?itemId.split(":",2):["",""];
      const selectedBolt=data?.bolts.find(item=>clean(item.id)===sourceRecordId);
      const sourceTableName=sourceTable?`tower_${sourceTable==="member"?"material_members":sourceTable==="bolt"||sourceTable==="packer"?"material_bolts":"required_bundles"}`:undefined;
      const materialType=normalizeMissingMaterialType({sourceTable:sourceTableName,sourceRecordId,linkedType:kind==="member"?"steel_member":kind==="packer"?"packer_spacer":kind==="j_bolt"?"bolt":kind==="plate"?"flat_plate":selectedBolt?.item_type||kind,category});
      await reportMissingMaterial({issueType,towerId,clientMutationId:mutationId(),itemReference:sourceMode==="existing"?itemLabel:finalDescription,description:finalDescription,quantity:Number(quantity),unit:unit.trim()||"ea",category:category.trim()||"Other",specification:specification.trim()||undefined,sourceTable:sourceTableName,sourceRecordId:sourceRecordId||undefined,materialType,boltSize:kind==="bolt"||kind==="j_bolt"?specification:undefined,segment:segment.trim()||undefined,memberNumber:member.trim()||undefined,drawingNumber:drawing.trim()||undefined,urgency:issueType==="missing"?urgency:undefined,requiredBy:issueType==="missing"?(requiredBy||null):undefined,location:issueType==="excess"?location:undefined,disposition:issueType==="excess"?disposition:undefined,notes:notes.trim()||undefined,assignedToUserId:issueType==="missing"?(assignedToUserId||null):null,notifyUserIds:issueType==="missing"?notifyUserIds:[],initialEvidence:issueType==="excess"?excessPhotos:undefined});
      Alert.alert(online?(issueType==="excess"?"Excess":"Missing material")+" reported":"Saved for sync",online?"It is linked to the tower and available in Materials and the Daily Docket.":"The report is safely queued and will sync when connected.");router.back();
    }catch(error){const message=error instanceof Error?error.message:"Please retry.";Alert.alert(message.includes("photo needs retry")?"Excess reported, photo needs retry":"Could not report material",message);}finally{setSaving(false);}
  }
  const monthFirst=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1),calendarStart=new Date(monthFirst);calendarStart.setDate(1-monthFirst.getDay());
  const calendarDays=Array.from({length:42},(_,index)=>{const day=new Date(calendarStart);day.setDate(calendarStart.getDate()+index);return day;});
  const today=new Date();today.setHours(0,0,0,0);
  const selectedTypeLabel=TYPES.find(type=>type.id===kind)?.label||"Other";
  return <MaterialsShell title="Report Material Issue" subtitle="Report a missing or excess item against its tower.">
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.label}>What are you reporting?</Text><View style={styles.segmented}><Pressable style={[styles.segmentButton,issueType==="missing"&&styles.segmentActive]} onPress={()=>setIssueType("missing")}><Text style={[styles.segmentText,issueType==="missing"&&styles.segmentTextActive]}>Missing</Text></Pressable><Pressable style={[styles.segmentButton,issueType==="excess"&&styles.segmentActive]} onPress={()=>setIssueType("excess")}><Text style={[styles.segmentText,issueType==="excess"&&styles.segmentTextActive]}>Excess</Text></Pressable></View>
      <Text style={styles.label}>Tower</Text><Pressable style={styles.selector} onPress={()=>setTowerOpen(true)}><Text style={styles.value}>{towerName(towerId)||"Choose tower"}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
      <Text style={styles.label}>Material Type</Text><Pressable style={styles.selector} onPress={()=>setTypeOpen(true)}><Text style={styles.value}>{selectedTypeLabel}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
      <Text style={styles.label}>Source</Text><View style={styles.segmented}><Pressable style={[styles.segmentButton,sourceMode==="existing"&&styles.segmentActive]} onPress={()=>{setSourceMode("existing");setItemId("");setItemLabel("");}}><Text style={[styles.segmentText,sourceMode==="existing"&&styles.segmentTextActive]}>Existing</Text></Pressable><Pressable style={[styles.segmentButton,sourceMode==="manual"&&styles.segmentActive]} onPress={()=>{setSourceMode("manual");setItemId("");setItemLabel("");}}><Text style={[styles.segmentText,sourceMode==="manual"&&styles.segmentTextActive]}>Manual</Text></Pressable></View>
      {sourceMode==="existing"?<>
        <Text style={styles.label}>Material</Text><Pressable style={styles.selector} onPress={()=>setItemOpen(true)}><Text style={styles.value}>{itemLabel||`Search ${selectedTypeLabel.toLowerCase()} register`}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
        {itemId?<View style={styles.summary}><Text style={styles.summaryTitle}>{itemLabel}</Text><Text style={styles.summaryText}>{segment||selectedSummary?.segments.join(" · ")||"Location not recorded"}{drawing?` · Drawing ${drawing}`:""}</Text><Text style={styles.summaryText}>{specification?`${specification} · `:""}Unit: {unit}{member?` · Member ${member}`:""}</Text></View>:null}
        {itemId&&selectedSummary&&selectedSummary.segments.length>1?<><Text style={styles.label}>Select location</Text><Pressable style={styles.selector} onPress={()=>setSegmentOpen(true)}><Text style={styles.value}>{segment||"Choose matching segment"}</Text><ChevronDown size={18} color="#64748b"/></Pressable></>:null}
      </>:<>
        {kind!=="other"?<Text style={styles.helper}>Type: {selectedTypeLabel}. Add only the identifying details that are missing from the register.</Text>:<><Text style={styles.label}>Material Description</Text><TextInput value={description} onChangeText={setDescription} placeholder="e.g. Special fabricated item" style={styles.input}/></>}
        <Text style={styles.label}>Specification</Text><TextInput value={specification} onChangeText={setSpecification} placeholder={kind==="packer"?"e.g. 6 mm":"Size / specification"} style={styles.input}/>
        <Text style={styles.label}>Tower Segment · Optional</Text>{segments.length?<Pressable style={styles.selector} onPress={()=>setSegmentOpen(true)}><Text style={styles.value}>{segment||"Select segment"}</Text><ChevronDown size={18} color="#64748b"/></Pressable>:<TextInput value={segment} onChangeText={setSegment} placeholder="Other / manual location" style={styles.input}/>}
        <View style={styles.two}><View style={styles.grow}><Text style={styles.label}>Member · Optional</Text><TextInput value={member} onChangeText={setMember} placeholder="Member mark" style={styles.input}/></View><View style={styles.grow}><Text style={styles.label}>Drawing · Optional</Text><TextInput value={drawing} onChangeText={setDrawing} placeholder="Drawing number" style={styles.input}/></View></View>
        <Text style={styles.label}>Unit</Text><TextInput value={unit} onChangeText={setUnit} placeholder="ea" style={styles.input}/>
        <Text style={styles.unitSummary}>Unit · Optional: {unit}</Text>
      </>}
      <Text style={styles.label}>Quantity {issueType==="excess"?"Excess":"Missing"}</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" style={styles.input}/>
      {sourceMode==="existing"?<Text style={styles.unitSummary}>Unit: {unit}</Text>:null}
      {issueType==="excess"?<><Text style={styles.label}>Location</Text><TextInput value={location} onChangeText={setLocation} placeholder="Tower pad, laydown..." style={styles.input}/><Text style={styles.label}>Action</Text><Pressable style={styles.selector} onPress={()=>setDispositionOpen(true)}><Text style={styles.value}>{disposition}</Text><ChevronDown size={18} color="#64748b"/></Pressable><Text style={styles.label}>Evidence · Optional</Text><View style={styles.photoActions}><Pressable style={styles.photoButton} onPress={()=>void chooseExcessPhotos(true)}><Camera size={16} color="#0f172a"/><Text style={styles.photoButtonText}>Take Photo</Text></Pressable><Pressable style={styles.photoButton} onPress={()=>void chooseExcessPhotos(false)}><ImagePlus size={16} color="#0f172a"/><Text style={styles.photoButtonText}>Choose Photo</Text></Pressable></View>{excessPhotos.map(photo=><View key={photo.localPhotoId} style={styles.photoRow}><Image source={{uri:photo.uri}} alt={photo.name} style={styles.photoThumb}/><Text numberOfLines={1} style={styles.photoName}>{photo.name}</Text><Pressable accessibilityLabel="Remove photo" onPress={()=>{setExcessPhotos(rows=>rows.filter(row=>row.localPhotoId!==photo.localPhotoId));void removeOfflineFile(photo.uri);}}><Trash2 size={16} color="#be123c"/></Pressable></View>)}</>:null}
      {issueType==="missing"? <>
      <Text style={styles.label}>Urgency</Text><Pressable style={styles.selector} onPress={()=>setUrgencyOpen(true)}><Text style={styles.value}>{urgency}</Text><ChevronDown size={18} color="#64748b"/></Pressable>
      <View style={styles.dateLabelRow}><Text style={styles.label}>Required By · Optional</Text>{requiredBy?<Pressable onPress={()=>setRequiredBy("")}><Text style={styles.clear}>Clear</Text></Pressable>:null}</View>
      <View style={styles.dateShortcuts}><Pressable style={styles.shortcut} onPress={()=>setRequiredBy(dateDb(today))}><Text style={styles.shortcutText}>Today</Text></Pressable><Pressable style={styles.shortcut} onPress={()=>{const tomorrow=new Date(today);tomorrow.setDate(tomorrow.getDate()+1);setRequiredBy(dateDb(tomorrow));}}><Text style={styles.shortcutText}>Tomorrow</Text></Pressable><Pressable style={styles.shortcut} onPress={()=>{setCalendarMonth(requiredBy?dateFromDb(requiredBy):new Date());setDateOpen(true);}}><Text style={styles.shortcutText}>{requiredBy?dateDisplay(dateFromDb(requiredBy)):"Select date"}</Text><ChevronDown size={15} color="#334155"/></Pressable></View>
      {assignmentUsers.length>0?<><Text style={styles.label}>Assign To · Optional</Text><Pressable style={styles.selector} onPress={()=>setAssigneeOpen(true)}><Text style={styles.value}>{assignmentUsers.find(user=>user.id===assignedToUserId)?.name||"Select user"}</Text><ChevronDown size={18} color="#64748b"/></Pressable></>:null}
      {notifyUsers.length>0?<><Text style={styles.label}>Also Notify · Optional · configured recipients are notified automatically</Text><Pressable style={styles.selector} onPress={()=>setNotifyOpen(true)}><Text style={styles.value}>{notifyUserIds.length?`${notifyUserIds.length} selected · ${notifyUserIds.map(id=>notifyUsers.find(user=>user.id===id)?.name).filter(Boolean).join(", ")}`:"Add someone"}</Text><ChevronDown size={18} color="#64748b"/></Pressable></>:null}
      </>:null}
      <Text style={styles.label}>Notes · Optional</Text><TextInput value={notes} onChangeText={setNotes} placeholder="Optional" multiline style={[styles.input,styles.notes]}/>
      <Pressable disabled={saving} onPress={()=>void submit()} style={styles.save}><Save size={17} color="#fff"/><Text style={styles.saveText}>{saving?"Saving…":online?"Report "+(issueType==="excess"?"Excess":"Missing"):"Save Pending Sync"}</Text></Pressable>
    </ScrollView>
    <QualitySelector visible={towerOpen} title="Choose tower" options={towerOptions} onClose={()=>setTowerOpen(false)} onSelect={row=>{setTowerId(row.id);setTowerOpen(false);setItemId("");setItemLabel("");setSegment("");setCatalogueQuery("");}}/>
    <QualitySelector visible={typeOpen} title="Material type" options={TYPES.map(type=>({id:type.id,label:type.label}))} onClose={()=>setTypeOpen(false)} onSelect={row=>{selectKind(row.id as Kind);setCatalogueQuery("");setTypeOpen(false);}}/>
    <QualitySelector key={itemPickerKey} visible={itemOpen} title={`Search ${selectedTypeLabel}`} options={itemOptions} onQueryChange={setCatalogueQuery} emptyMessage={catalogueLoading?"Searching…":online&&catalogueQuery.length<2?"Type at least 2 characters to search this tower.":"No matching material found."} onClose={()=>{setItemOpen(false);setCatalogueQuery("");setItemPickerKey(value=>value+1);}} onSelect={selectExisting}/>
    <QualitySelector visible={segmentOpen} title="Select location" options={segments.map(value=>({id:value,label:value}))} onClose={()=>setSegmentOpen(false)} onSelect={row=>setSegment(row.id)}/>
    <QualitySelector visible={urgencyOpen} title="Urgency" options={["Normal","Urgent","Critical"].map(value=>({id:value,label:value}))} onClose={()=>setUrgencyOpen(false)} onSelect={row=>setUrgency(row.id)}/>
    <QualitySelector visible={dispositionOpen} title="Excess action" options={["Pickup Required","Transfer to Another Tower","Return to Laydown","Return to Supplier","Keep at Tower","Other"].map(value=>({id:value,label:value}))} onClose={()=>setDispositionOpen(false)} onSelect={row=>setDisposition(row.id)}/>
    <QualitySelector visible={assigneeOpen} title="Assign to" options={[{id:"",label:"Not assigned"},...assignmentUsers.map(user=>({id:user.id,label:user.name,subtitle:user.role}))]} onClose={()=>setAssigneeOpen(false)} onSelect={row=>setAssignedToUserId(row.id)}/>
    <QualitySelector visible={notifyOpen} title="Also notify" options={notifyUsers.filter(user=>user.id!==assignedToUserId).map(user=>({id:user.id,label:`${notifyUserIds.includes(user.id)?"✓ ":""}${user.name}`,subtitle:user.role}))} onClose={()=>setNotifyOpen(false)} onSelect={row=>setNotifyUserIds(ids=>ids.includes(row.id)?ids.filter(id=>id!==row.id):[...ids,row.id])}/>
    <Modal visible={dateOpen} transparent animationType="slide" onRequestClose={()=>setDateOpen(false)}><View style={styles.modalBackdrop}><View style={styles.calendar}><View style={styles.calendarHeader}><Pressable style={styles.calendarNav} onPress={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1))}><ChevronLeft size={22} color="#0f172a"/></Pressable><Text style={styles.calendarTitle}>{calendarMonth.toLocaleDateString("en-AU",{month:"long",year:"numeric"})}</Text><Pressable style={styles.calendarNav} onPress={()=>setCalendarMonth(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1))}><ChevronRight size={22} color="#0f172a"/></Pressable></View><View style={styles.weekdays}>{["S","M","T","W","T","F","S"].map((label,index)=><Text key={`${label}${index}`} style={styles.weekday}>{label}</Text>)}</View><View style={styles.days}>{calendarDays.map((day,index)=>{const chosen=requiredBy===dateDb(day),outside=day.getMonth()!==calendarMonth.getMonth();return <Pressable key={`${dateDb(day)}-${index}`} style={[styles.day,chosen&&styles.daySelected]} onPress={()=>{setRequiredBy(dateDb(day));setDateOpen(false);}}><Text style={[styles.dayText,outside&&styles.dayOutside,chosen&&styles.dayTextSelected]}>{day.getDate()}</Text></Pressable>;})}</View><Pressable style={styles.calendarCancel} onPress={()=>setDateOpen(false)}><Text style={styles.calendarCancelText}>Cancel</Text></Pressable></View></View></Modal>
  </MaterialsShell>;
}

const styles=StyleSheet.create({content:{gap:5,paddingBottom:22},label:{marginTop:6,marginBottom:2,fontSize:10,fontWeight:"900",color:"#64748b",textTransform:"uppercase"},selector:{minHeight:44,borderRadius:11,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",paddingHorizontal:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},value:{flex:1,color:"#0f172a",fontSize:13,fontWeight:"800"},input:{minHeight:43,borderRadius:11,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",paddingHorizontal:12,color:"#0f172a"},photoActions:{flexDirection:"row",gap:8},photoButton:{flex:1,minHeight:40,borderRadius:10,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6},photoButtonText:{fontSize:12,fontWeight:"800",color:"#0f172a"},photoRow:{flexDirection:"row",alignItems:"center",gap:8,borderRadius:9,backgroundColor:"#f8fafc",padding:6},photoThumb:{width:42,height:42,borderRadius:6},photoName:{flex:1,fontSize:11,color:"#475569"},two:{flexDirection:"row",gap:8},grow:{flex:1,minWidth:0},segmented:{flexDirection:"row",padding:3,borderRadius:11,backgroundColor:"#e2e8f0",gap:3},segmentButton:{flex:1,minHeight:37,alignItems:"center",justifyContent:"center",borderRadius:9},segmentActive:{backgroundColor:"#fff",elevation:1},segmentText:{color:"#475569",fontSize:13,fontWeight:"800"},segmentTextActive:{color:"#0f172a"},summary:{padding:10,borderRadius:10,backgroundColor:"#f1f5f9",marginTop:3},summaryTitle:{color:"#0f172a",fontSize:13,fontWeight:"900"},summaryText:{color:"#475569",fontSize:11,marginTop:3},helper:{color:"#64748b",fontSize:11,paddingVertical:3},unitSummary:{marginTop:-2,color:"#64748b",fontSize:11},dateLabelRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},clear:{color:"#0369a1",fontWeight:"800",fontSize:12},dateShortcuts:{flexDirection:"row",gap:7},shortcut:{minHeight:38,paddingHorizontal:11,borderRadius:10,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:3},shortcutText:{color:"#334155",fontWeight:"800",fontSize:12},notes:{minHeight:64,textAlignVertical:"top",paddingTop:9},save:{minHeight:48,borderRadius:13,backgroundColor:"#b45309",alignItems:"center",justifyContent:"center",flexDirection:"row",gap:8,marginTop:8},saveText:{color:"#fff",fontWeight:"900"},modalBackdrop:{flex:1,backgroundColor:"#0007",justifyContent:"flex-end"},calendar:{backgroundColor:"#fff",borderTopLeftRadius:20,borderTopRightRadius:20,padding:18,paddingBottom:28},calendarHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},calendarNav:{width:42,height:42,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:"#f1f5f9"},calendarTitle:{fontSize:16,fontWeight:"900",color:"#0f172a"},weekdays:{flexDirection:"row",marginTop:12},weekday:{width:"14.285%",textAlign:"center",fontSize:12,fontWeight:"800",color:"#64748b",paddingVertical:7},days:{flexDirection:"row",flexWrap:"wrap"},day:{width:"14.285%",aspectRatio:1,alignItems:"center",justifyContent:"center",borderRadius:20},daySelected:{backgroundColor:"#0369a1"},dayText:{color:"#0f172a",fontWeight:"700"},dayOutside:{color:"#cbd5e1"},dayTextSelected:{color:"#fff"},calendarCancel:{alignItems:"center",padding:12,marginTop:8},calendarCancelText:{color:"#475569",fontWeight:"800"}});

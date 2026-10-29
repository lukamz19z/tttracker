import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, View, useWindowDimensions, ActivityIndicator, Alert } from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { downloadQualityFile } from "@/lib/api/quality";
import { queueQualityPhotoDelete } from "@/lib/offline/quality-photo-deletion";
import { useSync } from "@/contexts/SyncContext";
import type { QualityFile } from "@/types/quality";
export type GalleryPhoto={id:string;role:string;uri?:string;file?:QualityFile};
function EvidenceImage({photo,active}:{photo:GalleryPhoto;active:boolean}) {
  const [uri,setUri]=useState(photo.uri),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
  useEffect(()=>{if(!active)return;let live=true;setError("");if(photo.uri)setUri(photo.uri);else if(photo.file)void downloadQualityFile(photo.file.id,photo.file.file_name,true).then(value=>{if(live)setUri(value);}).catch(error=>{if(live)setError(error instanceof Error?error.message:"Photo unavailable offline. Download its preview while connected.");});return()=>{live=false;};},[active,photo.uri,photo.file,attempt]);
  if(!active)return null;
  return uri?<Image source={{uri}} contentFit="contain" allowDownscaling style={{flex:1,width:"100%"}}/>:error?<Pressable onPress={()=>setAttempt(n=>n+1)}><Text style={{color:"white",padding:20}}>{error} · Retry</Text></Pressable>:<ActivityIndicator color="white"/>;
}
export function QualitySwipeViewer({photos,initialIndex,onClose,onDelete}:{photos:GalleryPhoto[];initialIndex:number;onClose:()=>void;onDelete?:(id:string)=>void}) {
  const {width}=useWindowDimensions();const [index,setIndex]=useState(initialIndex);
  return <Modal visible onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:"#020617"}}><View style={{flexDirection:"row",justifyContent:"space-between"}}><Pressable onPress={onClose} style={{padding:16,minHeight:44}}><Text style={{color:"white"}}>Close</Text></Pressable>{onDelete && photos[index]?<Pressable style={{padding:16}} onPress={()=>Alert.alert(`Delete this ${photos[index].role.includes("after")?"After":"Before"} photo?`,"Remove this photo and its pending upload?",[{text:"Cancel",style:"cancel"},{text:"Delete Photo",style:"destructive",onPress:()=>onDelete(photos[index].id)}])}><Text style={{color:"white"}}>⋯ Delete Photo</Text></Pressable>:null}</View>
    <FlatList horizontal pagingEnabled data={photos} keyExtractor={photo=>photo.id} initialScrollIndex={initialIndex} getItemLayout={(_,i)=>({length:width,offset:width*i,index:i})} initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} onMomentumScrollEnd={e=>setIndex(Math.round(e.nativeEvent.contentOffset.x/width))} renderItem={({item,index:position})=>{const phase=item.role.includes("after")?"AFTER":"BEFORE";const group=photos.filter(photo=>photo.role===item.role);return <View style={{width,flex:1,alignItems:"center"}}><Text style={{color:phase==="BEFORE"?"#fbbf24":"#34d399",fontWeight:"900",padding:12}}>{phase} · {group.findIndex(photo=>photo.id===item.id)+1} of {group.length}</Text><EvidenceImage photo={item} active={Math.abs(position-index)<=1}/></View>;}}/>
  </SafeAreaView></Modal>;
}
export function QualityEvidenceGallery({files,locked,onChanged}:{files:QualityFile[];locked:boolean;onChanged:()=>void}) {
  const {syncNow,online,refresh}=useSync();
  const [hidden,setHidden]=useState<string[]>([]),[viewer,setViewer]=useState<number|null>(null),[caching,setCaching]=useState("");
  const ordered=useMemo(()=>files.filter(file=>!hidden.includes(file.id)).sort((a,b)=>a.file_role.localeCompare(b.file_role)*-1 || a.created_at.localeCompare(b.created_at)),[files,hidden]);
  const photos=useMemo(()=>ordered.map(file=>({id:file.id,role:file.file_role,file})),[ordered]);
  function remove(file:QualityFile){const label=file.file_role==="before_photo"?"Before":"After";Alert.alert("Photo actions",file.file_name,[{text:"Cancel",style:"cancel"},{text:"Delete Photo",style:"destructive",onPress:()=>Alert.alert(`Delete this ${label} photo?`,"The deletion will sync to SharePoint. Removing required evidence makes the finding incomplete.",[{text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:()=>{void queueQualityPhotoDelete(file).then(async()=>{setHidden(ids=>[...ids,file.id]);await refresh();if(online)await syncNow({manual:false});onChanged();}).catch(error=>Alert.alert("Photo could not be deleted",String(error)));}}])}]);}
  async function cache(){setCaching("Downloading previews…");try{let count=0;for(const file of ordered){await downloadQualityFile(file.id,file.file_name,true);setCaching(`${++count} of ${ordered.length} cached`);}setCaching("Evidence previews available offline");}catch(error){setCaching(error instanceof Error?error.message:"Download failed. Retry while connected.");}}
  return <View style={{gap:8}}>{ordered.map((file,index)=>{const group=ordered.filter(row=>row.file_role===file.file_role);return <View key={file.id} style={{flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:"#cbd5e1",borderRadius:12}}><Pressable style={{flex:1,padding:12}} onPress={()=>setViewer(index)}><Text style={{fontWeight:"800"}}>{file.file_role==="before_photo"?"BEFORE":"AFTER"} · {group.findIndex(row=>row.id===file.id)+1} of {group.length}</Text><Text numberOfLines={1}>{file.file_name}</Text></Pressable>{!locked?<Pressable accessibilityLabel="Photo actions" style={{padding:14}} onPress={()=>remove(file)}><Text>⋯</Text></Pressable>:null}</View>;})}
    {ordered.length>0?<Pressable disabled={caching.includes(" of ") || caching==="Downloading previews…"} onPress={()=>void cache()} style={{padding:10}}><Text>{caching || "Download evidence previews for offline use"}</Text></Pressable>:null}
    {viewer!==null?<QualitySwipeViewer photos={photos} initialIndex={viewer} onClose={()=>setViewer(null)}/>:null}
  </View>;
}

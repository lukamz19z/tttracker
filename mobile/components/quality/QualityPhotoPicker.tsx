import { useNavigation } from "@react-navigation/native";
import { QualitySwipeViewer } from "./QualityEvidenceGallery";
import { deleteLocalQualityPhoto } from "@/lib/offline/quality-photo-deletion";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useRef, useState } from "react";
import { captureTimeFromExif, projectLocalCaptureTime, qualityCaptureLabel, qualityTimeZone } from "../../../lib/quality/date-time";
import { annotateQualityPhoto, photoContext } from "@/lib/quality-evidence";
import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, Trash2 } from "lucide-react-native";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { persistOfflineFile } from "@/lib/offline/files";
import type { LocalQualityPhoto } from "@/types/quality";

function id() {
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function persistAsset(asset: ImagePicker.ImagePickerAsset, prefix: string, capturedAt: string): Promise<LocalQualityPhoto> {
  const uri = await persistOfflineFile(asset.uri, prefix);
  const name = asset.fileName || `${prefix}-${Date.now()}.jpg`;
  return {
    width: asset.width, height: asset.height,
    watermarkPosition: "bottom-left",
    id: id(),
    uri, originalUri: uri,
    name,
    mimeType: asset.mimeType || "image/jpeg",
    capturedAt,
  };
}

export function QualityPhotoPicker({
  label,
  photos,
  onChange,
  required = false,
  prefix = "quality",
  context,
}: {
  context?: Record<string, unknown>;
  label: string;
  photos: LocalQualityPhoto[];
  onChange: (photos: LocalQualityPhoto[]) => void;
  required?: boolean;
  prefix?: string;
}) {
  const [preview,setPreview] = useState<number | null>(null);
  const busyRef=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;captureReply.current?.reject(new Error("Photo selection closed."));captureReply.current=null;};},[]);
  const [error,setError] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [capturePrompt,setCapturePrompt]=useState<string|null>(null);
  const [captureInput,setCaptureInput]=useState("");
  const captureReply=useRef<{resolve:(value:string)=>void;reject:(error:Error)=>void}|null>(null);
  const navigation=useNavigation();
  useEffect(()=>navigation.addListener("beforeRemove",event=>{if(busyRef.current){event.preventDefault();Alert.alert("Preparing photo","Wait for evidence preparation to finish before leaving this screen. The original is retained.");}}),[navigation]);
  const zone=qualityTimeZone(context?.timeZone);
  function confirmCaptureTime() {
    const iso=projectLocalCaptureTime(captureInput,zone);
    if(!iso){setError("Enter a valid capture date/time: YYYY-MM-DD HH:mm.");return;}
    captureReply.current?.resolve(iso);captureReply.current=null;setCapturePrompt(null);
  }
  function cancelCaptureTime() {captureReply.current?.reject(new Error("Photo capture date/time was not supplied."));captureReply.current=null;setCapturePrompt(null);}
  function requestCaptureTime(name:string) {setCaptureInput("");setCapturePrompt(name);return new Promise<string>((resolve,reject)=>{captureReply.current={resolve,reject};});}
  const contextKey = JSON.stringify(context || {});
  const phase = String(context?.phase || (label.toLowerCase().includes("after") ? "AFTER" : "BEFORE"));
  const collectAnnotation = (photo: LocalQualityPhoto) => context || prefix.startsWith("revision")
    ? annotateQualityPhoto(photo, photoContext(JSON.parse(contextKey),phase,photo.capturedAt)) : Promise.resolve(photo);
  useEffect(() => {
    if (!photos.length || (!contextKey || contextKey === "{}") && !prefix.startsWith("revision")) return;
    let active = true;
    void Promise.all(photos.map(photo => annotateQualityPhoto(photo,photoContext(JSON.parse(contextKey),phase,photo.capturedAt))))
      .then(next => { if (active && !busyRef.current && next.some((photo,index)=>photo.annotationKey !== photos[index].annotationKey || photo.annotatedUri !== photos[index].annotatedUri)) onChange(next); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Evidence annotation failed."); });
    return () => { active = false; };
  },[photos,contextKey,phase,prefix,onChange]);
  async function capture(action: () => Promise<void>) {
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError(null);
    try { await action(); } catch(error) { const message=error instanceof Error ? error.message : "Evidence annotation failed.";if(mounted.current){setError(message);Alert.alert("Photo could not be prepared",message);} }
    finally { busyRef.current=false;if(mounted.current)setBusy(false); }
  }
  function previewPhoto(photo: LocalQualityPhoto) {setPreview(photos.findIndex(row=>row.id===photo.id));}
  async function camera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {Alert.alert("Photo permission required","Enable camera or photo access in Settings.");return;}
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1, exif:true });
    if (result.canceled || !result.assets[0]) return;
    // Record immediately on camera return, before copying/rasterising/queueing.
    const capturedAt=captureTimeFromExif(result.assets[0].exif,Intl.DateTimeFormat().resolvedOptions().timeZone) || new Date().toISOString();
    const original=await persistAsset(result.assets[0],prefix,capturedAt);
    try { onChange([...photos,await collectAnnotation(original)]); }
    catch(error) { onChange([...photos,{...original,watermarkContext:photoContext(JSON.parse(contextKey),phase,original.capturedAt)}]);throw error; }
  }

  async function library() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {Alert.alert("Photo permission required","Enable camera or photo access in Settings.");return;}
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 6,
      exif:true,
    });
    if (result.canceled) return;
    const next: LocalQualityPhoto[] = [];
    for (const asset of result.assets) {
      const capturedAt=captureTimeFromExif(asset.exif,zone) || await requestCaptureTime(asset.fileName || "Selected photo");
      const original=await persistAsset(asset,prefix,capturedAt);
      try { next.push(await collectAnnotation(original)); }
      catch(error) { onChange([...photos,...next,{...original,watermarkContext:photoContext(JSON.parse(contextKey),phase,original.capturedAt)}]);throw error; }
    }
    onChange([...photos, ...next]);
  }

  function remove(photo:LocalQualityPhoto) {
    if(busyRef.current)return;
    Alert.alert(`Delete this ${phase==="AFTER"?"After":"Before"} photo?`,"The local photo and pending upload will be removed.",[{text:"Cancel",style:"cancel"},{text:"Delete Photo",style:"destructive",onPress:()=>void capture(async()=>{await deleteLocalQualityPhoto(photo);if(mounted.current)onChange(photos.filter(item=>item.id!==photo.id));})}]);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}{required ? " *" : ""}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.button} disabled={busy} onPress={() => void capture(camera)}>
          <Camera size={17} color="#0f172a" />
          <Text style={styles.buttonText}>Camera</Text>
        </Pressable>
        <Pressable style={styles.button} disabled={busy} onPress={() => void capture(library)}>
          <ImagePlus size={17} color="#0f172a" />
          <Text style={styles.buttonText}>Library</Text>
        </Pressable>
      </View>
      {photos.map((photo, index) => {
        const position = photo.watermarkPosition || "bottom-left";
        return <View key={photo.id} style={{ gap: 8 }}>
          <Pressable accessibilityLabel="Preview annotated evidence" onPress={() => void previewPhoto(photo)} style={{ width: "100%", maxWidth: 180, height: 135, alignSelf: "center" }}>
            <Image source={{ uri: photo.annotatedUri || photo.originalUri || photo.uri }} style={StyleSheet.absoluteFillObject} contentFit="contain" allowDownscaling />
          </Pressable>
          {context ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>{(["top-left","top-right","bottom-left","bottom-right"] as const).map(corner => <Pressable key={corner} onPress={() => onChange(photos.map(row => row.id === photo.id ? { ...row, watermarkPosition: corner } : row))} style={{ minHeight: 44, padding: 8, justifyContent: "center", borderRadius: 8, backgroundColor: corner === position ? "#dbeafe" : "#f1f5f9" }}><Text>{corner.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ")}</Text></Pressable>)}</View> : null}
          <View style={styles.photoRow}><Text style={styles.photoName} >{phase} ? {index + 1} of {photos.length} ? {photo.name}</Text><Pressable hitSlop={12} disabled={busy} accessibilityLabel="Delete Photo" onPress={() => remove(photo)}><Trash2 size={17} color="#be123c" /></Pressable></View>
          <Text style={styles.photoName}>{qualityCaptureLabel(photo.capturedAt,zone)}</Text>
        </View>;
      })}
      {busy ? <Text style={styles.required}>Preparing evidence image?</Text> : null}
      {error ? <Text style={styles.required}>{error}</Text> : null}
      <Modal visible={capturePrompt!==null} transparent onRequestClose={cancelCaptureTime}>
        <SafeAreaView style={{flex:1,backgroundColor:"rgba(0,0,0,0.6)",justifyContent:"center",padding:20}}>
          <View style={{backgroundColor:"white",padding:16,borderRadius:12,gap:10}}>
            <Text style={styles.label}>Photo capture date/time</Text>
            <Text>{capturePrompt} has no capture metadata. Enter when it was taken in {zone}.</Text>
            <TextInput accessibilityLabel="Photo capture date/time" placeholder="YYYY-MM-DD HH:mm" value={captureInput} onChangeText={setCaptureInput} style={{minHeight:44,borderWidth:1,padding:10,borderColor:"#cbd5e1"}} />
            {error ? <Text style={styles.required}>{error}</Text> : null}
            <View style={styles.actions}><Pressable style={styles.button} onPress={cancelCaptureTime}><Text>Cancel</Text></Pressable><Pressable style={styles.button} onPress={confirmCaptureTime}><Text>Use capture time</Text></Pressable></View>
          </View>
        </SafeAreaView>
      </Modal>
      {preview!==null?<QualitySwipeViewer photos={photos.map(photo=>({id:photo.id,role:phase==="AFTER"?"after_photo":"before_photo",uri:photo.annotatedUri || photo.originalUri || photo.uri}))} initialIndex={preview} onClose={()=>setPreview(null)}/>:null}
      {required && photos.length === 0 ? <Text style={styles.required}>At least one photo is required.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9 },
  label: { fontSize: 12, fontWeight: "900", color: "#334155" },
  actions: { flexDirection: "row", gap: 8 },
  button: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  buttonText: { color: "#0f172a", fontWeight: "800", fontSize: 12 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, backgroundColor: "#f8fafc", borderRadius: 11 },
  photoName: { flex: 1, minWidth: 0, flexShrink: 1, color: "#475569", fontSize: 12, fontWeight: "700" },
  required: { color: "#be123c", fontSize: 11, fontWeight: "700" },
});

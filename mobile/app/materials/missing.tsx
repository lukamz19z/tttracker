import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Camera, ImagePlus, Plus, Trash2 } from "lucide-react-native";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  MaterialCard,
  MaterialsShell,
} from "@/components/materials/MaterialsShell";
import { MaterialRegisterFilters } from "@/components/materials/MaterialRegisterFilters";
import { QualitySelector } from "@/components/quality/QualitySelector";
import { useMaterials } from "@/contexts/MaterialsContext";
import { persistOfflineFile, removeOfflineFile } from "@/lib/offline/files";
import { collectExcessMaterial, createExcessTransfer, loadMaterialProjectUsers, loadMissingMaterialDetails, saveMissingMaterialAction, uploadMaterialReceiptEvidence, type MaterialProjectUser } from "@/lib/api/materials";

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const INCLUDED_TYPES = new Set(["missing", "found_received", "excess", "damaged_incorrect"]);
const COLLECTION_TYPE = "excess_collected";

function eventLabel(value: unknown) {
  const type = clean(value);
  if (type === "missing") return "Missing";
  if (type === "found_received") return "Found / Received";
  if (type === "excess") return "Excess";
  if (type === "damaged_incorrect") return "Damaged / Incorrect";
  return type.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}/${date.getFullYear()}`;
}

type MaterialEventRow = Record<string, unknown>;
type MaterialItemRow = Record<string, unknown>;
type LocalReceiptPhoto={id:string;uri:string;name:string;mimeType:string};

type IndexedIssue = {
  event: MaterialEventRow;
  id: string;
  towerId: string;
  type: string;
  section: string;
  occurredAt: string;
  items: MaterialItemRow[];
  search: string;
  originalQty:number;
  receivedQty:number;
  remainingQty:number;
  status:"outstanding"|"partially_received"|"received"|"resolved"|"cancelled";
};

function eventItems(event: MaterialEventRow): MaterialItemRow[] {
  const nested = event.tower_material_event_items;
  if (Array.isArray(nested)) return nested as MaterialItemRow[];

  const items = event.items;
  return Array.isArray(items) ? (items as MaterialItemRow[]) : [];
}

function itemTitle(item: MaterialItemRow) {
  return (
    clean(item.item_reference) ||
    clean(item.bolt_size) ||
    clean(item.bundle_no) ||
    clean(item.item_description) ||
    "Material item"
  );
}

export default function MissingMaterials() {
  const params = useLocalSearchParams<{ issue_key?: string; material_issue_key?: string; material_event_id?: string; project_id?: string; tower_id?: string; action?: string; search?: string }>();
  const { data, towerName,recordMissingReceipt,resolveMissingMaterial,refresh,online } = useMaterials();

  const [query, setQuery] = useState(clean(params.search));
  const deferredQuery = useDeferredValue(query);
  const [towerId, setTowerId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(16);
  const [view,setView]=useState<"Outstanding"|"Arrived"|"History">("Outstanding");
  const [receiveIssue,setReceiveIssue]=useState<IndexedIssue|null>(null);
  const [collectIssue,setCollectIssue]=useState<IndexedIssue|null>(null);
  const [collectQty,setCollectQty]=useState("");
  const [collectReference,setCollectReference]=useState("");
  const [collectLocation,setCollectLocation]=useState("");
  const [collectNotes,setCollectNotes]=useState("");
  const [collectSaving,setCollectSaving]=useState(false);
  const [collectMutationId,setCollectMutationId]=useState("");
  const [collectPhotos,setCollectPhotos]=useState<LocalReceiptPhoto[]>([]);
  const [transferIssue,setTransferIssue]=useState<IndexedIssue|null>(null);
  const [transferDestination,setTransferDestination]=useState("");
  const [transferDestinationIssue,setTransferDestinationIssue]=useState("");
  const [transferQty,setTransferQty]=useState("");
  const [transferNotes,setTransferNotes]=useState("");
  const [transferSaving,setTransferSaving]=useState(false);
  const [transferMutationId,setTransferMutationId]=useState("");
  const [transferPicker,setTransferPicker]=useState<"tower"|"missing"|null>(null);
  const [receiveQty,setReceiveQty]=useState("");
  const [deliveryReference,setDeliveryReference]=useState("");
  const [receiveNotes,setReceiveNotes]=useState("");
  const [receiptSaving,setReceiptSaving]=useState(false);
  const [receiptPhotos,setReceiptPhotos]=useState<LocalReceiptPhoto[]>([]);
  const [receiptMutationIds,setReceiptMutationIds]=useState<Record<string,string>>({});
  const [receiptMutationId,setReceiptMutationId]=useState("");
  const [receiptSubmitAttempted,setReceiptSubmitAttempted]=useState(false);
  const [detailIssue,setDetailIssue]=useState<IndexedIssue|null>(null);
  const [detailData,setDetailData]=useState<{event:Record<string,unknown>;actions:Record<string,unknown>[];files:Record<string,unknown>[];receipts:Record<string,unknown>[]}|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [detailError,setDetailError]=useState("");
  const [projectUsers,setProjectUsers]=useState<MaterialProjectUser[]>([]);
  const [materialUsers,setMaterialUsers]=useState<MaterialProjectUser[]>([]);
  const [selectedAssignee,setSelectedAssignee]=useState("");
  const [selectedNotify,setSelectedNotify]=useState<string[]>([]);
  const [updateText,setUpdateText]=useState("");
  const [actionSaving,setActionSaving]=useState(false);
  const [cancelReason,setCancelReason]=useState("");
  const [userPicker,setUserPicker]=useState<"assignment"|"notify"|null>(null);
  const [deepLinkLoading,setDeepLinkLoading]=useState(false);
  const deepLinkHandledRef=useRef("");
  const deepIssueKey=clean(params.material_issue_key||params.issue_key);
  const deepEventId=clean(params.material_event_id);
  const deepProjectId=clean(params.project_id||data?.projectId);
  const deepTowerId=clean(params.tower_id);
  const deepAction=clean(params.action).toLowerCase();
  useEffect(()=>{if(deepIssueKey&&query===deepIssueKey)setQuery("");},[deepIssueKey,query]);

  function makeClientMutationId(){return `material-action-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;}
  function savedPersonName(id:string){const current=projectUsers.find(user=>user.id===id)?.name;if(current)return current;const labels=Array.isArray(detailData?.event.notify_user_labels)?detailData.event.notify_user_labels as {id:string;name:string}[]:[];return labels.find(user=>user.id===id)?.name||(clean(detailData?.event.assigned_to_user_id)===id?clean(detailData?.event.assigned_to_label):"")||"Project user";}
  async function openDetails(row:IndexedIssue){setDetailIssue(row);setDetailLoading(true);setDetailError("");try{if(!data?.projectId)throw new Error("Select a project first.");const payload=await loadMissingMaterialDetails(data.projectId,row.id);setDetailData(payload);setSelectedAssignee(clean(payload.event.assigned_to_user_id));setSelectedNotify(Array.isArray(payload.event.notify_user_ids)?payload.event.notify_user_ids.map(clean):[]);}catch(error){setDetailError(error instanceof Error?error.message:"Material details could not be loaded.");}finally{setDetailLoading(false);}}
  useEffect(()=>{
    if(!userPicker||!deepProjectId)return;
    let active=true;
    void loadMaterialProjectUsers(deepProjectId).then(users=>{if(active){setMaterialUsers(users.materialUsers);setProjectUsers(users.materialUsers);}}).catch(error=>{if(active)setDetailError(error instanceof Error?error.message:"Materials recipients could not be loaded.");});
    return()=>{active=false;};
  },[deepProjectId,userPicker]);
  useEffect(()=>{
    const targetKey=deepIssueKey||deepEventId;
    if(!targetKey||!deepProjectId||deepLinkHandledRef.current===targetKey)return;
    deepLinkHandledRef.current=targetKey;
    let active=true;
    setQuery("");
    setTowerId(deepTowerId);
    setView(deepAction==="resolved"||deepAction==="cancelled"?"History":deepAction==="partial_receipt"||deepAction==="full_receipt"?"Arrived":"Outstanding");
    setDeepLinkLoading(true);
    const started=Date.now();
    void loadMissingMaterialDetails(deepProjectId,deepIssueKey||undefined,deepEventId||undefined).then(payload=>{
      if(!active)return;
      const event=payload.event;
      const itemRows=Array.isArray(event.tower_material_event_items)?event.tower_material_event_items as MaterialItemRow[]:[];
      const item=itemRows.find(row=>clean(row.issue_key)===payload.issueKey)||itemRows.find(row=>Boolean(clean(row.issue_key)))||itemRows[0];
      if(!item)throw new Error("This Missing Material record no longer exists.");
      const total=Math.max(numberValue(item.quantity),0);
      const received=(payload.receipts||[]).reduce((sum,receipt)=>{
        const receiptItem=(receipt.tower_material_event_items as MaterialItemRow[]|undefined)?.[0];
        return sum+Math.max(numberValue(receiptItem?.quantity),0);
      },0);
      const remaining=Math.max(total-received,0);
      const recordStatus:IndexedIssue["status"]=clean(event.issue_status)==="cancelled"?"cancelled":remaining>0?(received>0?"partially_received":"outstanding"):clean(event.issue_status)==="resolved"?"resolved":"received";
      setView(recordStatus==="outstanding"||recordStatus==="partially_received"?"Outstanding":recordStatus==="received"?"Arrived":"History");
      setDetailIssue({event,id:payload.issueKey,towerId:clean(event.tower_id)||deepTowerId,type:"missing",section:clean(item.segment||item.bundle_section)||"General",occurredAt:clean(event.occurred_at),items:[item],originalQty:total,receivedQty:received,remainingQty:remaining,status:recordStatus,search:""});
      setDetailData(payload);
      setSelectedAssignee(clean(event.assigned_to_user_id));
      setSelectedNotify(Array.isArray(event.notify_user_ids)?event.notify_user_ids.map(clean):[]);
      if(__DEV__)console.debug("Missing Material notification open-to-detail",{durationMs:Date.now()-started,projectId:deepProjectId});
    }).catch(error=>{
      if(!active)return;
      setTowerId(deepTowerId);
      setTypeFilter("");
      setQuery("");
      setDetailError(error instanceof Error?error.message:"Missing Material could not be loaded. Showing the tower register.");
    }).finally(()=>{if(active)setDeepLinkLoading(false);});
    return()=>{active=false;};
  },[deepAction,deepEventId,deepIssueKey,deepProjectId,deepTowerId]);
  async function submitAction(actionType:"update"|"assignment"|"cancel",text=""){if(!detailIssue||!data?.projectId)return;setActionSaving(true);setDetailError("");try{await saveMissingMaterialAction({projectId:data.projectId,towerId:detailIssue.towerId,issueKey:detailIssue.id,clientMutationId:makeClientMutationId(),actionType,text,assignedToUserId:actionType==="assignment"?selectedAssignee||null:undefined,notifyUserIds:selectedNotify});setUpdateText("");setCancelReason("");await refresh();const payload=await loadMissingMaterialDetails(data.projectId,detailIssue.id);setDetailData(payload);if(actionType==="cancel")setDetailIssue({...detailIssue,status:"cancelled"});setSelectedAssignee(clean(payload.event.assigned_to_user_id));}catch(error){setDetailError(error instanceof Error?error.message:"Material update could not be saved.");}finally{setActionSaving(false);}}

  async function chooseReceiptPhotos(camera:boolean){
    const permission=camera?await ImagePicker.requestCameraPermissionsAsync():await ImagePicker.requestMediaLibraryPermissionsAsync();
    if(!permission.granted){Alert.alert("Photo permission required","Enable camera or photo access in Settings.");return;}
    const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:0.9}):await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.9,allowsMultipleSelection:true,selectionLimit:8});
    if(result.canceled)return;
    const next:LocalReceiptPhoto[]=[];
    for(const asset of result.assets){const uri=await persistOfflineFile(asset.uri,"material-receipt");next.push({id:`receipt-photo-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,uri,name:asset.fileName||`receipt-${Date.now()}.jpg`,mimeType:asset.mimeType||"image/jpeg"});}
    setReceiptPhotos(current=>[...current,...next]);
  }
  function cancelReceipt(){if(receiptSaving)return;if(!receiptSubmitAttempted){for(const photo of receiptPhotos)void removeOfflineFile(photo.uri);setReceiptPhotos([]);}setReceiveIssue(null);setReceiveQty("");setDeliveryReference("");setReceiveNotes("");setReceiptSubmitAttempted(false);}
  async function submitExcessCollection(){if(!collectIssue||!data?.projectId)return;const quantity=numberValue(collectQty);if(quantity<=0||quantity>collectIssue.remainingQty){Alert.alert("Check quantity",`Enter a quantity from 1 to ${collectIssue.remainingQty}.`);return;}setCollectSaving(true);try{await collectExcessMaterial({projectId:data.projectId,towerId:collectIssue.towerId,issueKey:collectIssue.id,quantity,clientMutationId:collectMutationId,location:collectLocation.trim()||undefined,reference:collectReference.trim()||undefined,notes:collectNotes.trim()||undefined});for(const photo of collectPhotos){await uploadMaterialReceiptEvidence({projectId:data.projectId,issueKey:collectIssue.id,receiptMutationId:collectMutationId,clientEvidenceId:`${collectMutationId}:${photo.id}`,localPhotoId:photo.id,uri:photo.uri,name:photo.name,mimeType:photo.mimeType});await removeOfflineFile(photo.uri);}setCollectPhotos([]);setCollectIssue(null);await refresh();Alert.alert("Collection recorded",quantity===collectIssue.remainingQty?`${quantity} collected · excess resolved`:`${quantity} collected · ${collectIssue.remainingQty-quantity} remaining`);}catch(error){Alert.alert("Could not record collection",error instanceof Error?error.message:"Retry when online.");}finally{setCollectSaving(false);}}
  async function submitExcessTransfer(){if(!transferIssue||!data?.projectId||!transferDestination)return;const quantity=numberValue(transferQty);if(quantity<=0||quantity>transferIssue.remainingQty){Alert.alert("Check quantity",`Enter a quantity from 1 to ${transferIssue.remainingQty}.`);return;}setTransferSaving(true);try{await createExcessTransfer({projectId:data.projectId,sourceTowerId:transferIssue.towerId,destinationTowerId:transferDestination,sourceIssueKey:transferIssue.id,destinationIssueKey:transferDestinationIssue||undefined,quantity,clientMutationId:transferMutationId,notes:transferNotes.trim()||undefined});setTransferIssue(null);await refresh();Alert.alert("Transfer started",`${quantity} transferred to ${towerName(transferDestination)}. Destination receipt is recorded when the transfer is confirmed.`);}catch(error){Alert.alert("Could not transfer material",error instanceof Error?error.message:"Retry when online.");}finally{setTransferSaving(false);}}
  async function chooseCollectPhotos(camera:boolean){const permission=camera?await ImagePicker.requestCameraPermissionsAsync():await ImagePicker.requestMediaLibraryPermissionsAsync();if(!permission.granted){Alert.alert("Photo permission required","Enable camera or photo access in Settings.");return;}const result=camera?await ImagePicker.launchCameraAsync({mediaTypes:["images"],quality:0.9}):await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.9,allowsMultipleSelection:true,selectionLimit:8});if(result.canceled)return;const next:LocalReceiptPhoto[]=[];for(const asset of result.assets){const uri=await persistOfflineFile(asset.uri,"material-excess-collection");next.push({id:`excess-photo-${Date.now()}-${Math.random().toString(36).slice(2,9)}`,uri,name:asset.fileName||`excess-${Date.now()}.jpg`,mimeType:asset.mimeType||"image/jpeg"});}setCollectPhotos(current=>[...current,...next]);}

  const indexed = useMemo<IndexedIssue[]>(() => {
    const events=((data?.materialEvents ?? []) as unknown as MaterialEventRow[]);
    const receipts=new Map<string,number>();
    for(const event of events.filter(row=>clean(row.event_type)==="found_received")) for(const item of eventItems(event)){const key=clean(item.source_issue_key);if(key)receipts.set(key,(receipts.get(key)||0)+Math.max(numberValue(item.quantity),0));}
    const collections=new Map<string,number>();
    for(const event of events.filter(row=>clean(row.event_type)===COLLECTION_TYPE)) for(const item of eventItems(event)){const key=clean(item.source_issue_key);if(key)collections.set(key,(collections.get(key)||0)+Math.max(numberValue(item.quantity),0));}
    const reserved=new Map<string,number>();
    for(const transfer of data?.transfers||[]){const key=clean(transfer.source_issue_key);if(key&&clean(transfer.status)==="in_transit")reserved.set(key,(reserved.get(key)||0)+Math.max(numberValue(transfer.quantity),0));}
    const rows = events.filter((event)=>INCLUDED_TYPES.has(clean(event.event_type))).flatMap((event, index) => {
        const items = eventItems(event);
        const issueTowerId = clean(event.tower_id);
        const type = clean(event.event_type);
        const section =
          clean(event.affected_section) ||
          clean(event.affected_activity) ||
          clean(items[0]?.bundle_section) ||
          "General";
        const occurredAt = clean(event.occurred_at);

        if (type !== "missing") {
          if(type==="excess")return items.filter(item=>Boolean(clean(item.issue_key))).map(item=>{const issueKey=clean(item.issue_key),originalQty=Math.max(numberValue(item.quantity),0),receivedQty=collections.get(issueKey)||0,remainingQty=Math.max(originalQty-receivedQty-(reserved.get(issueKey)||0),0),status:IndexedIssue["status"]=clean(event.issue_status)==="cancelled"?"cancelled":remainingQty<=0?"resolved":receivedQty>0?"partially_received":"outstanding";return {event,id:issueKey,towerId:issueTowerId,type,section:clean(item.segment||item.bundle_section)||section,occurredAt,items:[item],originalQty,receivedQty,remainingQty,status,search:[eventLabel(type),towerName(issueTowerId),section,event.notes,event.current_effect,event.work_outcome,item.item_reference,item.item_description,item.specification].map(clean).join(" ").toLowerCase()};});
          const quantity = items.reduce((sum, item) => sum + Math.max(numberValue(item.quantity), 0), 0);
          const itemSearch = items.flatMap((item) => [item.item_reference, item.item_description, item.material_type, item.bolt_size, item.bundle_no]).map(clean).join(" ");
          return [{ event, id: clean(event.id) || `event-${index}`, towerId: issueTowerId, type, section, occurredAt, items, originalQty: quantity, receivedQty: 0, remainingQty: 0, status: "received" as const, search: [eventLabel(type), towerName(issueTowerId), section, event.notes, itemSearch].map(clean).join(" ").toLowerCase() }];
        }

        return items.filter(item=>Boolean(clean(item.issue_key))).map(item=>{
        const itemsForIssue=[item];
        const issueKey=clean(item.issue_key);
        const originalQty=Math.max(numberValue(item.quantity),0);
        const receivedQty=receipts.get(issueKey)||0;
        const remainingQty=Math.max(originalQty-receivedQty,0);
        const status: IndexedIssue["status"] = clean(event.issue_status)==="cancelled"?"cancelled":remainingQty<=0?(clean(event.issue_status)==="resolved"?"resolved":"received"):receivedQty>0?"partially_received":"outstanding";
        const itemSearch = itemsForIssue
          .flatMap((item) => [
            item.item_reference,
            item.item_description,
            item.material_type,
            item.material_category,
            item.specification,
            item.bolt_size,
            item.bundle_no,
            item.bundle_section,
            item.segment,
            item.member_number,
            item.drawing_number,
          ])
          .map(clean)
          .join(" ");

        return {
          event,
          id: issueKey||clean(event.id)||`event-${index}`,
          towerId: issueTowerId,
          type,
          section,
          occurredAt,
          items:itemsForIssue,
          originalQty,receivedQty,remainingQty,status,
          search: [
            eventLabel(type),
            towerName(issueTowerId),
            section,
            event.notes,
            event.current_effect,
            event.work_outcome,
            itemSearch,
          ]
            .map(clean)
            .join(" ")
            .toLowerCase(),
        };});
      }).flat();

    return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [data?.materialEvents, data?.transfers, towerName]);

  const typeOptions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const row of indexed) {
      if (towerId && row.towerId !== towerId) continue;
      counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
    }

    const preferred = [
      "missing",
      "found_received",
      "excess",
      "damaged_incorrect",
    ];

    const total = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);

    return [
      { value: "", label: "All Issues", count: total },
      ...preferred
        .filter((value) => counts.has(value))
        .map((value) => ({
          value,
          label: eventLabel(value),
          count: counts.get(value) ?? 0,
        })),
    ];
  }, [indexed, towerId]);

  useEffect(() => {
    setVisibleCount(16);
  }, [data?.transfers, deferredQuery, towerId, typeFilter]);

  useEffect(() => {
    if (!typeFilter) return;
    if (typeOptions.some((option) => option.value === typeFilter)) return;
    setTypeFilter("");
  }, [typeFilter, typeOptions]);

  const rows = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase();

    return indexed.filter((row) => {
      if (towerId && row.towerId !== towerId) return false;
      if (typeFilter && row.type !== typeFilter) return false;
      if(view==="Outstanding"&&(row.remainingQty<=0||row.status==="cancelled"))return false;
      if(view==="Arrived"&&(row.remainingQty>0||row.status==="cancelled"))return false;
      if (search && !row.search.includes(search)) return false;
      return true;
    });
  }, [deferredQuery, indexed, towerId, typeFilter,view]);

  const totals = useMemo(() => {
    let items = 0;
    let quantity = 0;

    for (const row of rows) {
      items += row.items.length;
      quantity += row.remainingQty;
    }

    return { events: rows.length, items, quantity };
  }, [rows]);

  const issueCards = rows.slice(0, visibleCount).map((row) => {
    const itemSummary = row.items.slice(0, 4).map((item) => `${itemTitle(item)} × ${numberValue(item.quantity) || 1}`).join(", ");
    const extraItems = Math.max(row.items.length - 4, 0);
    const meta = [itemSummary ? `${itemSummary}${extraItems ? ` +${extraItems} more` : ""}` : clean(row.event.notes) || "No item detail", row.occurredAt ? formatDate(row.occurredAt) : ""].filter(Boolean).join(" · ");
    return <View key={row.id}><MaterialCard title={`${row.type==="excess"?"EXCESS · ":row.type==="missing"?"MISSING · ":""}${itemSummary || eventLabel(row.type)} · ${row.status === "cancelled" ? "Cancelled" : row.type==="excess"?`${row.remainingQty} Available`:`${row.remainingQty} Outstanding`}`} subtitle={`${towerName(row.towerId) || "Tower"} · ${row.section}`} meta={`${row.originalQty} ${row.type==="excess"?"excess":"missing"} · ${row.receivedQty} ${row.type==="excess"?"collected":"received"} · ${meta}`} />{row.remainingQty > 0 && row.status !== "cancelled" ? <Pressable style={styles.receiveButton} onPress={() => { if(row.type==="excess"){setCollectIssue(row);setCollectQty(String(row.remainingQty));setCollectReference("");setCollectLocation("");setCollectNotes("");setCollectMutationId(makeClientMutationId());return;} const existing = receiptMutationIds[row.id]; const mutationId = existing || makeClientMutationId(); if (!existing) setReceiptMutationIds(current => ({ ...current, [row.id]: mutationId })); setReceiptMutationId(mutationId); setReceiptSubmitAttempted(false); setReceiveIssue(row); setReceiveQty(String(row.remainingQty)); if (!existing) setReceiptPhotos([]); }}><Text style={styles.receiveButtonText}>{row.type==="excess"?"Collect / Action":"Receive"}</Text></Pressable> : row.status === "resolved" ? <Text style={styles.receivedLabel}>Resolved</Text> : row.status !== "cancelled" && row.remainingQty === 0 ? <Pressable style={styles.resolveButton} onPress={() => Alert.alert("Confirm resolved?", "Confirm this material requirement is satisfied.", [{ text: "Cancel", style: "cancel" }, { text: "Confirm Resolved", onPress: () => void resolveMissingMaterial({ towerId: row.towerId, issueKey: clean(row.items[0]?.issue_key) }).catch(error => Alert.alert("Could not resolve", error instanceof Error ? error.message : "Try again.")) }])}><Text style={styles.resolveText}>Confirm Resolved</Text></Pressable> : null}{row.type==="excess"&&row.remainingQty>0?<Pressable style={styles.detailButton} onPress={()=>{setTransferIssue(row);setTransferQty(String(row.remainingQty));setTransferDestination("");setTransferDestinationIssue("");setTransferNotes("");setTransferMutationId(makeClientMutationId());}}><Text style={styles.detailButtonText}>Transfer to Tower</Text></Pressable>:null}<Pressable style={styles.detailButton} onPress={() => void openDetails(row)}><Text style={styles.detailButtonText}>Details · History</Text></Pressable></View>;
  });
  if (rows.length > visibleCount) issueCards.push(<Pressable key="load-more" style={styles.loadMore} onPress={() => setVisibleCount(count => count + 16)}><Text style={styles.loadMoreText}>Load 16 more · {rows.length - visibleCount} remaining</Text></Pressable>);

  return (
    <>
    <MaterialsShell
      title="Missing & Excess"
      subtitle="Find material issues quickly without loading the whole register onto the screen."
      items={issueCards}
    >
      <Pressable style={styles.reportButton} onPress={()=>router.push({pathname:"/materials/report-missing",params:towerId?{towerId}:undefined})}><Plus size={17} color="#fff"/><Text style={styles.reportButtonText}>Report Material Issue</Text></Pressable>
      {deepLinkLoading?<Text style={styles.fieldHelp}>Opening Missing Material…</Text>:null}
      {!deepLinkLoading&&!detailIssue&&detailError?<Text style={styles.detailError}>{detailError} The tower register is filtered to the notification context.</Text>:null}
      <MaterialRegisterFilters
        towers={data?.towers ?? []}
        towerId={towerId}
        onTowerChange={setTowerId}
        towerName={towerName}
        query={query}
        onQueryChange={setQuery}
        placeholder="Search member, bundle, section, bolt or notes"
        filterLabel="Issue Type"
        options={typeOptions}
        filterValue={typeFilter}
        onFilterChange={setTypeFilter}
        resultCount={rows.length}
      />

      <View style={styles.views}>{(["Outstanding","Arrived","History"] as const).map(value=><Pressable key={value} onPress={()=>setView(value)} style={[styles.viewChip,view===value&&styles.viewChipActive]}><Text style={[styles.viewText,view===value&&styles.viewTextActive]}>{value}</Text></Pressable>)}</View>

      <View style={styles.summary}>
        <Summary label="Events" value={totals.events} />
        <Summary label="Items" value={totals.items} />
        <Summary label="Qty" value={totals.quantity} />
      </View>

      {!rows.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No material issues found</Text>
          <Text style={styles.emptyText}>
            Change the tower, issue type or search term.
          </Text>
        </View>
      ) : null}

    </MaterialsShell>
    <Modal visible={Boolean(receiveIssue)} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancelReceipt}>
      <SafeAreaView style={styles.receiveSafe} edges={["top","bottom"]}>
        <KeyboardAvoidingView style={styles.receiveKeyboard} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.receiveContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.receiveTitle}>Record Receipt</Text>
            <Text style={styles.receiveItem}>{receiveIssue ? itemTitle(receiveIssue.items[0] || {}) : "Material item"}</Text>
            <Text style={styles.receiveSub}>{receiveIssue ? `${towerName(receiveIssue.towerId)} · ${receiveIssue.section}` : ""}</Text>
            <Text style={styles.receiveQuantity}>{receiveIssue ? `${receiveIssue.originalQty} missing · ${receiveIssue.remainingQty} outstanding` : ""}</Text>
            <Text style={styles.fieldLabel}>Quantity Received</Text>
            <TextInput value={receiveQty} onChangeText={setReceiveQty} keyboardType="decimal-pad" accessibilityLabel="Quantity Received" placeholder="Enter quantity" style={styles.receiveInput}/>
            <Text style={styles.fieldHelp}>{receiveIssue?.remainingQty ?? 0} outstanding</Text>
            <Text style={styles.fieldLabel}>Delivery / Docket Reference <Text style={styles.optional}>Optional</Text></Text>
            <TextInput value={deliveryReference} onChangeText={setDeliveryReference} placeholder="e.g. Truck Docket 5472" style={styles.receiveInput}/>
            <Text style={styles.fieldLabel}>Notes <Text style={styles.optional}>Optional</Text></Text>
            <TextInput value={receiveNotes} onChangeText={setReceiveNotes} multiline textAlignVertical="top" placeholder="Add delivery or condition notes" style={[styles.receiveInput,styles.notesInput]}/>
            <View style={styles.receiveActions}>
              <Text style={styles.fieldLabel}>Delivery Evidence <Text style={styles.optional}>Optional</Text></Text>
              <View style={styles.photoActions}><Pressable style={styles.photoButton} onPress={()=>void chooseReceiptPhotos(true)}><Camera size={16} color="#0f172a"/><Text style={styles.photoButtonText}>Take Photo</Text></Pressable><Pressable style={styles.photoButton} onPress={()=>void chooseReceiptPhotos(false)}><ImagePlus size={16} color="#0f172a"/><Text style={styles.photoButtonText}>Choose Photo</Text></Pressable></View>
              {receiptPhotos.length>0?<Text style={styles.fieldHelp}>{receiptPhotos.length} photo{receiptPhotos.length===1?"":"s"} · saved on this device until synced</Text>:null}
              <View style={styles.photoList}>{receiptPhotos.map(photo=><View key={photo.id} style={styles.photoItem}><Image source={{uri:photo.uri}} alt={photo.name} style={styles.photoThumb} contentFit="cover"/><Text numberOfLines={1} style={styles.photoName}>{photo.name}</Text><Pressable accessibilityLabel="Remove receipt photo" onPress={()=>{setReceiptPhotos(rows=>rows.filter(row=>row.id!==photo.id));void removeOfflineFile(photo.uri);}}><Trash2 size={16} color="#be123c"/></Pressable></View>)}</View>
              <Pressable disabled={receiptSaving} style={[styles.submitReceipt,receiptSaving&&styles.disabled]} onPress={()=>void(async()=>{if(!receiveIssue)return;const qty=numberValue(receiveQty);if(qty<=0||qty>receiveIssue.remainingQty){Alert.alert("Check quantity",`Enter a quantity from 1 to ${receiveIssue.remainingQty}.`);return;}setReceiptSaving(true);setReceiptSubmitAttempted(true);try{await recordMissingReceipt({issueKey:clean(receiveIssue.items[0]?.issue_key),quantity:qty,clientMutationId:receiptMutationId,deliveryReference:deliveryReference.trim(),notes:receiveNotes.trim()},receiptPhotos);const remaining=receiveIssue.remainingQty-qty;setReceiveIssue(null);setDeliveryReference("");setReceiveNotes("");setReceiptPhotos([]);setReceiptMutationIds(current=>{const next={...current};delete next[receiveIssue.id];return next;});setReceiptMutationId("");setReceiptSubmitAttempted(false);Alert.alert(online?"Receipt recorded":"Receipt saved offline",online?(remaining===0?`${qty} received · requirement fully received`:`${qty} received · ${remaining} still outstanding`):`${qty} recorded locally with ${receiptPhotos.length} photo(s). They will sync when connection returns.`);}catch(error){Alert.alert("Receipt needs attention",error instanceof Error?error.message:"The receipt remains queued. Retry sync when connected.");}finally{setReceiptSaving(false);}})()}>
                <Text style={styles.submitReceiptText}>{receiptSaving?"Saving…":online?"Record Receipt":"Save Receipt Offline"}</Text>
              </Pressable>
              <Pressable onPress={cancelReceipt} style={styles.cancelReceive}><Text style={styles.cancelText}>Cancel</Text></Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
    <Modal visible={Boolean(collectIssue)} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setCollectIssue(null)}><SafeAreaView style={styles.receiveSafe} edges={["top","bottom"]}><KeyboardAvoidingView style={styles.receiveKeyboard} behavior={Platform.OS==="ios"?"padding":undefined}><ScrollView contentContainerStyle={styles.receiveContent} keyboardShouldPersistTaps="handled"><Text style={styles.receiveTitle}>Collect Excess Material</Text><Text style={styles.receiveItem}>{collectIssue?itemTitle(collectIssue.items[0]||{}):""}</Text><Text style={styles.receiveSub}>{collectIssue?`${towerName(collectIssue.towerId)} · ${collectIssue.section}`:""}</Text><Text style={styles.receiveQuantity}>{collectIssue?`${collectIssue.originalQty} excess · ${collectIssue.remainingQty} available`:""}</Text><Text style={styles.fieldLabel}>Quantity Collected</Text><TextInput value={collectQty} onChangeText={setCollectQty} keyboardType="decimal-pad" style={styles.receiveInput}/><Text style={styles.fieldLabel}>Destination / Location · Optional</Text><TextInput value={collectLocation} onChangeText={setCollectLocation} placeholder="Laydown or destination tower" style={styles.receiveInput}/><Text style={styles.fieldLabel}>Docket / Reference · Optional</Text><TextInput value={collectReference} onChangeText={setCollectReference} placeholder="Delivery or transfer reference" style={styles.receiveInput}/><Text style={styles.fieldLabel}>Delivery Evidence · Optional</Text><View style={styles.photoActions}><Pressable style={styles.photoButton} onPress={()=>void chooseCollectPhotos(true)}><Camera size={16} color="#0f172a"/><Text style={styles.photoButtonText}>Take Photo</Text></Pressable><Pressable style={styles.photoButton} onPress={()=>void chooseCollectPhotos(false)}><ImagePlus size={16} color="#0f172a"/><Text style={styles.photoButtonText}>Choose Photo</Text></Pressable></View>{collectPhotos.map(photo=><View key={photo.id} style={styles.photoItem}><Image source={{uri:photo.uri}} alt={photo.name} style={styles.photoThumb} contentFit="cover"/><Text numberOfLines={1} style={styles.photoName}>{photo.name}</Text><Pressable accessibilityLabel="Remove collection photo" onPress={()=>{setCollectPhotos(rows=>rows.filter(row=>row.id!==photo.id));void removeOfflineFile(photo.uri);}}><Trash2 size={16} color="#be123c"/></Pressable></View>)}<Text style={styles.fieldLabel}>Notes · Optional</Text><TextInput value={collectNotes} onChangeText={setCollectNotes} multiline style={[styles.receiveInput,styles.notesInput]}/><Pressable disabled={collectSaving||!online} style={[styles.submitReceipt,(collectSaving||!online)&&styles.disabled]} onPress={()=>void submitExcessCollection()}><Text style={styles.submitReceiptText}>{!online?"Connect to Collect":collectSaving?"Saving…":"Record Collection"}</Text></Pressable><Pressable style={styles.cancelReceive} onPress={()=>setCollectIssue(null)}><Text style={styles.cancelText}>Cancel</Text></Pressable></ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
    <Modal visible={Boolean(transferIssue)} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setTransferIssue(null)}><SafeAreaView style={styles.receiveSafe} edges={["top","bottom"]}><KeyboardAvoidingView style={styles.receiveKeyboard} behavior={Platform.OS==="ios"?"padding":undefined}><ScrollView contentContainerStyle={styles.receiveContent} keyboardShouldPersistTaps="handled"><Text style={styles.receiveTitle}>Transfer Excess Material</Text><Text style={styles.receiveItem}>{transferIssue?itemTitle(transferIssue.items[0]||{}):""}</Text><Text style={styles.receiveSub}>{transferIssue?`${towerName(transferIssue.towerId)} · ${transferIssue.remainingQty} available`:""}</Text><Text style={styles.fieldLabel}>Destination Tower</Text><Pressable style={styles.selector} onPress={()=>setTransferPicker("tower")}><Text style={styles.selectorText}>{towerName(transferDestination)||"Choose destination"}</Text><Text style={styles.fieldHelp}>Select</Text></Pressable><Text style={styles.fieldLabel}>Link destination Missing requirement · Optional</Text><Pressable style={styles.selector} onPress={()=>setTransferPicker("missing")}><Text style={styles.selectorText}>{transferDestinationIssue?itemTitle(indexed.find(row=>row.id===transferDestinationIssue)?.items[0]||{}):"Transfer without linking a Missing item"}</Text><Text style={styles.fieldHelp}>Select</Text></Pressable><Text style={styles.fieldLabel}>Quantity to Transfer</Text><TextInput value={transferQty} onChangeText={setTransferQty} keyboardType="decimal-pad" style={styles.receiveInput}/><Text style={styles.fieldHelp}>{transferIssue?.remainingQty||0} currently available</Text><Text style={styles.fieldLabel}>Notes · Optional</Text><TextInput value={transferNotes} onChangeText={setTransferNotes} multiline style={[styles.receiveInput,styles.notesInput]}/>{!online?<Text style={styles.detailError}>Transfer needs a connection. The source quantity is reserved atomically when submitted.</Text>:null}<Pressable disabled={transferSaving||!online||!transferDestination||numberValue(transferQty)<=0} style={[styles.submitReceipt,(transferSaving||!online||!transferDestination)&&styles.disabled]} onPress={()=>void submitExcessTransfer()}><Text style={styles.submitReceiptText}>{transferSaving?"Saving…":"Start Transfer"}</Text></Pressable><Pressable style={styles.cancelReceive} onPress={()=>setTransferIssue(null)}><Text style={styles.cancelText}>Cancel</Text></Pressable></ScrollView></KeyboardAvoidingView></SafeAreaView></Modal>
    <QualitySelector visible={transferPicker==="tower"} title="Choose destination tower" options={(data?.towers||[]).filter(tower=>clean(tower.id)!==transferIssue?.towerId).map(tower=>({id:clean(tower.id),label:clean(tower.name)||clean(tower.line)||"Tower"}))} onClose={()=>setTransferPicker(null)} onSelect={row=>{setTransferDestination(row.id);setTransferDestinationIssue("");setTransferPicker(null);}}/>
    <QualitySelector visible={transferPicker==="missing"} title="Link destination Missing requirement" options={[{id:"",label:"No linked Missing requirement"},...indexed.filter(row=>row.type==="missing"&&row.towerId===transferDestination&&row.remainingQty>0).map(row=>({id:row.id,label:itemTitle(row.items[0]||{}),subtitle:`${row.remainingQty} outstanding · ${row.section}`}))]} onClose={()=>setTransferPicker(null)} onSelect={row=>{setTransferDestinationIssue(row.id);setTransferPicker(null);}}/>
    <Modal visible={Boolean(detailIssue)} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>{setDetailIssue(null);setDetailData(null);}}>
      <SafeAreaView style={styles.receiveSafe} edges={["top","bottom"]}><ScrollView contentContainerStyle={styles.detailContent}>
        <Text style={styles.receiveTitle}>Missing Material Details</Text><Text style={styles.receiveItem}>{detailIssue?itemTitle(detailIssue.items[0]||{}):""}</Text><Text style={styles.receiveSub}>{detailIssue?`${towerName(detailIssue.towerId)} · ${detailIssue.section}`:""}</Text>
        {detailLoading?<Text style={styles.fieldHelp}>Loading history…</Text>:null}{detailError?<Text style={styles.detailError}>{detailError}</Text>:null}
        {detailData?<>
          <Text style={styles.fieldLabel}>Assigned To</Text><Pressable style={styles.selector} onPress={()=>setUserPicker("assignment")}><Text style={styles.selectorText}>{projectUsers.find(user=>user.id===selectedAssignee)?.name||clean(detailData.event.assigned_to_label)||"Unassigned"}</Text><Text style={styles.fieldHelp}>Change</Text></Pressable>
          <Pressable disabled={actionSaving} style={styles.detailActionButton} onPress={()=>void submitAction("assignment")}><Text style={styles.detailActionText}>Save Assignment</Text></Pressable>
          <Text style={styles.fieldLabel}>Additional Recipients</Text><Pressable style={styles.selector} onPress={()=>setUserPicker("notify")}><Text style={styles.selectorText}>{selectedNotify.map(savedPersonName).join(", ")||"None selected"}</Text><Text style={styles.fieldHelp}>Choose</Text></Pressable>
          <Text style={styles.fieldHelp}>Status: {clean(detailData.event.issue_status)||detailIssue?.status}</Text>{detailIssue?.status==="cancelled"&&detailData.event.cancellation_reason?<Text style={styles.detailError}>Cancelled: {String(detailData.event.cancellation_reason)}</Text>:null}
          <Text style={styles.sectionHeading}>Updates / history</Text>{detailData.actions.map(action=><View key={String(action.id)} style={styles.actionRow}><Text style={styles.actionMeta}>{String(action.action_type||"Update").replaceAll("_"," ").toUpperCase()}</Text><Text style={styles.actionBody}>{action.action_type==="assignment"?`Assigned to ${clean(action.assigned_to_label)||"Unassigned"}`:String(action.body||"")}</Text><Text style={styles.actionMeta}>{formatDate(action.created_at)} · {clean(action.author_label)||"Project user"}</Text></View>)}
          <Text style={styles.sectionHeading}>Receipt / collection history</Text>{detailData.receipts.map(receipt=>{const receiptItem=(receipt.tower_material_event_items as Record<string,unknown>[]|undefined)?.[0];const excessCollection=clean(receipt.event_type)==="excess_collected";return <View key={String(receipt.id)} style={styles.actionRow}><Text style={styles.actionBody}>{numberValue(receiptItem?.quantity)} {clean(receiptItem?.unit)||"ea"} {excessCollection?"collected":"received"} · {formatDate(receipt.occurred_at)}</Text><Text style={styles.actionMeta}>{clean(receipt.delivery_reference)||"No docket reference"} · {projectUsers.find(user=>user.id===receipt.created_by_user_id)?.name||"Project user"}</Text></View>;})}{detailData.receipts.length===0?<Text style={styles.fieldHelp}>No receipts or collections recorded.</Text>:null}
          <TextInput value={updateText} onChangeText={setUpdateText} placeholder="Supplier confirmed delivery tomorrow." multiline style={[styles.receiveInput,styles.notesInput]}/><Pressable disabled={actionSaving||!updateText.trim()} style={styles.detailActionButton} onPress={()=>void submitAction("update",updateText.trim())}><Text style={styles.detailActionText}>{actionSaving?"Saving…":"Add Update"}</Text></Pressable>
          <Text style={styles.sectionHeading}>Receipt Evidence</Text>{detailData.files.map(file=><View key={String(file.id)} style={styles.fileRow}>{String(file.mime_type).startsWith("image/")?<Image source={{uri:String(file.preview_url)}} alt={String(file.file_name)} style={styles.detailImage} contentFit="cover"/>:null}<Text numberOfLines={2} style={styles.photoName}>{String(file.file_name)}</Text><Pressable onPress={()=>{const url=String(file.preview_url||"");if(url)void import("react-native").then(module=>module.Linking.openURL(url));}}><Text style={styles.detailActionText}>View</Text></Pressable></View>)}{detailData.files.length===0?<Text style={styles.fieldHelp}>No receipt evidence attached.</Text>:null}
          {detailIssue?.status!=="cancelled"&&detailIssue?.status!=="resolved"?<><Text style={styles.sectionHeading}>Cancel Requirement</Text><TextInput placeholder="Cancellation reason" value={cancelReason} onChangeText={setCancelReason} style={styles.receiveInput}/><Pressable disabled={actionSaving||!cancelReason.trim()} style={styles.cancelButton} onPress={()=>void submitAction("cancel",cancelReason.trim())}><Text style={styles.cancelButtonText}>Cancel Requirement</Text></Pressable></>:null}
        </>:null}
        <Pressable style={styles.cancelReceive} onPress={()=>{setDetailIssue(null);setDetailData(null);}}><Text style={styles.cancelText}>Close</Text></Pressable>
      </ScrollView></SafeAreaView>
    </Modal>
    <Modal visible={Boolean(userPicker)} transparent animationType="fade" onRequestClose={()=>setUserPicker(null)}>
      <View style={styles.pickerBackdrop}><View style={styles.pickerCard}><Text style={styles.receiveTitle}>{userPicker==="assignment"?"Assign To":"Additional Recipients"}</Text><ScrollView style={{maxHeight:420}}>{userPicker==="assignment"?<Pressable style={styles.pickerRow} onPress={()=>{setSelectedAssignee("");setUserPicker(null);}}><Text>Unassigned</Text></Pressable>:null}{userPicker==="assignment"&&selectedAssignee&&!materialUsers.some(user=>user.id===selectedAssignee)?<Pressable style={styles.pickerRow} onPress={()=>setUserPicker(null)}><Text style={styles.selectorText}>{clean(detailData?.event.assigned_to_label)||"Current assignee"} · Keep current</Text><Text style={styles.fieldHelp}>No longer available for new assignment</Text></Pressable>:null}{materialUsers.map(user=><Pressable key={user.id} style={styles.pickerRow} onPress={()=>{if(userPicker==="assignment")setSelectedAssignee(user.id);else setSelectedNotify(ids=>ids.includes(user.id)?ids.filter(id=>id!==user.id):[...ids,user.id]);if(userPicker==="assignment")setUserPicker(null);}}><Text style={styles.selectorText}>{userPicker==="notify"&&selectedNotify.includes(user.id)?"✓ ":""}{user.name}</Text><Text style={styles.fieldHelp}>{user.role}</Text></Pressable>)}{!materialUsers.length?<Text style={styles.fieldHelp}>No notification users configured</Text>:null}</ScrollView><Pressable style={styles.cancelReceive} onPress={()=>setUserPicker(null)}><Text style={styles.cancelText}>Done</Text></Pressable></View></View>
    </Modal>
    </>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    gap: 7,
  },
  reportButton:{minHeight:44,borderRadius:12,backgroundColor:"#b45309",flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8},
  reportButtonText:{color:"#fff",fontSize:13,fontWeight:"900"},
  views:{flexDirection:"row",gap:6},viewChip:{borderRadius:999,borderWidth:1,borderColor:"#cbd5e1",paddingHorizontal:12,paddingVertical:8},viewChipActive:{backgroundColor:"#0f172a",borderColor:"#0f172a"},viewText:{fontSize:11,fontWeight:"800",color:"#475569"},viewTextActive:{color:"#fff"},
  receiveButton:{alignSelf:"flex-start",minHeight:38,marginTop:6,borderRadius:10,backgroundColor:"#047857",paddingHorizontal:15,alignItems:"center",justifyContent:"center"},
  receiveButtonText:{color:"#fff",fontSize:12,fontWeight:"900"},resolveButton:{alignSelf:"flex-start",minHeight:36,marginTop:6,borderRadius:10,backgroundColor:"#334155",paddingHorizontal:14,alignItems:"center",justifyContent:"center"},resolveText:{color:"#fff",fontSize:12,fontWeight:"800"},receivedLabel:{marginTop:5,color:"#047857",fontSize:11,fontWeight:"900"},receiveSafe:{flex:1,backgroundColor:"#f8fafc"},receiveKeyboard:{flex:1},receiveContent:{padding:20,paddingBottom:28,gap:8},receiveTitle:{fontSize:23,fontWeight:"900",color:"#0f172a"},receiveItem:{marginTop:12,fontSize:18,fontWeight:"900",color:"#0f172a"},receiveSub:{color:"#475569",fontSize:13,fontWeight:"700"},receiveQuantity:{marginTop:4,marginBottom:14,color:"#047857",fontSize:14,fontWeight:"900"},fieldLabel:{marginTop:8,fontSize:12,fontWeight:"900",color:"#334155"},optional:{color:"#94a3b8",fontSize:10,fontWeight:"700"},fieldHelp:{fontSize:11,color:"#64748b"},receiveInput:{minHeight:48,borderWidth:1,borderColor:"#cbd5e1",borderRadius:12,backgroundColor:"#fff",paddingHorizontal:12,color:"#0f172a"},notesInput:{minHeight:86,paddingTop:12},receiveActions:{marginTop:14,gap:10},submitReceipt:{minHeight:50,borderRadius:13,backgroundColor:"#047857",alignItems:"center",justifyContent:"center"},submitReceiptText:{color:"#fff",fontSize:14,fontWeight:"900"},disabled:{opacity:0.65},cancelReceive:{minHeight:44,borderRadius:12,borderWidth:1,borderColor:"#cbd5e1",backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},cancelText:{fontWeight:"800",color:"#475569"},
  photoActions:{flexDirection:"row",gap:8},photoButton:{minHeight:42,flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:11,borderWidth:1,borderColor:"#cbd5e1",borderRadius:11,backgroundColor:"#fff"},photoButtonText:{fontSize:12,fontWeight:"800",color:"#0f172a"},photoList:{gap:6},photoItem:{flexDirection:"row",alignItems:"center",gap:8,padding:7,backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e8f0",borderRadius:10},photoThumb:{width:48,height:42,borderRadius:7},photoName:{flex:1,fontSize:11,color:"#334155"},
  detailButton:{alignSelf:"flex-start",minHeight:36,justifyContent:"center",paddingHorizontal:5},detailButtonText:{fontSize:11,fontWeight:"800",color:"#2563eb"},detailContent:{padding:20,paddingBottom:32,gap:9},detailActionButton:{minHeight:42,alignItems:"center",justifyContent:"center",borderRadius:11,backgroundColor:"#0f172a"},detailActionText:{fontSize:12,fontWeight:"900",color:"#fff"},selector:{minHeight:44,borderWidth:1,borderColor:"#cbd5e1",borderRadius:11,paddingHorizontal:11,backgroundColor:"#fff",flexDirection:"row",alignItems:"center",justifyContent:"space-between"},selectorText:{flex:1,fontSize:12,fontWeight:"800",color:"#0f172a"},sectionHeading:{marginTop:8,fontSize:13,fontWeight:"900",color:"#0f172a"},actionRow:{padding:10,borderRadius:10,borderWidth:1,borderColor:"#e2e8f0",backgroundColor:"#fff",gap:4},actionBody:{fontSize:13,fontWeight:"700",color:"#0f172a"},actionMeta:{fontSize:10,color:"#64748b"},detailError:{color:"#be123c",fontWeight:"700"},detailImage:{width:54,height:48,borderRadius:7},fileRow:{flexDirection:"row",alignItems:"center",gap:7,padding:7,borderRadius:9,backgroundColor:"#fff"},cancelButton:{minHeight:42,alignItems:"center",justifyContent:"center",borderRadius:11,borderWidth:1,borderColor:"#fecdd3",backgroundColor:"#fff1f2"},cancelButtonText:{color:"#be123c",fontWeight:"900"},pickerBackdrop:{flex:1,justifyContent:"center",padding:18,backgroundColor:"rgba(15,23,42,0.45)"},pickerCard:{maxHeight:"80%",padding:14,borderRadius:16,backgroundColor:"#fff",gap:8},pickerRow:{minHeight:46,justifyContent:"center",borderBottomWidth:1,borderColor:"#f1f5f9",gap:2},
  summaryCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  summaryValue: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  summaryLabel: {
    marginTop: 1,
    color: "#64748b",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 28,
  },
  emptyTitle: {
    color: "#334155",
    fontWeight: "900",
  },
  emptyText: {
    marginTop: 3,
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "center",
  },
  loadMore: {
    minHeight: 44,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  loadMoreText: {
    color: "#334155",
    fontWeight: "900",
    fontSize: 11,
  },
});

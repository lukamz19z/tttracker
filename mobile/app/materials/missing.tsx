import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { Plus } from "lucide-react-native";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import {
  MaterialCard,
  MaterialsShell,
} from "@/components/materials/MaterialsShell";
import { MaterialRegisterFilters } from "@/components/materials/MaterialRegisterFilters";
import { useMaterials } from "@/contexts/MaterialsContext";

const clean = (value: unknown) => String(value ?? "").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const INCLUDED_TYPES = new Set(["missing", "found_received", "excess", "damaged_incorrect"]);

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
  status:"outstanding"|"partially_received"|"received"|"resolved";
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
  const { data, towerName,recordMissingReceipt,resolveMissingMaterial,online } = useMaterials();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [towerId, setTowerId] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [visibleCount, setVisibleCount] = useState(16);
  const [view,setView]=useState<"Outstanding"|"Arrived"|"History">("Outstanding");
  const [receiveIssue,setReceiveIssue]=useState<IndexedIssue|null>(null);
  const [receiveQty,setReceiveQty]=useState("");
  const [deliveryReference,setDeliveryReference]=useState("");
  const [receiveNotes,setReceiveNotes]=useState("");
  const [receiptSaving,setReceiptSaving]=useState(false);

  const indexed = useMemo<IndexedIssue[]>(() => {
    const events=((data?.materialEvents ?? []) as unknown as MaterialEventRow[]);
    const receipts=new Map<string,number>();
    for(const event of events.filter(row=>clean(row.event_type)==="found_received")) for(const item of eventItems(event)){const key=clean(item.source_issue_key);if(key)receipts.set(key,(receipts.get(key)||0)+Math.max(numberValue(item.quantity),0));}
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
        const status: IndexedIssue["status"] = remainingQty<=0?(clean(event.issue_status)==="resolved"?"resolved":"received"):receivedQty>0?"partially_received":"outstanding";
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
  }, [data?.materialEvents, towerName]);

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
  }, [deferredQuery, towerId, typeFilter]);

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
      if(view==="Outstanding"&&row.remainingQty<=0)return false;
      if(view==="Arrived"&&row.remainingQty>0)return false;
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

  return (
    <>
    <MaterialsShell
      title="Missing & Excess"
      subtitle="Find material issues quickly without loading the whole register onto the screen."
    >
      <Pressable style={styles.reportButton} onPress={()=>router.push({pathname:"/materials/report-missing",params:towerId?{towerId}:undefined})}><Plus size={17} color="#fff"/><Text style={styles.reportButtonText}>Report Missing Material</Text></Pressable>
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

      {rows.slice(0, visibleCount).map((row) => {
        const itemSummary = row.items
          .slice(0, 4)
          .map((item) => {
            const qty = numberValue(item.quantity) || 1;
            return `${itemTitle(item)} × ${qty}`;
          })
          .filter(Boolean)
          .join(", ");

        const extraItems = Math.max(row.items.length - 4, 0);
        const meta = [
          itemSummary
            ? `${itemSummary}${extraItems ? ` +${extraItems} more` : ""}`
            : clean(row.event.notes) || "No item detail",
          row.occurredAt ? formatDate(row.occurredAt) : "",
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <View key={row.id}><MaterialCard title={`${itemSummary||eventLabel(row.type)} · ${row.remainingQty} Outstanding`} subtitle={`${towerName(row.towerId) || "Tower"} · ${row.section}`} meta={`${row.originalQty} missing · ${row.receivedQty} received · ${meta}`} />{row.remainingQty>0?<Pressable style={styles.receiveButton} onPress={()=>{setReceiveIssue(row);setReceiveQty(String(row.remainingQty));}}><Text style={styles.receiveButtonText}>Receive</Text></Pressable>:row.status==="resolved"?<Text style={styles.receivedLabel}>Resolved</Text>:<Pressable style={styles.resolveButton} onPress={()=>Alert.alert("Confirm resolved?","Confirm this material requirement is satisfied.",[{text:"Cancel",style:"cancel"},{text:"Confirm Resolved",onPress:()=>void resolveMissingMaterial({towerId:row.towerId,issueKey:clean(row.items[0]?.issue_key)}).catch(error=>Alert.alert("Could not resolve",error instanceof Error?error.message:"Try again."))}])}><Text style={styles.resolveText}>Confirm Resolved</Text></Pressable>}</View>
        );
      })}

      {rows.length > visibleCount ? (
        <Pressable
          style={styles.loadMore}
          onPress={() => setVisibleCount((count) => count + 16)}
        >
          <Text style={styles.loadMoreText}>
            Load 16 more · {rows.length - visibleCount} remaining
          </Text>
        </Pressable>
      ) : null}
    </MaterialsShell>
    <Modal visible={Boolean(receiveIssue)} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setReceiveIssue(null)}><View style={styles.receiveModal}><Text style={styles.receiveTitle}>Record Receipt</Text><Text style={styles.receiveSub}>{receiveIssue?`${receiveIssue.originalQty} missing · ${receiveIssue.remainingQty} outstanding`:""}</Text><TextInput value={receiveQty} onChangeText={setReceiveQty} keyboardType="decimal-pad" placeholder="Quantity received" style={styles.receiveInput}/><TextInput value={deliveryReference} onChangeText={setDeliveryReference} placeholder="Delivery / docket reference (optional)" style={styles.receiveInput}/><TextInput value={receiveNotes} onChangeText={setReceiveNotes} placeholder="Notes (optional)" style={styles.receiveInput}/><Pressable disabled={receiptSaving} style={styles.receiveButton} onPress={()=>void(async()=>{if(!receiveIssue)return;const qty=numberValue(receiveQty);if(qty<=0||qty>receiveIssue.remainingQty){Alert.alert("Check quantity",`Enter a quantity up to ${receiveIssue.remainingQty}.`);return;}setReceiptSaving(true);try{await recordMissingReceipt({issueKey:clean(receiveIssue.items[0]?.issue_key),quantity:qty,deliveryReference:deliveryReference.trim(),notes:receiveNotes.trim()});setReceiveIssue(null);setDeliveryReference("");setReceiveNotes("");}catch(error){Alert.alert("Receipt not recorded",error instanceof Error?error.message:"Try again.");}finally{setReceiptSaving(false);}})()}><Text style={styles.receiveButtonText}>{receiptSaving?"Saving…":online?"Record Receipt":"Save Pending Sync"}</Text></Pressable><Pressable onPress={()=>setReceiveIssue(null)} style={styles.cancelReceive}><Text style={{fontWeight:"800",color:"#475569"}}>Cancel</Text></Pressable></View></Modal>
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
  receiveButtonText:{color:"#fff",fontSize:12,fontWeight:"900"},resolveButton:{alignSelf:"flex-start",minHeight:36,marginTop:6,borderRadius:10,backgroundColor:"#334155",paddingHorizontal:14,alignItems:"center",justifyContent:"center"},resolveText:{color:"#fff",fontSize:12,fontWeight:"800"},receivedLabel:{marginTop:5,color:"#047857",fontSize:11,fontWeight:"900"},receiveModal:{flex:1,justifyContent:"center",padding:22,gap:11,backgroundColor:"#f8fafc"},receiveTitle:{fontSize:22,fontWeight:"900",color:"#0f172a"},receiveSub:{color:"#64748b",fontSize:13},receiveInput:{minHeight:48,borderWidth:1,borderColor:"#cbd5e1",borderRadius:12,backgroundColor:"#fff",paddingHorizontal:12,color:"#0f172a"},cancelReceive:{alignItems:"center",padding:12},
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

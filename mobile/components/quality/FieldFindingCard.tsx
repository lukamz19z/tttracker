import { Pressable, Text, View } from "react-native";
import { MoreVertical } from "lucide-react-native";
import { QualityStatusPill } from "./QualityStatusPill";
import { qualityStyles as q } from "./QualityShell";
import type { FieldRow } from "../../../lib/quality/field-list";
import { operationalDetailSummary, type DetailSchema } from "../../../lib/quality/operational-details";

export function FieldFindingCard({ row, locked, onOpen, onActions, issueTypes=[] }: { row: FieldRow; locked: boolean; onOpen: () => void; onActions: () => void; issueTypes?:{id:string;detail_schema?:DetailSchema|null}[] }) {
  const { item } = row;
  const action = locked || row.workflow === "Rectified" ? "Review" : row.workflow === "In Progress" ? "Continue" : "Rectify";
  const detailSummary=operationalDetailSummary(issueTypes.find(type=>type.id===item.issue_type_id)?.detail_schema,item.operational_details);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${item.fli_number}, ${row.issueName}`} style={q.card} onPress={onOpen}>
    <View style={q.row}><Text style={[q.cardTitle, q.grow]}>{item.fli_number}</Text><QualityStatusPill value={row.workflow}/></View>
    <Text style={q.cardTitle}>{row.issueName}</Text>
    <Text style={q.muted}>{[row.source, item.external_reference, item.tower_segment, item.leg && `Leg ${item.leg}`, item.member_number && `Member ${item.member_number}`, (item as typeof item & {drawing_number?:string|null}).drawing_number && `Drawing ${(item as typeof item & {drawing_number?:string|null}).drawing_number}`].filter(Boolean).join(" · ")}</Text>
    <Text numberOfLines={2}>{item.finding}</Text>
    {detailSummary?<Text numberOfLines={1} style={[q.muted,{color:"#1e3a8a",fontWeight:"800"}]}>{detailSummary}</Text>:null}
    {item.pendingSync ? <Text style={q.muted}>Pending sync · check Sync status for confirmation</Text> : null}
    <View style={q.row}>
      <Text style={[q.muted, q.grow]}>{row.source}{row.assignment ? ` · Flag ${row.assignment.includes("@") ? "Assigned" : row.assignment}` : ""}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${item.fli_number}`} onPress={event=>{event.stopPropagation();onOpen();}} style={[q.primary, { minHeight: 48, minWidth: 96, borderRadius: 24 }]}><Text style={q.primaryText}>{action}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${item.fli_number}`} style={[q.secondary,{ minHeight: 48, minWidth: 48, borderRadius: 24 }]} onPress={event=>{event.stopPropagation();onActions();}}><MoreVertical size={22} color="#334155"/></Pressable>
    </View>
  </Pressable>;
}

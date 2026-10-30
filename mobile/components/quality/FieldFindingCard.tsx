import { Pressable, Text, View } from "react-native";
import { MoreVertical } from "lucide-react-native";
import { QualityStatusPill } from "./QualityStatusPill";
import { qualityStyles as q } from "./QualityShell";
import type { FieldRow } from "../../../lib/quality/field-list";

export function FieldFindingCard({ row, locked, onOpen, onActions }: { row: FieldRow; locked: boolean; onOpen: () => void; onActions: () => void }) {
  const { item } = row;
  const action = locked || row.workflow === "Rectified" ? "Review" : row.workflow === "In Progress" ? "Continue" : "Rectify";
  return <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${item.fli_number}, ${row.issueName}`} style={q.card} onPress={onOpen}>
    <View style={q.row}><Text style={[q.cardTitle, q.grow]}>{item.fli_number}</Text><QualityStatusPill value={row.workflow}/></View>
    <Text style={q.cardTitle}>{row.issueName}</Text>
    <Text style={q.muted}>{[item.external_reference, item.member_number && `Member ${item.member_number}`, item.leg && `Leg ${item.leg}`, item.tower_segment].filter(Boolean).join(" · ")}</Text>
    <Text numberOfLines={2}>{item.finding}</Text>
    {item.pendingSync ? <Text style={q.muted}>Pending sync · check Sync status for confirmation</Text> : null}
    <View style={q.row}>
      <Text style={[q.muted, q.grow]}>{row.source}{row.assignment ? ` · Flag ${row.assignment.includes("@") ? "Assigned" : row.assignment}` : ""}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${action} ${item.fli_number}`} onPress={event=>{event.stopPropagation();onOpen();}} style={[q.primary, { minHeight: 48, minWidth: 96, borderRadius: 24 }]}><Text style={q.primaryText}>{action}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Actions for ${item.fli_number}`} style={[q.secondary,{ minHeight: 48, minWidth: 48, borderRadius: 24 }]} onPress={event=>{event.stopPropagation();onActions();}}><MoreVertical size={22} color="#334155"/></Pressable>
    </View>
  </Pressable>;
}

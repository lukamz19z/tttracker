import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { DEFAULT_FIELD_STATE, FIELD_GROUPS, FIELD_STATUSES, filterFieldRows, type FieldListState, type FieldRow } from "../../../lib/quality/field-list";
import { qualityStyles as q } from "./QualityShell";
import { QualitySelector } from "./QualitySelector";

export function FieldListControls({ rows, state, onChange, sections, issueTypes, disabled }: { rows: FieldRow[]; state: FieldListState; onChange: (state: FieldListState) => void; sections: string[]; issueTypes: { id: string; name: string }[]; disabled?: boolean }) {
  const [picker, setPicker] = useState<string | null>(null);
  const facets = useMemo(() => {
    const sectionOptions = [...new Set([...sections, ...rows.map(row => row.section)])].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const typeOptions = new Map(issueTypes.map(type => [type.id, type.name]));
    for (const row of rows) if (!typeOptions.has(row.defectType)) typeOptions.set(row.defectType, row.defectType.startsWith("text:") ? `${row.issueName} (unmapped)` : row.issueName);
    const assignments = [...new Set(rows.map(row => row.assignment))].filter(Boolean).sort();
    return [
      { key: "status" as const, label: "Status", options: FIELD_STATUSES.map(value => ({ value, label: value })) },
      { key: "section" as const, label: "Section", options: [{ value: "", label: "All sections" }, ...sectionOptions.map(value => ({ value, label: value }))] },
      { key: "defectType" as const, label: "Defect type", options: [{ value: "", label: "All types" }, ...[...typeOptions].map(([value, label]) => ({ value, label }))] },
      { key: "source" as const, label: "Source", options: [{ value: "", label: "All sources" }, ...["Punchlist", "Manual"].map(value => ({ value, label: value }))] },
      ...(assignments.length ? [{ key: "assignment" as const, label: "Assignment flag", options: [{ value: "", label: "All flags" }, { value: "__unassigned__", label: "Unassigned" }, ...assignments.map(value => ({ value, label: value.includes("@") ? "Assigned flag (private)" : value }))] }] : []),
    ].map(facet => {
      const base = filterFieldRows(rows, { ...state, [facet.key]: facet.key === "status" ? "All" : "" });
      const counts = new Map<string, number>();
      for (const row of base) {
        const value = facet.key === "status" ? row.workflow : facet.key === "assignment" ? row.assignment || "__unassigned__" : row[facet.key];
        counts.set(value, (counts.get(value) || 0) + 1);
      }
      return { ...facet, options: facet.options.map(option => ({ ...option, count: option.value === "" || option.value === "All" ? base.length : counts.get(option.value) || 0 })) };
    });
  }, [rows, state, sections, issueTypes]);
  return <View style={[q.card, { gap: 7 }]}>
    <TextInput editable={!disabled} accessibilityLabel="Search findings" style={q.input} value={state.search} onChangeText={search => onChange({ ...state, search })} placeholder="Search FLI, reference, member, leg" />
    {facets.filter(facet=>facet.key==="status").map(facet => <View key={facet.key}>
      <Text style={q.fieldLabel}>{facet.label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 3 }} keyboardShouldPersistTaps="handled">
        {facet.options.map(option => <Pressable disabled={disabled} key={option.value} accessibilityRole="button" accessibilityState={{ selected: state[facet.key] === option.value }} onPress={() => onChange({ ...state, [facet.key]: option.value })} style={[state[facet.key] === option.value ? q.primary : q.secondary, { minHeight: 48, borderRadius: 24, paddingVertical: 8 }]}><Text style={state[facet.key] === option.value ? q.primaryText : q.secondaryText}>{option.label} {option.count}</Text></Pressable>)}
      </ScrollView>
    </View>)}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {facets.filter(facet=>facet.key!=="status").map(facet=>{
        const selected = facet.options.find(option=>option.value===state[facet.key]);
        return <Pressable disabled={disabled} key={facet.key} accessibilityRole="button" accessibilityLabel={`Filter ${facet.label}`} style={[state[facet.key] ? q.primary : q.secondary,{minHeight:48,borderRadius:24}]} onPress={()=>setPicker(facet.key)}><Text style={state[facet.key] ? q.primaryText : q.secondaryText}>{state[facet.key] ? `${selected?.label || facet.label} ${selected?.count ?? 0}` : facet.label} ▾</Text></Pressable>;
      })}
    </ScrollView>
    {facets.filter(facet=>facet.key===picker).map(facet=><QualitySelector key={facet.key} visible title={facet.label} options={facet.options.map(option=>({id:option.value,label:`${option.label} ${option.count}`}))} onClose={()=>setPicker(null)} onSelect={option=>{onChange({...state,[facet.key]:option.id});setPicker(null);}}/>)}
    <Text style={q.fieldLabel}>Group by</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {FIELD_GROUPS.map(group => <Pressable disabled={disabled} key={group} accessibilityRole="button" accessibilityState={{ selected: state.group === group }} onPress={() => onChange({ ...state, group })} style={[state.group === group ? q.primary : q.secondary, { borderRadius: 24, minHeight: 48 }]}><Text style={state.group === group ? q.primaryText : q.secondaryText}>{group}</Text></Pressable>)}
    </ScrollView>
    <Pressable disabled={disabled} accessibilityRole="button" style={q.secondary} onPress={() => onChange({ ...DEFAULT_FIELD_STATE, group: state.group })}><Text style={q.secondaryText}>Clear Filters</Text></Pressable>
  </View>;
}

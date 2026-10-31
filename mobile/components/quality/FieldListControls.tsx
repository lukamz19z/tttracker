import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { DEFAULT_FIELD_STATE, FIELD_GROUPS, FIELD_STATUSES, filterFieldRows, type FieldListState, type FieldRow } from "../../../lib/quality/field-list";
import { qualityStyles as q } from "./QualityShell";
import { QualitySelector } from "./QualitySelector";

export function FieldListControls({ rows, state, onChange, sections, issueTypes, disabled }: { rows: FieldRow[]; state: FieldListState; onChange: (state: FieldListState) => void; sections: string[]; issueTypes: { id: string; name: string }[]; disabled?: boolean }) {
  const [picker, setPicker] = useState<string | null>(null);
  const facets = useMemo(() => {
    const sectionOptions = [...new Set([...sections, ...rows.map(row => row.section)])].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const types = new Map(issueTypes.map(type => [type.id, type.name]));
    for (const row of rows) if (!types.has(row.defectType)) types.set(row.defectType, row.issueName);
    const assignments = [...new Set(rows.map(row => row.assignment))].filter(Boolean).sort();
    return [
      { key: "status" as const, label: "Status", options: FIELD_STATUSES.map(value => ({ value, label: value })) },
      { key: "section" as const, label: "Section", options: [{ value: "", label: "All sections" }, ...sectionOptions.map(value => ({ value, label: value }))] },
      { key: "defectType" as const, label: "Defect type", options: [{ value: "", label: "All types" }, ...[...types].map(([value, label]) => ({ value, label }))] },
      { key: "source" as const, label: "Source", options: [{ value: "", label: "All sources" }, ...["Punchlist", "Manual"].map(value => ({ value, label: value }))] },
      ...(assignments.length ? [{ key: "assignment" as const, label: "Assignment", options: [{ value: "", label: "All assignments" }, { value: "__unassigned__", label: "Unassigned" }, ...assignments.map(value => ({ value, label: value.includes("@") ? "Assigned" : value }))] }] : []),
    ].map(facet => {
      const base = filterFieldRows(rows, { ...state, [facet.key]: facet.key === "status" ? "All" : "" });
      const counts = new Map<string, number>();
      for (const row of base) { const value = facet.key === "status" ? row.workflow : facet.key === "assignment" ? row.assignment || "__unassigned__" : row[facet.key]; counts.set(value, (counts.get(value) || 0) + 1); }
      return { ...facet, options: facet.options.map(option => ({ ...option, count: !option.value || option.value === "All" ? base.length : counts.get(option.value) || 0 })) };
    });
  }, [rows, state, sections, issueTypes]);
  const active = [state.section, issueTypes.find(type=>type.id===state.defectType)?.name, state.status!=="All"?state.status:"", state.source, state.assignment?"Assignment":""].filter(Boolean).join(" · ");
  const buttonStyle={minHeight:40,borderRadius:20,paddingHorizontal:10,paddingVertical:5} as const;
  return <View style={[q.card,{gap:7}]}>
    <TextInput editable={!disabled} accessibilityLabel="Search findings" style={q.input} value={state.search} onChangeText={search=>onChange({...state,search})} placeholder="Search FLI, reference, member" />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:5,paddingVertical:2}} keyboardShouldPersistTaps="handled">
      {facets.filter(facet=>facet.key==="status").flatMap(facet=>facet.options.filter(option=>["Open","All"].includes(option.value)).map(option=><Pressable key={option.value} disabled={disabled} accessibilityRole="button" accessibilityState={{selected:state.status===option.value}} onPress={()=>onChange({...state,status:option.value})} style={[state.status===option.value?q.primary:q.secondary,buttonStyle]}><Text style={[state.status===option.value?q.primaryText:q.secondaryText,{fontSize:12}]}>{option.label} {option.count}</Text></Pressable>))}
      {facets.filter(facet=>["section","defectType"].includes(facet.key)).map(facet=>{const selected=facet.options.find(option=>option.value===state[facet.key]);return <Pressable key={facet.key} disabled={disabled} accessibilityRole="button" style={[state[facet.key]?q.primary:q.secondary,buttonStyle]} onPress={()=>setPicker(facet.key)}><Text style={[state[facet.key]?q.primaryText:q.secondaryText,{fontSize:12}]}>{selected?.label||facet.label} ▾</Text></Pressable>;})}
      <Pressable disabled={disabled} style={[q.secondary,buttonStyle]} onPress={()=>setPicker("more")}><Text style={[q.secondaryText,{fontSize:12}]}>More filters</Text></Pressable>
    </ScrollView>
    <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><Pressable disabled={disabled} style={[q.secondary,buttonStyle]} onPress={()=>setPicker("group")}><Text style={[q.secondaryText,{fontSize:12}]}>Group: {state.group} ▾</Text></Pressable>{active||state.search?<Pressable disabled={disabled} style={buttonStyle} onPress={()=>onChange({...DEFAULT_FIELD_STATE,group:state.group})}><Text style={{color:"#0f766e",fontWeight:"700",fontSize:12}}>Clear</Text></Pressable>:null}</View>
    {active||state.search?<Text numberOfLines={1} style={q.muted}>{[active,state.search&&`Search: ${state.search}`].filter(Boolean).join(" · ")}</Text>:null}
    {facets.filter(facet=>facet.key===picker||picker==="more"&&!["section","defectType"].includes(facet.key)).map(facet=><QualitySelector key={facet.key} visible title={facet.label} options={facet.options.map(option=>({id:option.value,label:`${option.label} ${option.count}`}))} onClose={()=>setPicker(null)} onSelect={option=>{onChange({...state,[facet.key]:option.id});setPicker(null);}}/>)}
    {picker==="group"?<QualitySelector visible title="Group findings" options={FIELD_GROUPS.map(group=>({id:group,label:group}))} onClose={()=>setPicker(null)} onSelect={option=>{onChange({...state,group:option.id as FieldListState["group"]});setPicker(null);}}/>:null}
  </View>;
}

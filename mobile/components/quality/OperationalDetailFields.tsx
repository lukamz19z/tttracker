import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { qualityStyles as q } from "./QualityShell";
import type { DetailField, DetailSchema, DetailValues } from "../../../lib/quality/operational-details";

export function OperationalDetailFields({ schema, values, onChange, disabled = false }: { schema?: DetailSchema | null; values: DetailValues; onChange: (values: DetailValues) => void; disabled?: boolean }) {
  if (!schema?.fields.length) return null;
  const set=(key:string,value:DetailValues[string])=>onChange({...values,[key]:value});
  const fieldByKey=new Map(schema.fields.map(field=>[field.key,field]));
  const counterpart=(key:string,side:"current"|"required")=>{
    const field=fieldByKey.get(key);if(!field)return null;
    const keys=side==="current"?[key.replace(/^required_/i,"existing_"),key.replace(/^required_/i,"current_")]:[key];
    for(const candidate of keys){if(candidate===key)continue;const found=fieldByKey.get(candidate);if(found)return found;}
    const target=field.label.replace(/^required\s+/i,side==="current"?"existing ":"required ").toLowerCase();
    return schema.fields.find(candidate=>candidate.key!==key&&candidate.label.toLowerCase()===target)||null;
  };
  const used=new Set<string>();
  const control=(field:DetailField,shortLabel?:string)=>{
    const value=values[field.key];const choices=field.type==="toggle"?["Not set","On","Off"]:field.options;
    const label=shortLabel||field.label.replace(/^(existing|current|required)\s+/i,"");
    return <View key={field.key} style={{gap:3,flex:1,minWidth:0}}><Text numberOfLines={1} style={{fontSize:10,color:"#64748b",fontWeight:"700"}}>{label}{field.unit?` (${field.unit})`:""}{field.required?" *":""}</Text>{choices?<ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:4}}>{(field.type==="toggle"||field.type==="multi-select"?choices:["Not set",...choices]).map(option=>{const selected=field.type==="toggle"?(option==="On"?value===true:option==="Off"?value===false:value===undefined||value===""):field.type==="multi-select"?Array.isArray(value)&&value.includes(option):option==="Not set"?!value:value===option;return <Pressable key={option} disabled={disabled} accessibilityRole="button" accessibilityState={{selected,disabled}} style={[selected?q.primary:q.secondary,{minHeight:36,borderRadius:18,paddingHorizontal:8,paddingVertical:5}]} onPress={()=>{if(field.type==="toggle")set(field.key,option==="Not set"?"":option==="On");else if(field.type==="multi-select"){const old=Array.isArray(value)?value:[];set(field.key,old.includes(option)?old.filter(entry=>entry!==option):[...old,option]);}else set(field.key,option==="Not set"?"":option);}}><Text style={{fontSize:11,fontWeight:"700",color:selected?"#fff":"#334155"}}>{option}</Text></Pressable>;})}</ScrollView>:<TextInput editable={!disabled} accessibilityLabel={field.label} style={{borderWidth:1,borderColor:"#cbd5e1",borderRadius:9,backgroundColor:"#fff",paddingHorizontal:8,minHeight:40,color:"#0f172a",fontSize:13}} value={value===undefined?"":String(value)} keyboardType={["number","quantity"].includes(field.type)?"decimal-pad":"default"} onChangeText={text=>set(field.key,["number","quantity"].includes(field.type)&&/^-?\d+(\.\d+)?$/.test(text)?Number(text):text)}/>}</View>;
  };
  const schemaMaterial=schema.material;
  const dimensionPairs=schemaMaterial?.dimensions.flatMap(part=>{const required=fieldByKey.get(part.field);if(!required)return[];const current=counterpart(required.key,"current");if(current){used.add(required.key);used.add(current.key);}return[{required,current,part}];})||[];
  const requiredQuantity=schemaMaterial?fieldByKey.get(schemaMaterial.quantityField):undefined;
  const currentQuantity=requiredQuantity?counterpart(requiredQuantity.key,"current"):null;
  if(requiredQuantity)used.add(requiredQuantity.key);if(currentQuantity)used.add(currentQuantity.key);
  if(schemaMaterial?.actionField)used.add(schemaMaterial.actionField);
  const side=(label:"Current"|"Required",isCurrent:boolean)=><View style={{flex:1,minWidth:0,borderRadius:11,backgroundColor:"#f8fafc",padding:8,gap:6}}><Text style={{fontSize:11,fontWeight:"900",color:"#334155"}}>{label}</Text><View style={{gap:6}}>{dimensionPairs.length?<View style={{flexDirection:"row",gap:5,alignItems:"flex-end"}}>{dimensionPairs.map((pair,index)=>{const field=isCurrent?pair.current:pair.required;if(isCurrent&&!field)return null;return <View key={pair.part.field} style={{flexDirection:"row",flex:1,minWidth:0,alignItems:"flex-end",gap:3}}>{control(field||pair.required)}{index<dimensionPairs.length-1?<Text style={{paddingBottom:10,color:"#64748b",fontWeight:"800"}}>×</Text>:null}</View>;})}</View>:null}{(isCurrent?currentQuantity:requiredQuantity)?control((isCurrent?currentQuantity:requiredQuantity)!,"Qty"):null}</View></View>;
  const actionField=schemaMaterial?.actionField?fieldByKey.get(schemaMaterial.actionField):null;
  return <View style={{gap:7}}><Text style={[q.cardTitle,{fontSize:13}]}>{schemaMaterial?`${schemaMaterial.label.replace(/s$/i,"").replace(/^./,letter=>letter.toUpperCase())} Change`:"Operational details"}</Text>
    {schemaMaterial&&dimensionPairs.length?<><View style={{flexDirection:"row",gap:7}}>{side("Current",true)}{side("Required",false)}</View>{actionField?control(actionField,"Change"):null}</>:null}
    <View style={{flexDirection:"row",flexWrap:"wrap",gap:7}}>{schema.fields.filter(field=>!used.has(field.key)).map(field=>control(field))}</View>
  </View>;
}

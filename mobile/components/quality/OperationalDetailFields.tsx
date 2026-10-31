import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { qualityStyles as q } from "./QualityShell";
import type { DetailSchema, DetailValues } from "../../../lib/quality/operational-details";

export function OperationalDetailFields({ schema, values, onChange, disabled = false }: { schema?: DetailSchema | null; values: DetailValues; onChange: (values: DetailValues) => void; disabled?: boolean }) {
  if (!schema?.fields.length) return null;
  return <View style={{ gap: 8 }}>
    <Text style={q.cardTitle}>Operational details</Text>
    <View style={{flexDirection:"row",flexWrap:"wrap",gap:8}}>{schema.fields.map(field => {
      const value = values[field.key];
      const set = (next: DetailValues[string]) => onChange({ ...values, [field.key]: next });
      const choices = field.type === "toggle" ? ["Not set", "On", "Off"] : field.options;
      return <View key={field.key} style={{ gap: 4,width:field.options||field.type==="toggle"?"100%":"48%"}}>
        <Text style={q.fieldLabel}>{field.label}{field.unit ? ` (${field.unit})` : ""}{field.required ? " *" : " (optional)"}</Text>
        {choices ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
          {(field.type === "toggle" || field.type === "multi-select" ? choices : ["Not set", ...choices]).map(option => {
            const selected = field.type === "toggle" ? (option === "On" ? value === true : option === "Off" ? value === false : value === undefined || value === "") : field.type === "multi-select" ? Array.isArray(value) && value.includes(option) : option === "Not set" ? !value : value === option;
            return <Pressable key={option} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected, disabled }} style={[selected ? q.primary : q.secondary, { minHeight: 42, borderRadius: 21, paddingHorizontal:10,paddingVertical:7 }]} onPress={() => {
              if (field.type === "toggle") set(option === "Not set" ? "" : option === "On");
              else if (field.type === "multi-select") { const old = Array.isArray(value) ? value : []; set(old.includes(option) ? old.filter(entry => entry !== option) : [...old, option]); }
              else set(option === "Not set" ? "" : option);
            }}><Text style={selected ? q.primaryText : q.secondaryText}>{option}</Text></Pressable>;
          })}
        </ScrollView> : <TextInput editable={!disabled} accessibilityLabel={field.label} style={q.input} value={value === undefined ? "" : String(value)} keyboardType={["number", "quantity"].includes(field.type) ? "decimal-pad" : "default"} onChangeText={text => {
          // Keep incomplete/invalid numeric input visible; validation must not silently coerce it.
          set(["number", "quantity"].includes(field.type) && /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : text);
        }} />}
      </View>;
    })}</View>
  </View>;
}

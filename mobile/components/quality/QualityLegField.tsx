import { useState } from "react";
import { Pressable, Text } from "react-native";
import { QualitySelector } from "./QualitySelector";
export function QualityLegField({ value, onChange }: { value?: string | null; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return <><Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ minHeight: 48, justifyContent: "center", padding: 10, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10 }}><Text>Leg: {value || "Not specified"}</Text></Pressable><QualitySelector visible={open} title="Leg" options={[{ id: "", label: "Not specified" }, ...["A","B","C","D"].map(id => ({ id, label: `Leg ${id}` }))]} onClose={() => setOpen(false)} onSelect={option => { onChange(option.id || null); setOpen(false); }} /></>;
}

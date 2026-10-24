import * as ImagePicker from "expo-image-picker";
import { Camera, ImagePlus, Trash2 } from "lucide-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { persistOfflineFile, removeOfflineFile } from "@/lib/offline/files";
import type { LocalQualityPhoto } from "@/types/quality";

function id() {
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function persistAsset(asset: ImagePicker.ImagePickerAsset, prefix: string): Promise<LocalQualityPhoto> {
  const uri = await persistOfflineFile(asset.uri, prefix);
  const name = asset.fileName || `${prefix}-${Date.now()}.jpg`;
  return {
    width: asset.width, height: asset.height,
    watermarkPosition: "bottom-left",
    id: id(),
    uri,
    name,
    mimeType: asset.mimeType || "image/jpeg",
    capturedAt: new Date().toISOString(),
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
  async function camera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    onChange([...photos, await persistAsset(result.assets[0], prefix)]);
  }

  async function library() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 6,
    });
    if (result.canceled) return;
    const next: LocalQualityPhoto[] = [];
    for (const asset of result.assets) next.push(await persistAsset(asset, prefix));
    onChange([...photos, ...next]);
  }

  async function remove(photo: LocalQualityPhoto) {
    await removeOfflineFile(photo.uri);
    onChange(photos.filter((item) => item.id !== photo.id));
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}{required ? " *" : ""}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={() => void camera()}>
          <Camera size={17} color="#0f172a" />
          <Text style={styles.buttonText}>Camera</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={() => void library()}>
          <ImagePlus size={17} color="#0f172a" />
          <Text style={styles.buttonText}>Library</Text>
        </Pressable>
      </View>
      {photos.map((photo, index) => {
        const position = photo.watermarkPosition || "bottom-left";
        const lines = [label.toLowerCase().includes("after") ? "AFTER" : "BEFORE", ...Object.entries(context || {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`), new Date(photo.capturedAt).toLocaleString()];
        return <View key={photo.id} style={{ gap: 8 }}>
          <View style={{ width: "100%", maxWidth: 320, aspectRatio: (photo.width || 4) / (photo.height || 3), alignSelf: "center" }}>
            <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
            {context ? <View pointerEvents="none" style={{ position: "absolute", maxWidth: "48%", padding: 5, backgroundColor: "rgba(0,0,0,0.65)", ...(position.startsWith("top") ? { top: 4 } : { bottom: 4 }), ...(position.endsWith("right") ? { right: 4 } : { left: 4 }) }}>{lines.map((line, i) => <Text key={i} numberOfLines={1} style={{ color: "white", fontSize: 9, fontWeight: i ? "400" : "900" }}>{line}</Text>)}</View> : null}
          </View>
          {context ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>{(["top-left","top-right","bottom-left","bottom-right"] as const).map(corner => <Pressable key={corner} onPress={() => onChange(photos.map(row => row.id === photo.id ? { ...row, watermarkPosition: corner } : row))} style={{ minHeight: 44, padding: 8, justifyContent: "center", borderRadius: 8, backgroundColor: corner === position ? "#dbeafe" : "#f1f5f9" }}><Text>{corner.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join(" ")}</Text></Pressable>)}</View> : null}
          <View style={styles.photoRow}><Text style={styles.photoName} numberOfLines={1}>{index + 1}. {photo.name}</Text><Pressable hitSlop={12} onPress={() => void remove(photo)}><Trash2 size={17} color="#be123c" /></Pressable></View>
        </View>;
      })}
      {required && photos.length === 0 ? <Text style={styles.required}>At least one photo is required.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 9 },
  label: { fontSize: 12, fontWeight: "900", color: "#334155" },
  actions: { flexDirection: "row", gap: 8 },
  button: { flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  buttonText: { color: "#0f172a", fontWeight: "800", fontSize: 12 },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, backgroundColor: "#f8fafc", borderRadius: 11 },
  photoName: { flex: 1, color: "#475569", fontSize: 12, fontWeight: "700" },
  required: { color: "#be123c", fontSize: 11, fontWeight: "700" },
});

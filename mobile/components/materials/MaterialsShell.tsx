import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

import { SyncStatus } from "@/components/sync/SyncStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useMaterials } from "@/contexts/MaterialsContext";

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f8fafc"},content:{padding:18,gap:12,paddingBottom:42},back:{flexDirection:"row",alignItems:"center",gap:7,alignSelf:"flex-start",paddingVertical:5},backText:{color:"#334155",fontWeight:"800"},eyebrow:{fontSize:11,fontWeight:"900",letterSpacing:1.1,color:"#2563eb"},heading:{fontSize:28,fontWeight:"900",color:"#0f172a"},muted:{color:"#64748b",lineHeight:20},cache:{fontSize:11,color:"#64748b"},error:{padding:11,borderRadius:11,backgroundColor:"#fff7ed",color:"#9a3412",fontWeight:"700"},card:{padding:15,borderWidth:1,borderColor:"#e2e8f0",backgroundColor:"#fff",borderRadius:15},cardTitle:{fontWeight:"900",color:"#0f172a"},cardSubtitle:{color:"#475569",marginTop:4},meta:{color:"#94a3b8",marginTop:6,fontSize:11,fontWeight:"600"}
});

export const materialStyles = styles;

export function MaterialsShell({ title, subtitle, children, root = false }: { title: string; subtitle?: string; children: ReactNode; root?: boolean }) {
  const { refreshing, refresh, cachedAt, error } = useMaterials();
  const { profile } = useAuth();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />} contentContainerStyle={styles.content}>
        {!root ? <Pressable onPress={() => router.back()} style={styles.back}><ArrowLeft size={16} color="#334155" /><Text style={styles.backText}>Back</Text></Pressable> : null}
        <Text style={styles.eyebrow}>MATERIALS · {profile?.projectNumber || profile?.projectName || "PROJECT"}</Text>
        <Text style={styles.heading}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
        <SyncStatus compact />
        {cachedAt ? <Text style={styles.cache}>Project cache updated {new Date(cachedAt).toLocaleString("en-AU")}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function MaterialCard({ title, subtitle, meta, onPress }: { title: string; subtitle?: string; meta?: string; onPress?: () => void }) {
  const content = <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}{meta ? <Text style={styles.meta}>{meta}</Text> : null}</View>;
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

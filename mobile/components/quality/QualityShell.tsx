import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft } from "lucide-react-native";
import { useCallback, useEffect, useRef, type PropsWithChildren, type ReactNode } from "react";
import {
  FlatList,
  View,
  Pressable,
  RefreshControl,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
  StyleSheet,
  Text,
} from "react-native";

import { AppFooter } from "@/components/common/AppFooter";
import { PermissionScreen } from "@/components/common/PermissionScreen";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { formatQualityDateTime } from "../../../lib/quality/date-time";
import { logQualityListRestore, qualityListAnchor, qualityListPosition, saveQualityListAnchor, saveQualityListPosition } from "@/lib/quality-list-position";

const qualityListViewability = { itemVisiblePercentThreshold: 1 };

export function QualityShell({
  permission,
  title,
  subtitle,
  root = false,
  compactHeader = false,
  children,
  virtualRows,
  listPositionKey,
  listScopeKey,
}: PropsWithChildren<{
  permission: "mobile.defects" | "mobile.rectifications";
  title: string;
  subtitle?: string;
  root?: boolean;
  compactHeader?: boolean;
  virtualRows?: {id:string;content:ReactNode}[];
  listPositionKey?: string;
  listScopeKey?: string;
}>) {
  const { profile } = useAuth();
  const { refreshing, refresh, cachedAt, error, data } = useQuality();
  const scrollRef=useRef<ScrollView>(null);
  const flatListRef=useRef<FlatList<{id:string;content:ReactNode}> | null>(null);
  const restoreTarget=useRef(0);
  const restorePending=useRef(false);
  const virtualRowsRef=useRef(virtualRows);
  useEffect(()=>{virtualRowsRef.current=virtualRows;},[virtualRows]);
  const handleViewableChanged=useCallback(({viewableItems}:{viewableItems:ViewToken[]})=>{
    const row=viewableItems.find(token=>token.isViewable&&token.item&&typeof (token.item as {id?:unknown}).id==="string");
    if(row?.item&&typeof (row.item as {id?:unknown}).id==="string"&&typeof row.index==="number"&&listPositionKey&&listScopeKey){
      saveQualityListAnchor(listPositionKey,listScopeKey,String((row.item as {id:string}).id),row.index,restoreTarget.current);
    }
  },[listPositionKey,listScopeKey]);
  const handleScrollToIndexFailed=useCallback(()=>{
    setTimeout(()=>flatListRef.current?.scrollToOffset({offset:restoreTarget.current,animated:false}),100);
  },[]);

  const restorePosition=useCallback(()=>{
    if(!listPositionKey||!listScopeKey)return;
    const offset=qualityListPosition(listPositionKey,listScopeKey);
    const anchor=qualityListAnchor(listPositionKey,listScopeKey);
    const anchorIndex=anchor?.anchorId?virtualRowsRef.current?.findIndex(row=>row.id===anchor.anchorId)??-1:-1;
    restoreTarget.current=offset;restorePending.current=offset>0&&anchorIndex<0;
    if(anchorIndex>=0)flatListRef.current?.scrollToIndex({index:anchorIndex,viewPosition:0,animated:false});
    else flatListRef.current?.scrollToOffset({offset,animated:false});
    scrollRef.current?.scrollTo({y:offset,animated:false});
    logQualityListRestore({projectId:listPositionKey.split(":")[3]||"",module:listPositionKey.split(":").at(-1)||"quality",offset,outcome:offset?"restored":"top"});
    if(offset>0)setTimeout(()=>{scrollRef.current?.scrollTo({y:restoreTarget.current,animated:false});if(anchorIndex>=0)flatListRef.current?.scrollToIndex({index:anchorIndex,viewPosition:0,animated:false});else flatListRef.current?.scrollToOffset({offset:restoreTarget.current,animated:false});},180);
  },[listPositionKey,listScopeKey]);

  useFocusEffect(useCallback(()=>{restorePosition();return()=>undefined;},[restorePosition]));

  const handleScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    const offset=event.nativeEvent.contentOffset.y;
    restoreTarget.current=offset;
    if(listPositionKey&&listScopeKey)saveQualityListPosition(listPositionKey,listScopeKey,offset);
  },[listPositionKey,listScopeKey]);

  const handleContentSizeChange=useCallback((_width:number,height:number)=>{
    if(restorePending.current&&height>=restoreTarget.current){scrollRef.current?.scrollTo({y:restoreTarget.current,animated:false});restorePending.current=false;}
  },[]);

  const content=<View style={{gap:compactHeader?5:10}}>
          {!root ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.back} onPress={() => router.back()}>
              <ArrowLeft size={16} color="#334155" />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : null}

          <Text style={styles.eyebrow}>
            QUALITY · {profile?.projectNumber || profile?.projectName || "PROJECT"}
          </Text>
          <Text style={[styles.heading,compactHeader&&styles.compactHeading]}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <SyncStatus compact />
          {cachedAt ? (
            <Text style={styles.cache}>Quality cache updated {formatQualityDateTime(cachedAt,data?.project?.timezone)}</Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {children}
  </View>;
  return <PermissionScreen permission={permission}><SafeAreaView style={styles.safe}>
    {virtualRows?<FlatList ref={flatListRef} data={virtualRows} keyExtractor={row=>row.id} renderItem={({item})=><View style={{marginBottom:compactHeader?4:8}}>{item.content}</View>} onViewableItemsChanged={handleViewableChanged} viewabilityConfig={qualityListViewability} onScroll={handleScroll} scrollEventThrottle={100} onContentSizeChange={handleContentSizeChange} onScrollToIndexFailed={handleScrollToIndexFailed} contentContainerStyle={[styles.content,compactHeader&&styles.compactContent]} ListHeaderComponent={content} ListFooterComponent={<AppFooter/>} initialNumToRender={8} maxToRenderPerBatch={6} windowSize={5} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh()}/>}/>:<ScrollView ref={scrollRef} onScroll={handleScroll} scrollEventThrottle={100} onContentSizeChange={handleContentSizeChange} contentContainerStyle={[styles.content,compactHeader&&styles.compactContent]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh()}/>} keyboardShouldPersistTaps="handled">{content}<AppFooter/></ScrollView>}
  </SafeAreaView></PermissionScreen>;
}

export const qualityStyles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 16, padding: 15, gap: 8 },
  cardTitle: { flexShrink: 1, minWidth: 0, color: "#0f172a", fontWeight: "900", fontSize: 15 },
  muted: { flexShrink: 1, minWidth: 0, color: "#64748b", fontSize: 12, lineHeight: 18 },
  fieldLabel: { color: "#334155", fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, backgroundColor: "#fff", paddingHorizontal: 12, minHeight: 46, color: "#0f172a" },
  select: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 12, backgroundColor: "#fff", padding: 12 },
  selectText: { flexShrink: 1, minWidth: 0, color: "#0f172a", fontWeight: "800" },
  primary: { minHeight: 44, backgroundColor: "#2563eb", borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontWeight: "900" },
  secondary: { minHeight: 44, backgroundColor: "#f1f5f9", borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  secondaryText: { color: "#334155", fontWeight: "900" },
  danger: { minHeight: 44, backgroundColor: "#fff1f2", borderRadius: 13, paddingHorizontal: 15, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  dangerText: { color: "#be123c", fontWeight: "900" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  grow: { flex: 1, minWidth: 0, flexShrink: 1 },
  error: { backgroundColor: "#fff1f2", color: "#be123c", padding: 11, borderRadius: 11, fontWeight: "700" },
  success: { backgroundColor: "#ecfdf5", color: "#047857", padding: 11, borderRadius: 11, fontWeight: "700" },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 14, gap: 10, paddingBottom: 12 },
  back: { minHeight: 44, minWidth: 64, flexDirection: "row", alignItems: "center", justifyContent:"center", gap: 7, alignSelf: "flex-start", paddingHorizontal:8 },
  backText: { color: "#334155", fontWeight: "800" },
  eyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.1, color: "#2563eb" },
  heading: { fontSize: 28, fontWeight: "900", color: "#0f172a" },
  compactHeading:{fontSize:22},
  compactContent:{padding:10,gap:6,paddingBottom:10},
  subtitle: { color: "#64748b", lineHeight: 20 },
  cache: { fontSize: 11, color: "#64748b" },
  error: { padding: 11, borderRadius: 11, backgroundColor: "#fff7ed", color: "#9a3412", fontWeight: "700" },
});

import { useFocusEffect, useRouter, type Href } from "expo-router";
import { Plus, Receipt, RefreshCw } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { PermissionScreen } from "@/components/common/PermissionScreen";
import { getMyFinance } from "@/lib/api/finance";
import type { FinancePayload } from "@/types/finance";

function money(value: unknown) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number.isFinite(number) ? number : 0);
}

export default function ExpensesScreen() {
  const router = useRouter();
  const [data, setData] = useState<FinancePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getMyFinance("expense_claim")); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Expense Claims could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const claims = useMemo(() => data?.submissions ?? [], [data?.submissions]);
  const outstanding = useMemo(() => claims.filter((row) => ["submitted", "changes_required"].includes(String(row.status))).length, [claims]);

  return (
    <PermissionScreen permission="mobile.expenses">
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={{ flex: 1 }}><Text style={styles.kicker}>MY FINANCE</Text><Text style={styles.title}>Expense Claims</Text><Text style={styles.subtitle}>Create claims, attach receipts and follow approval status from your phone.</Text></View>
          <Pressable style={styles.primary} onPress={() => router.push("/expenses/new" as Href)}><Plus size={18} color="#fff" /><Text style={styles.primaryText}>New</Text></Pressable>
        </View>
        <View style={styles.summary}><Receipt size={20} color="#2563eb" /><Text style={styles.summaryText}>{claims.length} claims · {outstanding} awaiting action</Text><Pressable onPress={() => void load()}><RefreshCw size={17} color="#64748b" /></Pressable></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator size="large" color="#2563eb" /> : claims.map((row) => {
          const id = String(row.id ?? "").trim();
          return <Pressable key={id} style={styles.card} onPress={() => router.push(`/expenses/${encodeURIComponent(id)}` as Href)}><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{String(row.submission_number || "Expense Claim")}</Text><Text style={styles.meta}>{String(row.description || "No description")}</Text><Text style={styles.meta}>{String(row.status || "draft").replaceAll("_", " ")}</Text></View><Text style={styles.amount}>{money(row.total_amount)}</Text></Pressable>;
        })}
      </ScrollView>
    </PermissionScreen>
  );
}

const styles=StyleSheet.create({screen:{flex:1,backgroundColor:"#f8fafc"},content:{padding:16,paddingBottom:40,gap:12},hero:{flexDirection:"row",gap:12,backgroundColor:"#fff",borderRadius:20,borderWidth:1,borderColor:"#e2e8f0",padding:18},kicker:{color:"#2563eb",fontSize:10,fontWeight:"900",letterSpacing:1.2},title:{color:"#0f172a",fontSize:23,fontWeight:"900",marginTop:4},subtitle:{color:"#64748b",fontSize:12,lineHeight:18,marginTop:5},primary:{backgroundColor:"#2563eb",borderRadius:13,paddingHorizontal:13,paddingVertical:10,flexDirection:"row",gap:6,alignItems:"center"},primaryText:{color:"#fff",fontSize:12,fontWeight:"900"},summary:{flexDirection:"row",gap:8,alignItems:"center",backgroundColor:"#eff6ff",borderRadius:14,padding:13},summaryText:{flex:1,color:"#1e3a8a",fontWeight:"800",fontSize:12},card:{flexDirection:"row",alignItems:"center",gap:10,backgroundColor:"#fff",borderWidth:1,borderColor:"#e2e8f0",borderRadius:16,padding:14},cardTitle:{color:"#0f172a",fontWeight:"900",fontSize:14},meta:{color:"#64748b",fontSize:11,marginTop:4,textTransform:"capitalize"},amount:{color:"#0f172a",fontWeight:"900",fontSize:14},error:{backgroundColor:"#fff1f2",color:"#be123c",padding:12,borderRadius:12,fontWeight:"700",fontSize:12}});

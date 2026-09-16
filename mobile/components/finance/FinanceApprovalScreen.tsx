import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";

import { apiFetch } from "@/lib/api/client";
import { getApprovalDetail, reviewExpense, reviewInvoice } from "@/lib/api/approvals";

type Kind = "expense" | "invoice";
type Detail = {
  kind: Kind;
  capability: { canReviewEdit?: boolean; canApprove?: boolean; canMarkPaid?: boolean };
  submission: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  categories: Array<{ id: string; name: string }>;
  project: { id: string; name: string; project_number: string | null } | null;
};
const clean=(v:unknown)=>String(v??"").trim();
const money=(v:unknown)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(v??0)||0);
const date=(v:unknown)=>{const s=clean(v);if(!s)return"—";const d=new Date(s.length===10?`${s}T00:00:00`:s);return Number.isNaN(d.getTime())?s:d.toLocaleDateString("en-AU");};

export function FinanceApprovalScreen({ kind, id }: { kind: Kind; id: string }) {
  const [detail,setDetail]=useState<Detail|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState<string|null>(null);
  const [comments,setComments]=useState("");
  const [paymentReference,setPaymentReference]=useState("");
  const [error,setError]=useState<string|null>(null);

  const load=useCallback(async()=>{try{setError(null);setDetail(await getApprovalDetail<Detail>(kind,id));}catch(e){setError(e instanceof Error?e.message:"Could not load approval.");}finally{setLoading(false);}},[id,kind]);
  useEffect(()=>{void load();},[load]);
  const categoryById=useMemo(()=>new Map((detail?.categories??[]).map(c=>[c.id,c.name])),[detail?.categories]);

  async function action(next:"request_changes"|"deny"|"approve"|"mark_paid"){
    if(!detail)return;
    if((next==="request_changes"||next==="deny")&&!comments.trim()){Alert.alert("Comment required",next==="deny"?"Enter the reason for denial.":"Enter what needs to be changed.");return;}
    setBusy(next);setError(null);
    try{
      if(kind==="expense")await reviewExpense(id,next,comments.trim(),paymentReference.trim());
      else await reviewInvoice(id,next,comments.trim(),paymentReference.trim());
      Alert.alert("Saved",next==="approve"?"Approved successfully.":next==="request_changes"?"Changes requested.":next==="deny"?"Submission denied.":"Marked as paid.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Review action failed.");}finally{setBusy(null);}
  }

  async function openAttachment(row:Record<string,unknown>){
    const attachmentId=clean(row.id);if(!attachmentId)return;
    setBusy(`file-${attachmentId}`);
    try{
      const response=await apiFetch(`/api/expenses/attachments/${encodeURIComponent(attachmentId)}/content`,{timeoutMs:120000});
      if(!response.ok)throw new Error("Attachment could not be opened.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const fileName = (clean(row.file_name) || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_");
      const file = new File(Paths.cache, `${Date.now()}-${fileName}`);
      file.create({ overwrite: true, intermediates: true });
      file.write(bytes);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
    }catch(e){Alert.alert("Could not open file",e instanceof Error?e.message:"Please try again.");}finally{setBusy(null);}
  }

  if(loading)return<SafeAreaView style={s.safe}><ActivityIndicator style={{marginTop:80}}/></SafeAreaView>;
  if(!detail)return<SafeAreaView style={s.safe}><Text style={s.error}>{error||"Approval not found."}</Text></SafeAreaView>;
  const sub=detail.submission;
  const title=clean(sub.submission_number)|| (kind==="invoice"?"Invoice":"Expense Claim");
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.content}>
    <Text style={s.eyebrow}>{kind==="invoice"?"INVOICE APPROVAL":"EXPENSE APPROVAL"}</Text><Text style={s.heading}>{title}</Text>
    <View style={s.card}><Info label="Status" value={clean(sub.status)||"—"}/><Info label="Project" value={[detail.project?.project_number,detail.project?.name].filter(Boolean).join(" · ")||"General"}/>{kind==="invoice"?<><Info label="Supplier" value={clean(sub.supplier_name)||"—"}/><Info label="Invoice" value={clean(sub.invoice_number)||"—"}/><Info label="Due" value={date(sub.due_date)}/></>:<Info label="Description" value={clean(sub.description)||"—"}/>}<Info label="Total" value={money(sub.total_amount)}/></View>
    <View style={s.card}><Text style={s.cardTitle}>Cost Items</Text>{detail.items.map((row,i)=><View key={clean(row.id)||String(i)} style={s.item}><View style={{flex:1}}><Text style={s.itemTitle}>{clean(row.description)||`Item ${i+1}`}</Text><Text style={s.muted}>{categoryById.get(clean(row.category_id))||"Uncategorised"}</Text></View><Text style={s.amount}>{money(row.amount_inc_gst)}</Text></View>)}</View>
    <View style={s.card}><Text style={s.cardTitle}>Attachments</Text>{detail.attachments.length===0?<Text style={s.muted}>No attachments.</Text>:detail.attachments.map((row)=><Pressable key={clean(row.id)} style={s.file} onPress={()=>void openAttachment(row)}><Text style={s.itemTitle}>{clean(row.file_name)||"Attachment"}</Text><Text style={s.link}>{busy===`file-${clean(row.id)}`?"Opening…":"Open"}</Text></Pressable>)}</View>
    {error?<Text style={s.error}>{error}</Text>:null}
    {(detail.capability.canReviewEdit||detail.capability.canApprove)?<View style={s.card}><Text style={s.cardTitle}>Review</Text><TextInput value={comments} onChangeText={setComments} placeholder="Comment / requested changes" multiline style={[s.input,{minHeight:100,textAlignVertical:"top"}]}/>{detail.capability.canMarkPaid?<TextInput value={paymentReference} onChangeText={setPaymentReference} placeholder="Payment reference (for Mark Paid)" style={s.input}/>:null}<View style={s.actions}>{detail.capability.canReviewEdit?<Pressable disabled={!!busy} style={[s.button,s.warn]} onPress={()=>void action("request_changes")}><Text style={s.buttonText}>Request Changes</Text></Pressable>:null}{detail.capability.canApprove?<Pressable disabled={!!busy} style={[s.button,s.danger]} onPress={()=>void action("deny")}><Text style={s.buttonText}>Deny</Text></Pressable>:null}{detail.capability.canApprove?<Pressable disabled={!!busy} style={[s.button,s.good]} onPress={()=>void action("approve")}><Text style={s.buttonText}>Approve</Text></Pressable>:null}{detail.capability.canMarkPaid&&clean(sub.status)==="approved"?<Pressable disabled={!!busy} style={[s.button,s.dark]} onPress={()=>void action("mark_paid")}><Text style={s.buttonText}>Mark Paid</Text></Pressable>:null}</View>{busy?<ActivityIndicator/>:null}</View>:null}
  </ScrollView></SafeAreaView>;
}
function Info({label,value}:{label:string;value:string}){return<View style={s.info}><Text style={s.label}>{label}</Text><Text style={s.value}>{value}</Text></View>}
const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f8fafc"},content:{padding:18,gap:14},eyebrow:{fontSize:12,fontWeight:"900",color:"#2563eb",letterSpacing:1.2},heading:{fontSize:28,fontWeight:"900",color:"#0f172a"},card:{backgroundColor:"#fff",padding:16,borderRadius:18,borderWidth:1,borderColor:"#e2e8f0",gap:10},cardTitle:{fontSize:17,fontWeight:"900",color:"#0f172a"},info:{flexDirection:"row",justifyContent:"space-between",gap:16,borderBottomWidth:1,borderBottomColor:"#f1f5f9",paddingVertical:8},label:{color:"#64748b",fontWeight:"700"},value:{flex:1,textAlign:"right",color:"#0f172a",fontWeight:"800"},item:{flexDirection:"row",gap:12,paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#f1f5f9"},itemTitle:{fontWeight:"800",color:"#0f172a"},muted:{color:"#64748b",fontSize:12,marginTop:3},amount:{fontWeight:"900",color:"#0f172a"},file:{flexDirection:"row",justifyContent:"space-between",paddingVertical:10},link:{color:"#2563eb",fontWeight:"900"},input:{borderWidth:1,borderColor:"#cbd5e1",borderRadius:12,padding:12,backgroundColor:"#fff"},actions:{flexDirection:"row",flexWrap:"wrap",gap:8},button:{paddingHorizontal:13,paddingVertical:11,borderRadius:11},buttonText:{color:"#fff",fontWeight:"900"},warn:{backgroundColor:"#d97706"},danger:{backgroundColor:"#be123c"},good:{backgroundColor:"#047857"},dark:{backgroundColor:"#0f172a"},error:{margin:18,padding:12,borderRadius:12,backgroundColor:"#fff1f2",color:"#be123c",fontWeight:"700"}});

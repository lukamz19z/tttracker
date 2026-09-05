import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type DocketMode = "create" | "edit" | "view";
type RateType = "tonnage_rate" | "schedule_of_rates";
type DelayType = "weather" | "lightning" | "toolbox" | "mobilisation" | "access" | "plant" | "other";
type DelayScope = "entire_crew" | "selected_workers";
type DelayMode = "labour_only" | "labour_and_plant";
type MaterialEventType = "missing" | "found_received" | "taken_from_another_tower" | "sent_to_another_tower" | "excess" | "damaged_incorrect";
type MaterialWorkOutcome = "" | "stopped_work" | "slowed_down" | "changed_sequence" | "minor_impact";

type ProfileRecord = {
  projectId?: string | null;
  projectName?: string | null;
  projectNumber?: string | null;
  crew?: string | null;
  role?: string | null;
  full_name?: string | null;
  email?: string | null;
};
type Tower = {
  id: string;
  project_id: string;
  name: string | null;
  line: string | null;
  status: string | null;
  progress: number | null;
  extra_data: Record<string, unknown> | null;
};
type Crew = { id: string; crew_number: string | null; crew_name: string | null; leading_hand: string | null; active: boolean | null };
type Employee = { id: string; full_name: string; role: string | null; crew_id: string | null; active: boolean | null };

type Docket = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  weather: string | null;
  rate_type: string | null;
  progress_model: string | null;
  approval_status: string | null;
  approval_revision?: number | null;
  assembly_percent: number | null;
  erection_percent: number | null;
  lunch_break_minutes: number | null;
  travel_in_minutes: number | null;
  travel_out_minutes: number | null;
  mobilisation_hours: number | null;
  mobilisation_notes: string | null;
  missing_items_bolts: string | null;
  delays_comments: string | null;
  raw_manhours: number | null;
  production_manhours: number | null;
  incident_occurred: boolean | null;
  incident_type: string | null;
  incident_notes: string | null;
  bc_rep_name: string | null;
  bc_submitted_by?: string | null;
  bc_signature_data_url?: string | null;
  bc_signed_at?: string | null;
  client_rep_name: string | null;
  signed_date: string | null;
};

type LabourDb = { docket_id: string; worker_name: string | null; time_in: string | null; time_out: string | null; total_hours: number | null; lunch_minutes: number | null; travel_in_minutes: number | null; travel_out_minutes: number | null; mobilisation_hours: number | null; delay_hours: number | null; production_hours: number | null };
type ProgressDb = {
  docket_id: string;
  progress_model?: string | null;
  section?: string | null;
  section_code?: string | null;
  section_label: string | null;
  assembled_qty: number | null;
  erected_qty: number | null;
  assembly_today?: number | null;
  assembly_overall?: number | null;
  erection_today?: number | null;
  erection_overall?: number | null;
  assembly_weight?: number | null;
  erection_weight?: number | null;
};
type DelayDb = { docket_id: string; delay_type: string | null; delay_reason: string | null; delay_hours: number | null; applies_to: string | null; worker_names: string[] | null; delay_applies_mode?: string | null; plant_names?: string[] | null };
type PlantDb = { docket_id: string; plant_name: string | null; plant_type: string | null; asset_number: string | null; operator_name?: string | null; time_in: string | null; time_out: string | null; total_hours: number | null; notes: string | null };

type MaterialCatalogItem = { source_table: string; source_record_id: string; tower_id: string; item_reference: string; item_description: string; unit: string };
type MaterialEventItemDraft = {
  ui_id: string;
  material_kind: "registered" | "manual" | "manual_bolt";
  manual_category: string;
  bolt_size: string;
  search_query: string;
  search_loading: boolean;
  search_results: MaterialCatalogItem[];
  source_table: string;
  source_record_id: string;
  item_reference: string;
  item_description: string;
  quantity: string;
  unit: string;
  notes: string;
};
type MaterialPersonDraft = { ui_id: string; employee_id: string; employee_name: string; employee_role: string; started_at: string; finished_at: string };
type MaterialPlantDraft = { ui_id: string; plant_asset_id: string; plant_name: string; asset_number: string; started_at: string; finished_at: string };
type MaterialEventDraft = {
  ui_id: string; event_type: MaterialEventType; source_tower_id: string; destination_tower_id: string; destination_location: string;
  affected_work: boolean; work_outcome: MaterialWorkOutcome; affected_activity: string; affected_section: string;
  impact_start_time: string; impact_finish_time: string; impact_ongoing: boolean; current_effect: string; mitigation_actions: string[];
  notes: string; items: MaterialEventItemDraft[]; people: MaterialPersonDraft[]; plant: MaterialPlantDraft[];
};

type LabourRow = { worker_name: string; time_in: string; time_out: string; total_hours: string; lunch_minutes: string; travel_in_minutes: string; travel_out_minutes: string; mobilisation_minutes: string };
type ProgressRow = { section_label: string; assembled_qty: string; erected_qty: string };
type DelayRow = { ui_id: string; delay_type: DelayType; delay_reason: string; delay_hours: string; applies_to: DelayScope; worker_names: string[]; delay_mode: DelayMode; plant_names: string[] };
type PlantRow = { plant_name: string; plant_type: string; asset_id: string; operator_name: string; time_in: string; time_out: string; total_hours: string; notes: string };
type MobilisationDraft = { enabled: boolean; from_tower_id: string; to_tower_id: string; status: "planning" | "packing" | "demobilising" | "in_transit" | "mobilising" | "setup" | "complete"; percent_complete: string; started_date: string; target_move_date: string; completed_date: string; notes: string };
type Bundle = { docket: Docket; labour: LabourDb[]; progress: ProgressDb[]; delays: DelayDb[]; plant: PlantDb[]; materialEvents: any[] };

type FormState = {
  mode: DocketMode; docketId: string | null; towerId: string; docketDate: string; selectedCrewId: string; crewName: string; leadingHand: string;
  weather: string; rateType: RateType; progressModel: "legacy" | "section_v2"; approvalStatus: string; lunchBreakMinutes: string; travelInMinutes: string; travelOutMinutes: string; mobilisationMinutes: string;
  delaysComments: string; incidentOccurred: boolean; incidentType: string; incidentNotes: string; bcRepName: string; clientRepName: string; signedDate: string;
  hasBodyExtension: boolean; labourRows: LabourRow[]; progressRows: ProgressRow[]; delayRows: DelayRow[]; plantRows: PlantRow[];
  materialEvents: MaterialEventDraft[]; mobilisation: MobilisationDraft;
};

const SECTION_WEIGHTS: Record<string, number> = {
  LE: 20,
  BE: 15,
  CB: 15,
  BSS: 10,
  MSS: 10,
  TSS: 10,
  BX: 5,
  MX: 5,
  TX: 5,
  EP: 5,
};

const SECTION_V2: { code: string; label: string }[] = [
  { code: "LE", label: "Legs" },
  { code: "BE", label: "Body Extension" },
  { code: "CB", label: "Common Body" },
  { code: "BSS", label: "Bottom Superstructure" },
  { code: "MSS", label: "Middle Superstructure" },
  { code: "TSS", label: "Top Superstructure" },
  { code: "BX", label: "Bottom Crossarms" },
  { code: "MX", label: "Middle Crossarms" },
  { code: "TX", label: "Top Crossarms" },
  { code: "EP", label: "Earth Peak" },
];

const DEFAULT_PROGRESS: ProgressRow[] = SECTION_V2.map((row) => ({
  section_label: row.label,
  assembled_qty: "",
  erected_qty: "",
}));

const DELAY_OPTIONS = [
  { value: "weather", label: "Weather" }, { value: "lightning", label: "Lightning" }, { value: "toolbox", label: "Toolbox" },
  { value: "mobilisation", label: "Mobilisation" }, { value: "access", label: "Access" }, { value: "plant", label: "Plant" }, { value: "other", label: "Other" },
];

const MATERIAL_EVENT_OPTIONS = [
  { value: "missing", label: "Missing" }, { value: "found_received", label: "Found / Received" },
  { value: "taken_from_another_tower", label: "Taken from Tower" }, { value: "sent_to_another_tower", label: "Sent to Tower" },
  { value: "damaged_incorrect", label: "Damaged / Incorrect" },
];

const MITIGATION_OPTIONS = [
  "Moved personnel to another activity", "Assembled another section", "Checked other bundles",
  "Resequenced planned work", "Assisted client to locate / verify material",
];

function uid(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function clean(value: unknown) { return String(value ?? "").trim(); }
function toNumber(value: unknown) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatDate(value?: string | null) { if (!value) return "No date"; const [y,m,d] = value.slice(0,10).split("-").map(Number); const date = new Date(y,(m||1)-1,d||1); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-AU",{day:"2-digit",month:"short",year:"numeric"}); }
function errorMessage(error: unknown) { if (error instanceof Error) return error.message; if (typeof error === "object" && error) { const row = error as Record<string,unknown>; return [clean(row.message),clean(row.details),clean(row.hint)].filter(Boolean).join("\n"); } return clean(error) || "Unknown error"; }
function normaliseName(v: string) { return v.trim().replace(/\s+/g," ").toLowerCase(); }

function normaliseTimeInput(value: string): string {
  const raw = value.trim().replace(/[^\d:]/g, "");
  if (!raw) return "";
  if (raw.includes(":")) {
    const [hRaw="",mRaw=""] = raw.split(":");
    const h = Number(hRaw), m = mRaw === "" ? 0 : Number(mRaw);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return raw;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  if (!/^\d+$/.test(raw)) return raw;
  let h = 0, m = 0;
  if (raw.length <= 2) h = Number(raw);
  else if (raw.length === 3) { h = Number(raw.slice(0,1)); m = Number(raw.slice(1)); }
  else { h = Number(raw.slice(0,2)); m = Number(raw.slice(2,4)); }
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return raw;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function timeToMinutes(value: string): number | null {
  const v = normaliseTimeInput(value);
  if (!/^\d{2}:\d{2}$/.test(v)) return null;
  const [h,m] = v.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h*60+m;
}
function calculateHours(timeIn: string, timeOut: string): string {
  const a = timeToMinutes(timeIn), b = timeToMinutes(timeOut);
  if (a == null || b == null) return "";
  let mins = b-a; if (mins < 0) mins += 1440;
  return (mins/60).toFixed(2);
}
function durationHours(a:string,b:string) { return toNumber(calculateHours(a,b)); }

function crewLabel(c: Crew) { return [c.crew_number,c.crew_name].map(clean).filter(Boolean).join(" - "); }
function towerLabel(t: Tower) {
  const extra = t.extra_data ?? {};
  const n =
    clean(t.name) ||
    clean(extra.tower_number) ||
    clean(extra.structure_number) ||
    clean(extra.tower_no) ||
    "Unnamed Tower";
  return t.line ? `${n} · ${t.line}` : n;
}
function isSigned(d: Docket) {
  return Boolean(clean(d.client_rep_name) && clean(d.signed_date));
}
function approvalLabel(statusValue: string | null | undefined) {
  const status = clean(statusValue);
  if (status === "final" || status === "legacy_final") return "Approved";
  if (status === "submitted_bc") return "Pending BC Approval";
  if (status === "client_pending") return "Pending Client Approval";
  if (status === "bc_changes_requested" || status === "client_changes_requested") return "Changes Required";
  return "In Progress";
}
function docketStatus(d: Docket) {
  if (isSigned(d)) return "Approved";
  return approvalLabel(d.approval_status);
}
function normaliseRole(value: string | null | undefined) {
  const role = clean(value).toLowerCase();
  if (role === "site_admin" || role === "administrator") return "admin";
  if (role === "safety" || role === "safety_manager") return "hseq";
  if (role === "assets" || role === "mechanic") return "asset_manager";
  if (role === "commercial_manager") return "commercial";
  if (role === "leading_hand" || role === "field") return "crew";
  return role;
}
function inferBodyExtension(t: Tower | null) {
  const extra = t?.extra_data ?? {};
  for (const [k,v] of Object.entries(extra)) {
    const key = k.toLowerCase().replace(/[_\-.()/]+/g," ");
    if (!((key.includes("body") && (key.includes("ext")||key.includes("extension"))) || key.trim()==="be")) continue;
    if (typeof v === "number") return v > 0;
    const s = clean(v).toLowerCase(); if (["no","false","none","0","not required"].includes(s)) return false; if (s) return true;
  }
  return true;
}
function blankLabour(d?:{lunch?:string;travelIn?:string;travelOut?:string;mobilisation?:string}):LabourRow { return {worker_name:"",time_in:"",time_out:"",total_hours:"",lunch_minutes:d?.lunch??"",travel_in_minutes:d?.travelIn??"",travel_out_minutes:d?.travelOut??"",mobilisation_minutes:d?.mobilisation??""}; }
function blankPlant():PlantRow { return {plant_name:"",plant_type:"",asset_id:"",operator_name:"",time_in:"",time_out:"",total_hours:"",notes:""}; }
function blankDelay():DelayRow { return {ui_id:uid("delay"),delay_type:"weather",delay_reason:"",delay_hours:"",applies_to:"entire_crew",worker_names:[],delay_mode:"labour_only",plant_names:[]}; }
function blankMaterialItem():MaterialEventItemDraft { return {ui_id:uid("item"),material_kind:"registered",manual_category:"",bolt_size:"",search_query:"",search_loading:false,search_results:[],source_table:"",source_record_id:"",item_reference:"",item_description:"",quantity:"1",unit:"ea",notes:""}; }
function blankMaterialEvent(type:MaterialEventType="missing"):MaterialEventDraft { return {ui_id:uid("event"),event_type:type,source_tower_id:"",destination_tower_id:"",destination_location:"",affected_work:false,work_outcome:"",affected_activity:"",affected_section:"",impact_start_time:"",impact_finish_time:"",impact_ongoing:false,current_effect:"",mitigation_actions:[],notes:"",items:[blankMaterialItem()],people:[],plant:[]}; }
function blankMobilisation():MobilisationDraft { return {enabled:false,from_tower_id:"",to_tower_id:"",status:"planning",percent_complete:"0",started_date:"",target_move_date:"",completed_date:"",notes:""}; }
function blankForm(towerId:string):FormState { return {mode:"create",docketId:null,towerId,docketDate:today(),selectedCrewId:"",crewName:"",leadingHand:"",weather:"",rateType:"tonnage_rate",progressModel:"section_v2",approvalStatus:"draft",lunchBreakMinutes:"30",travelInMinutes:"",travelOutMinutes:"",mobilisationMinutes:"",delaysComments:"",incidentOccurred:false,incidentType:"",incidentNotes:"",bcRepName:"",clientRepName:"",signedDate:"",hasBodyExtension:true,labourRows:[blankLabour({lunch:"30"})],progressRows:DEFAULT_PROGRESS.map(r=>({...r})),delayRows:[],plantRows:[],materialEvents:[],mobilisation:blankMobilisation()}; }

function delayForWorker(row:LabourRow, delays:DelayRow[]) {
  const worker = normaliseName(row.worker_name); if (!worker) return 0;
  return delays.reduce((sum,d)=> d.applies_to==="entire_crew" ? sum+toNumber(d.delay_hours) : d.worker_names.some(n=>normaliseName(n)===worker) ? sum+toNumber(d.delay_hours) : sum,0);
}
function productionHours(row:LabourRow, delays:DelayRow[]) { return Math.max(0,toNumber(row.total_hours)-toNumber(row.lunch_minutes)/60-(toNumber(row.travel_in_minutes)+toNumber(row.travel_out_minutes))/60-toNumber(row.mobilisation_minutes)/60-delayForWorker(row,delays)).toFixed(2); }
function progressTotals(form:FormState) {
  const rows = form.progressRows.filter(
    (row) =>
      form.hasBodyExtension ||
      !row.section_label.toLowerCase().includes("body extension")
  );

  if (!rows.length) return { assembly: 0, erection: 0, overall: 0 };

  if (form.progressModel === "legacy") {
    const assembly = Math.round(
      rows.reduce(
        (sum, row) => sum + Math.max(0, Math.min(100, toNumber(row.assembled_qty))),
        0
      ) / rows.length
    );
    const erection = Math.round(
      rows.reduce(
        (sum, row) => sum + Math.max(0, Math.min(100, toNumber(row.erected_qty))),
        0
      ) / rows.length
    );
    return { assembly, erection, overall: Math.round(assembly * 0.5 + erection * 0.5) };
  }

  const activeDefs = SECTION_V2.filter(
    (def) => form.hasBodyExtension || def.code !== "BE"
  );
  const denominator = activeDefs.reduce(
    (sum, def) => sum + (SECTION_WEIGHTS[def.code] ?? 0),
    0
  );

  const weighted = (key: "assembled_qty" | "erected_qty") =>
    denominator <= 0
      ? 0
      : activeDefs.reduce((sum, def) => {
          const row = form.progressRows.find(
            (candidate) => candidate.section_label === def.label
          );
          const value = Math.max(0, Math.min(100, toNumber(row?.[key])));
          return sum + value * (SECTION_WEIGHTS[def.code] ?? 0);
        }, 0) / denominator;

  const assembly = Math.round(weighted("assembled_qty") * 100) / 100;
  const erection = Math.round(weighted("erected_qty") * 100) / 100;
  return {
    assembly,
    erection,
    overall: Math.round((assembly * 0.5 + erection * 0.5) * 100) / 100,
  };
}
function plantDisplay(r:PlantRow) { return [r.plant_name,r.asset_id,r.plant_type].map(clean).filter(Boolean).join(" · ") || "Plant / Vehicle"; }
function buildMobilisationLine(m:MobilisationDraft) { if (!m.enabled) return ""; return ["MOBILISATION",`from=${m.from_tower_id}`,`to=${m.to_tower_id}`,`status=${m.status}`,`progress=${Math.max(0,Math.min(100,toNumber(m.percent_complete)))}`,`started=${m.started_date}`,`target=${m.target_move_date}`,`completed=${m.completed_date}`,`notes=${m.notes.replace(/\|/g,"/").replace(/\n/g," ")}`].join("|"); }
function parseMobilisationLine(v:string|null|undefined):MobilisationDraft {
  const line=clean(v).split("\n").find(r=>r.startsWith("MOBILISATION|")); if(!line)return blankMobilisation();
  const x=Object.fromEntries(line.split("|").slice(1).map(p=>{const [k,...rest]=p.split("=");return[k,rest.join("=")]}));
  return {enabled:true,from_tower_id:x.from||"",to_tower_id:x.to||"",status:(x.status||"planning") as MobilisationDraft["status"],percent_complete:String(Math.max(0,Math.min(100,toNumber(x.progress)))),started_date:x.started||"",target_move_date:x.target||"",completed_date:x.completed||"",notes:x.notes||""};
}
function stripMobilisationLine(v:string|null|undefined){return clean(v).split("\n").filter(r=>!r.startsWith("MOBILISATION|")).join("\n").trim();}
function dateTimeIso(date:string,time:string){const t=normaliseTimeInput(time);return date&&/^\d{2}:\d{2}$/.test(t)?`${date}T${t}:00`:null;}
function timeFromIso(v:string|null|undefined){const m=v?.match(/T(\d{2}):(\d{2})/);return m?`${m[1]}:${m[2]}`:"";}

export default function DailyDocketScreen() {
  const { profile } = useAuth();
  const p = profile as unknown as ProfileRecord | null;
  const projectId=clean(p?.projectId), projectName=clean(p?.projectName), projectNumber=clean(p?.projectNumber);
  const [towers,setTowers]=useState<Tower[]>([]), [crews,setCrews]=useState<Crew[]>([]), [employees,setEmployees]=useState<Employee[]>([]);
  const [bundles,setBundles]=useState<Bundle[]>([]), [selectedTowerId,setSelectedTowerId]=useState(""), [towerPickerOpen,setTowerPickerOpen]=useState(false);
  const [towerSearch,setTowerSearch]=useState(""), [search,setSearch]=useState(""), [form,setForm]=useState<FormState|null>(null);
  const [loading,setLoading]=useState(true), [refreshing,setRefreshing]=useState(false), [saving,setSaving]=useState(false), [prefilling,setPrefilling]=useState(false);
  const [currentUserId,setCurrentUserId]=useState("");
  const [reviewerRoles,setReviewerRoles]=useState<string[]>([]);
  const [pendingReviewDocketId,setPendingReviewDocketId]=useState("");

  const loadData=useCallback(async(showLoader=true)=>{
    if(!projectId){setLoading(false);return;} if(showLoader)setLoading(true);
    try{
      const [towerRes,crewRes,employeeRes,docketRes,reviewerRoleRes]=await Promise.all([
        supabase.from("towers").select("id,project_id,name,line,status,progress,extra_data").eq("project_id",projectId).order("name"),
        supabase.from("crews").select("id,crew_number,crew_name,leading_hand,active").order("crew_number"),
        supabase.from("employees").select("id,full_name,role,crew_id,active").order("full_name"),
        supabase
          .from("tower_daily_dockets")
          .select("id,project_id,tower_id,docket_date,crew,leading_hand,weather,rate_type,progress_model,approval_status,approval_revision,assembly_percent,erection_percent,lunch_break_minutes,travel_in_minutes,travel_out_minutes,mobilisation_hours,mobilisation_notes,missing_items_bolts,delays_comments,raw_manhours,production_manhours,incident_occurred,incident_type,incident_notes,bc_rep_name,bc_submitted_by,bc_signature_data_url,bc_signed_at,client_rep_name,signed_date")
          .eq("project_id",projectId)
          .order("docket_date",{ascending:false}),
        supabase
          .from("project_docket_approval_roles")
          .select("role,receives_bc_review")
          .eq("project_id",projectId)
          .eq("receives_bc_review",true),
      ]);
      if(towerRes.error)throw towerRes.error;
      if(docketRes.error)throw docketRes.error;
      if(reviewerRoleRes.error)throw reviewerRoleRes.error;
      setReviewerRoles(
        (reviewerRoleRes.data??[])
          .map((row:any)=>normaliseRole(clean(row.role)))
          .filter(Boolean)
      );
      const dockets=(docketRes.data??[]) as Docket[], ids=dockets.map(d=>d.id);
      let labour:LabourDb[]=[],progress:ProgressDb[]=[],delays:DelayDb[]=[],plant:PlantDb[]=[],materialEvents:any[]=[];
      if(ids.length){
        const [a,b,c,d,e]=await Promise.all([
          supabase.from("tower_docket_labour").select("*").in("docket_id",ids),
          supabase.from("tower_docket_progress").select("*").in("docket_id",ids),
          supabase.from("tower_docket_delays").select("*").in("docket_id",ids),
          supabase.from("tower_docket_plant").select("*").in("docket_id",ids),
          supabase.from("tower_material_events").select("*,items:tower_material_event_items(*),people:tower_material_event_people(*),plant:tower_material_event_plant(*)").in("docket_id",ids),
        ]);
        const err=[a.error,b.error,c.error,d.error,e.error].find(Boolean); if(err)throw err;
        labour=(a.data??[]) as LabourDb[]; progress=(b.data??[]) as ProgressDb[]; delays=(c.data??[]) as DelayDb[]; plant=(d.data??[]) as PlantDb[]; materialEvents=e.data??[];
      }
      const loaded=(towerRes.data??[]) as Tower[]; setTowers(loaded); setCrews(((crewRes.data??[]) as Crew[]).filter(r=>r.active!==false)); setEmployees(((employeeRes.data??[]) as Employee[]).filter(r=>r.active!==false));
      setBundles(dockets.map(d=>({docket:d,labour:labour.filter(r=>r.docket_id===d.id),progress:progress.filter(r=>r.docket_id===d.id),delays:delays.filter(r=>r.docket_id===d.id),plant:plant.filter(r=>r.docket_id===d.id),materialEvents:materialEvents.filter((r:any)=>r.docket_id===d.id)})));
      if(!selectedTowerId&&loaded.length)setSelectedTowerId(loaded[0].id);
    }catch(e){Alert.alert("Could not load daily dockets",errorMessage(e));}finally{if(showLoader)setLoading(false);}
  },[projectId,selectedTowerId]);

  useEffect(()=>{void loadData();},[loadData]);

  useEffect(()=>{
    let active=true;
    void supabase.auth.getUser().then(({data})=>{
      if(active)setCurrentUserId(clean(data.user?.id));
    });
    return()=>{active=false;};
  },[]);

  useEffect(()=>{
    const resolve=(url:string|null)=>{
      if(!url)return;
      const pathMatch=url.match(/\/dockets\/([^/?#]+)\/review(?:[/?#]|$)/i);
      if(pathMatch?.[1]){
        setPendingReviewDocketId(decodeURIComponent(pathMatch[1]));
        return;
      }
      const queryMatch=url.match(/[?&]docketId=([^&#]+)/i);
      if(queryMatch?.[1])setPendingReviewDocketId(decodeURIComponent(queryMatch[1]));
    };
    void Linking.getInitialURL().then(resolve);
    const sub=Linking.addEventListener("url",event=>resolve(event.url));
    return()=>sub.remove();
  },[]);

  const selectedTower=towers.find(t=>t.id===selectedTowerId)??null;
  const visibleTowers=useMemo(()=>{const q=towerSearch.trim().toLowerCase();return towers.filter(t=>[towerLabel(t),t.status,t.progress,t.line].map(clean).join(" ").toLowerCase().includes(q));},[towers,towerSearch]);
  const visibleBundles=useMemo(()=>{const q=search.trim().toLowerCase();return bundles.filter(b=>b.docket.tower_id===selectedTowerId&&[b.docket.docket_date,b.docket.crew,b.docket.leading_hand,b.docket.weather,docketStatus(b.docket),...b.materialEvents.flatMap((e:any)=>[e.event_type,e.affected_section,e.current_effect,...(e.items||[]).map((i:any)=>i.item_reference)])].map(clean).join(" ").toLowerCase().includes(q));},[bundles,selectedTowerId,search]);
  const summary=useMemo(()=>visibleBundles.reduce((a,b)=>{a.count++;a.raw+=b.docket.raw_manhours??b.labour.reduce((s,r)=>s+toNumber(r.total_hours),0);a.production+=b.docket.production_manhours??b.labour.reduce((s,r)=>s+toNumber(r.production_hours),0);a.issues+=b.materialEvents.filter((e:any)=>e.event_type!=="excess").length;return a;},{count:0,raw:0,production:0,issues:0}),[visibleBundles]);

  function canEditDocket(d:Docket){
    const status=clean(d.approval_status)||"legacy";
    if(isSigned(d)||["final","legacy_final","client_pending"].includes(status))return false;
    if(status==="submitted_bc"){
      const isSubmitter=Boolean(currentUserId&&clean(d.bc_submitted_by)===currentUserId);
      const isReviewer=reviewerRoles.includes(normaliseRole(p?.role));
      return isSubmitter||isReviewer;
    }
    return true;
  }

  async function refresh(){setRefreshing(true);await loadData(false);setRefreshing(false);}
  function applyCrew(target:FormState,crew:Crew){target.selectedCrewId=crew.id;target.crewName=clean(crew.crew_number)||clean(crew.crew_name);target.leadingHand=clean(crew.leading_hand);const members=employees.filter(e=>e.crew_id===crew.id);if(members.length)target.labourRows=members.map(e=>({...blankLabour({lunch:target.lunchBreakMinutes,travelIn:target.travelInMinutes,travelOut:target.travelOutMinutes,mobilisation:target.mobilisationMinutes}),worker_name:e.full_name}));}
  async function loadCrewAssets(crew:Crew):Promise<PlantRow[]>{
    const [a,b]=await Promise.all([supabase.from("plant_assets").select("*"),supabase.from("vehicle_assets").select("*")]); const accepted=[crew.id,clean(crew.crew_number),clean(crew.crew_name)].map(v=>v.toLowerCase()).filter(Boolean);
    const belongs=(r:Record<string,unknown>)=>[r.crew_id,r.crew,r.crew_number,r.crew_name,r.assigned_crew_id].some(v=>{const s=clean(v).toLowerCase();return accepted.some(c=>s===c||Boolean(c&&s.includes(c)));});
    const rows:PlantRow[]=[]; for(const r of (a.data??[]) as Record<string,unknown>[])if(belongs(r))rows.push({plant_name:[clean(r.asset_id),clean(r.make),clean(r.model)].filter(Boolean).join(" - "),plant_type:clean(r.plant_type)||"Plant",asset_id:clean(r.asset_id),operator_name:"",time_in:"",time_out:"",total_hours:"",notes:""});
    for(const r of (b.data??[]) as Record<string,unknown>[])if(belongs(r))rows.push({plant_name:[clean(r.vehicle_id),clean(r.make),clean(r.model)].filter(Boolean).join(" - "),plant_type:clean(r.category)||"Vehicle",asset_id:clean(r.vehicle_id)||clean(r.vehicle_rego)||clean(r.rego),operator_name:"",time_in:"",time_out:"",total_hours:"",notes:""}); return rows;
  }
  function openCreate(){if(!selectedTower){Alert.alert("Select a tower","Choose a tower first.");return;}const next=blankForm(selectedTower.id);next.hasBodyExtension=inferBodyExtension(selectedTower);const c=crews.find(c=>clean(c.crew_number)===clean(p?.crew)||clean(c.crew_name)===clean(p?.crew));if(c)applyCrew(next,c);setForm(next);}
  async function selectCrew(id:string){const c=crews.find(x=>x.id===id);if(!c||!form)return;const next={...form};applyCrew(next,c);next.plantRows=await loadCrewAssets(c);setForm(next);}

  function dbLabour(r:LabourDb):LabourRow{const a=clean(r.time_in),b=clean(r.time_out);return{worker_name:clean(r.worker_name),time_in:a,time_out:b,total_hours:r.total_hours==null?calculateHours(a,b):String(r.total_hours),lunch_minutes:r.lunch_minutes==null?"":String(r.lunch_minutes),travel_in_minutes:r.travel_in_minutes==null?"":String(r.travel_in_minutes),travel_out_minutes:r.travel_out_minutes==null?"":String(r.travel_out_minutes),mobilisation_minutes:r.mobilisation_hours==null?"":String(r.mobilisation_hours*60)}}
  function dbProgress(r:ProgressDb):ProgressRow{
    return{
      section_label:clean(r.section_label)||clean(r.section)||"Section",
      assembled_qty:r.assembly_overall!=null?String(r.assembly_overall):r.assembly_today!=null?String(r.assembly_today):r.assembled_qty==null?"":String(r.assembled_qty),
      erected_qty:r.erection_overall!=null?String(r.erection_overall):r.erection_today!=null?String(r.erection_today):r.erected_qty==null?"":String(r.erected_qty)
    }
  }
  function dbDelay(r:DelayDb):DelayRow{return{ui_id:uid("delay"),delay_type:(clean(r.delay_type)||"weather") as DelayType,delay_reason:clean(r.delay_reason),delay_hours:r.delay_hours==null?"":String(r.delay_hours),applies_to:clean(r.applies_to)==="selected_workers"?"selected_workers":"entire_crew",worker_names:Array.isArray(r.worker_names)?r.worker_names:[],delay_mode:clean(r.delay_applies_mode)==="labour_and_plant"?"labour_and_plant":"labour_only",plant_names:Array.isArray(r.plant_names)?r.plant_names:[]}}
  function dbPlant(r:PlantDb):PlantRow{const a=clean(r.time_in),b=clean(r.time_out);return{plant_name:clean(r.plant_name),plant_type:clean(r.plant_type),asset_id:clean(r.asset_number),operator_name:clean(r.operator_name),time_in:a,time_out:b,total_hours:r.total_hours==null?calculateHours(a,b):String(r.total_hours),notes:clean(r.notes)}}
  function dbEvent(e:any):MaterialEventDraft{
    return{
      ui_id:uid("event"),
      event_type:e.event_type as MaterialEventType,
      source_tower_id:clean(e.source_tower_id),
      destination_tower_id:clean(e.destination_tower_id),
      destination_location:clean(e.destination_location),
      affected_work:Boolean(e.affected_work),
      work_outcome:(clean(e.work_outcome)||"") as MaterialWorkOutcome,
      affected_activity:clean(e.affected_activity),
      affected_section:clean(e.affected_section),
      impact_start_time:timeFromIso(e.impact_started_at),
      impact_finish_time:timeFromIso(e.impact_finished_at),
      impact_ongoing:Boolean(e.impact_ongoing),
      current_effect:clean(e.current_effect),
      mitigation_actions:Array.isArray(e.mitigation_actions)?e.mitigation_actions:[],
      notes:clean(e.notes),
      items:(e.items||[]).length
        ?(e.items||[]).map((i:any)=>{
            const manualBolt=clean(i.material_type)==="bolt"&&!i.source_record_id;
            return{
              ui_id:uid("item"),
              material_kind:manualBolt?"manual_bolt":i.source_record_id?"registered":"manual",
              manual_category:i.source_record_id||manualBolt?"":clean(i.item_description),
              bolt_size:manualBolt?clean(i.bolt_size)||clean(i.item_reference):"",
              search_query:i.source_record_id?clean(i.item_reference):"",
              search_loading:false,
              search_results:[],
              source_table:clean(i.source_table),
              source_record_id:clean(i.source_record_id),
              item_reference:manualBolt?"":clean(i.item_reference),
              item_description:clean(i.item_description),
              quantity:i.quantity==null?"1":String(i.quantity),
              unit:clean(i.unit)||"ea",
              notes:clean(i.notes)
            };
          })
        :[blankMaterialItem()],
      people:(e.people||[]).map((x:any)=>({
        ui_id:uid("person"),
        employee_id:clean(x.employee_id),
        employee_name:clean(x.employee_name),
        employee_role:clean(x.employee_role),
        started_at:timeFromIso(x.started_at),
        finished_at:timeFromIso(x.finished_at)
      })),
      plant:(e.plant||[]).map((x:any)=>({
        ui_id:uid("mplant"),
        plant_asset_id:clean(x.plant_asset_id),
        plant_name:clean(x.plant_name),
        asset_number:clean(x.asset_number),
        started_at:timeFromIso(x.started_at),
        finished_at:timeFromIso(x.finished_at)
      }))
    };
  }

  function openBundle(b:Bundle,mode:DocketMode){
    const d=b.docket;
    const t=towers.find(x=>x.id===d.tower_id)??null;
    const c=crews.find(x=>clean(x.crew_number)===clean(d.crew)||clean(x.crew_name)===clean(d.crew));
    const isV2=clean(d.progress_model)==="section_v2"||b.progress.some(row=>clean(row.progress_model)==="section_v2");
    const v2HasBe=b.progress.some(row=>clean(row.section_code).toUpperCase()==="BE");
    const requestedMode=mode==="edit"&&!canEditDocket(d)?"view":mode;

    setForm({
      mode:requestedMode,
      docketId:d.id,
      towerId:d.tower_id,
      docketDate:clean(d.docket_date),
      selectedCrewId:c?.id??"",
      crewName:clean(d.crew),
      leadingHand:clean(d.leading_hand),
      weather:clean(d.weather),
      rateType:d.rate_type==="schedule_of_rates"?"schedule_of_rates":"tonnage_rate",
      progressModel:isV2?"section_v2":"legacy",
      approvalStatus:clean(d.approval_status)||"legacy",
      lunchBreakMinutes:d.lunch_break_minutes==null?"":String(d.lunch_break_minutes),
      travelInMinutes:d.travel_in_minutes==null?"":String(d.travel_in_minutes),
      travelOutMinutes:d.travel_out_minutes==null?"":String(d.travel_out_minutes),
      mobilisationMinutes:d.mobilisation_hours==null?"":String(d.mobilisation_hours*60),
      delaysComments:stripMobilisationLine(d.delays_comments),
      incidentOccurred:Boolean(d.incident_occurred),
      incidentType:clean(d.incident_type),
      incidentNotes:clean(d.incident_notes),
      bcRepName:clean(d.bc_rep_name),
      clientRepName:clean(d.client_rep_name),
      signedDate:clean(d.signed_date),
      hasBodyExtension:isV2?v2HasBe:inferBodyExtension(t),
      labourRows:b.labour.length?b.labour.map(dbLabour):[blankLabour()],
      progressRows:b.progress.length?b.progress.map(dbProgress):DEFAULT_PROGRESS.map(r=>({...r})),
      delayRows:b.delays.map(dbDelay),
      plantRows:b.plant.map(dbPlant),
      materialEvents:b.materialEvents.map(dbEvent),
      mobilisation:parseMobilisationLine(d.delays_comments)
    });
  }

  useEffect(()=>{
    if(!pendingReviewDocketId||bundles.length===0)return;
    const bundle=bundles.find(item=>item.docket.id===pendingReviewDocketId);
    if(!bundle)return;
    setSelectedTowerId(bundle.docket.tower_id);
    openBundle(bundle,canEditDocket(bundle.docket)?"edit":"view");
    setPendingReviewDocketId("");
  // openBundle/canEditDocket intentionally use the latest loaded project state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[pendingReviewDocketId,bundles,currentUserId,reviewerRoles]);


  function updateLabour(i:number,k:keyof LabourRow,v:string){setForm(f=>!f?f:{...f,labourRows:f.labourRows.map((r,x)=>{if(x!==i)return r;const n={...r,[k]:v};if(k==="time_in"||k==="time_out")n.total_hours=calculateHours(n.time_in,n.time_out);return n;})});}
  function blurLabourTime(i:number,k:"time_in"|"time_out"){setForm(f=>!f?f:{...f,labourRows:f.labourRows.map((r,x)=>{if(x!==i)return r;const n={...r,[k]:normaliseTimeInput(r[k])};n.total_hours=calculateHours(n.time_in,n.time_out);return n;})});}
  function updateProgress(i:number,k:keyof ProgressRow,v:string){setForm(f=>!f?f:{...f,progressRows:f.progressRows.map((r,x)=>x===i?{...r,[k]:k==="section_label"?v:v===""?"":String(Math.max(0,Math.min(100,toNumber(v))))}:r)});}
  function updatePlant(i:number,k:keyof PlantRow,v:string){setForm(f=>!f?f:{...f,plantRows:f.plantRows.map((r,x)=>{if(x!==i)return r;const n={...r,[k]:v};if(k==="time_in"||k==="time_out")n.total_hours=calculateHours(n.time_in,n.time_out);return n;})});}
  function blurPlantTime(i:number,k:"time_in"|"time_out"){setForm(f=>!f?f:{...f,plantRows:f.plantRows.map((r,x)=>{if(x!==i)return r;const n={...r,[k]:normaliseTimeInput(r[k])};n.total_hours=calculateHours(n.time_in,n.time_out);return n;})});}
  function updateDelay(i:number,p:Partial<DelayRow>){setForm(f=>!f?f:{...f,delayRows:f.delayRows.map((r,x)=>x===i?{...r,...p}:r)});}
  function updateEvent(i:number,p:Partial<MaterialEventDraft>){setForm(f=>!f?f:{...f,materialEvents:f.materialEvents.map((r,x)=>x===i?{...r,...p}:r)});}
  function updateItem(ei:number,ii:number,p:Partial<MaterialEventItemDraft>){setForm(f=>!f?f:{...f,materialEvents:f.materialEvents.map((e,x)=>x!==ei?e:{...e,items:e.items.map((r,y)=>y===ii?{...r,...p}:r)})});}
  function updatePerson(ei:number,pi:number,p:Partial<MaterialPersonDraft>){setForm(f=>!f?f:{...f,materialEvents:f.materialEvents.map((e,x)=>x!==ei?e:{...e,people:e.people.map((r,y)=>y===pi?{...r,...p}:r)})});}
  function updateMPlant(ei:number,pi:number,p:Partial<MaterialPlantDraft>){setForm(f=>!f?f:{...f,materialEvents:f.materialEvents.map((e,x)=>x!==ei?e:{...e,plant:e.plant.map((r,y)=>y===pi?{...r,...p}:r)})});}

  async function searchProjectMaterial(ei:number,ii:number,query:string){
    if(!form)return;
    const q=query.trim();
    updateItem(ei,ii,{
      search_query:query,
      material_kind:"registered",
      search_loading:q.length>=2,
      search_results:[],
      source_table:"",
      source_record_id:"",
      item_reference:"",
      item_description:"",
      bolt_size:""
    });
    if(q.length<2)return;

    const event=form.materialEvents[ei];
    const searchTowerId=event.event_type==="taken_from_another_tower"?event.source_tower_id:form.towerId;
    if(!searchTowerId){
      updateItem(ei,ii,{search_loading:false,item_description:"Select the source tower first."});
      return;
    }

    const safe=q.replace(/[,%()]/g," ").trim();
    const pattern=`%${safe}%`;
    const [membersRes,bundlesRes]=await Promise.all([
      supabase
        .from("tower_material_members")
        .select("id,tower_id,bundle_reference,drawing_number,mark_no,pn_final,qty_per_tower,section")
        .eq("tower_id",searchTowerId)
        .or([
          `mark_no.ilike.${pattern}`,
          `pn_final.ilike.${pattern}`,
          `bundle_reference.ilike.${pattern}`,
          `drawing_number.ilike.${pattern}`,
          `section.ilike.${pattern}`
        ].join(","))
        .limit(20),
      supabase
        .from("tower_required_bundles")
        .select("id,tower_id,bundle_no,section,qty_required")
        .eq("tower_id",searchTowerId)
        .or([`bundle_no.ilike.${pattern}`,`section.ilike.${pattern}`].join(","))
        .limit(12)
    ]);

    const searchError=membersRes.error?.message||bundlesRes.error?.message;
    const results:MaterialCatalogItem[]=[];

    for(const row of membersRes.data||[]){
      results.push({
        source_table:"tower_material_members",
        source_record_id:String(row.id),
        tower_id:String(row.tower_id),
        item_reference:String(row.mark_no||row.pn_final||row.bundle_reference||"Member"),
        item_description:[
          row.drawing_number?`Drawing ${row.drawing_number}`:"",
          row.bundle_reference?`Bundle ${row.bundle_reference}`:"",
          row.section?`Section ${row.section}`:"",
          row.pn_final?`Profile ${row.pn_final}`:""
        ].filter(Boolean).join(" · "),
        unit:"ea"
      });
    }

    for(const row of bundlesRes.data||[]){
      results.push({
        source_table:"tower_required_bundles",
        source_record_id:String(row.id),
        tower_id:String(row.tower_id),
        item_reference:`Bundle ${row.bundle_no||""}`.trim(),
        item_description:row.section?`Section ${row.section}`:"",
        unit:"bundle"
      });
    }

    updateItem(ei,ii,{
      search_loading:false,
      search_results:results,
      item_description:results.length===0&&searchError?`Search error: ${searchError}`:""
    });
  }

  function chooseCatalogItem(ei:number,ii:number,item:MaterialCatalogItem){
    updateItem(ei,ii,{
      material_kind:"registered",
      manual_category:"",
      bolt_size:"",
      search_query:item.item_reference,
      search_loading:false,
      search_results:[],
      source_table:item.source_table,
      source_record_id:item.source_record_id,
      item_reference:item.item_reference,
      item_description:item.item_description,
      unit:item.unit||"ea"
    });
  }

  function computed(f:FormState){const labour=f.labourRows.map(r=>{const total=calculateHours(r.time_in,r.time_out)||r.total_hours,n={...r,total_hours:total};return{...n,delay_hours:delayForWorker(n,f.delayRows),production_hours:productionHours(n,f.delayRows)}});return{labour,progress:progressTotals(f),raw:labour.reduce((s,r)=>s+toNumber(r.total_hours),0),production:labour.reduce((s,r)=>s+toNumber(r.production_hours),0)};}
  async function recalcTower(id:string){const {data,error}=await supabase.from("tower_daily_dockets").select("assembly_percent,erection_percent").eq("tower_id",id);if(error)throw error;const progress=(data??[]).reduce((m,r)=>Math.max(m,Math.round(toNumber(r.assembly_percent)*.5+toNumber(r.erection_percent)*.5)),0);const status=progress>=100?"Complete":progress>0?"In Progress":"Not Started";const u=await supabase.from("towers").update({progress,status,updated_at:new Date().toISOString()}).eq("id",id);if(u.error)throw u.error;}

  async function syncMaterialEvents(docketId:string,f:FormState){
    const del=await supabase.from("tower_material_events").delete().eq("docket_id",docketId);
    if(del.error)throw del.error;

    for(const e of f.materialEvents){
      const meaningfulItems=e.items.filter(item=>
        item.item_reference.trim()||
        (item.material_kind==="manual_bolt"&&item.bolt_size.trim())
      );
      if(!meaningfulItems.length)continue;

      const ins=await supabase.from("tower_material_events").insert({
        project_id:projectId,
        docket_id:docketId,
        tower_id:f.towerId,
        event_type:e.event_type,
        source_tower_id:e.source_tower_id||null,
        destination_tower_id:e.destination_tower_id||null,
        destination_location:e.destination_location||null,
        occurred_at:`${f.docketDate}T12:00:00`,
        affected_work:e.event_type==="excess"?false:e.affected_work,
        work_outcome:e.event_type==="excess"||!e.affected_work?null:e.work_outcome||null,
        affected_activity:e.event_type==="excess"||!e.affected_work?null:e.affected_activity||null,
        affected_section:e.event_type==="excess"||!e.affected_work?null:e.affected_section||null,
        impact_started_at:e.event_type==="excess"||!e.affected_work||e.work_outcome==="changed_sequence"?null:dateTimeIso(f.docketDate,e.impact_start_time),
        impact_finished_at:e.event_type==="excess"||!e.affected_work||e.work_outcome==="changed_sequence"||e.impact_ongoing?null:dateTimeIso(f.docketDate,e.impact_finish_time),
        impact_ongoing:e.event_type==="excess"||!e.affected_work||e.work_outcome==="changed_sequence"?false:e.impact_ongoing,
        current_effect:e.event_type==="excess"||!e.affected_work?null:e.current_effect||null,
        mitigation_actions:e.event_type==="excess"||!e.affected_work?[]:e.mitigation_actions,
        commercial_impact_type:e.work_outcome==="stopped_work"?"Delayed":e.work_outcome==="slowed_down"?"Disrupted":e.work_outcome==="changed_sequence"?"Resequenced":null,
        notes:e.notes.trim()||null
      }).select("id").single();

      if(ins.error||!ins.data)throw ins.error||new Error("Could not create material event.");
      const id=ins.data.id;

      const items=meaningfulItems.map(item=>{
        const manualBolt=item.material_kind==="manual_bolt";
        return{
          event_id:id,
          source_table:manualBolt?null:item.source_table||null,
          source_record_id:manualBolt?null:item.source_record_id||null,
          material_type:manualBolt?"bolt":item.source_table==="tower_material_members"?"steel_member":"other",
          bolt_size:manualBolt?item.bolt_size.trim()||null:null,
          item_reference:manualBolt?null:item.item_reference.trim()||null,
          item_description:manualBolt
            ?item.item_description.trim()||null
            :item.material_kind==="manual"
            ?[item.manual_category.trim(),item.item_description.trim()].filter(Boolean).join(" · ")||null
            :item.item_description.trim()||null,
          quantity:Math.max(.0001,toNumber(item.quantity)||1),
          unit:manualBolt?"ea":item.unit.trim()||"ea",
          notes:item.notes.trim()||null
        };
      });
      const itemRes=await supabase.from("tower_material_event_items").insert(items);
      if(itemRes.error)throw itemRes.error;

      const people=e.people.filter(x=>x.employee_name.trim()).map(x=>({
        event_id:id,
        employee_id:x.employee_id||null,
        employee_name:x.employee_name.trim(),
        employee_role:x.employee_role.trim()||null,
        involvement_type:"search_verify",
        started_at:dateTimeIso(f.docketDate,x.started_at),
        finished_at:dateTimeIso(f.docketDate,x.finished_at)
      }));
      if(people.length){
        const r=await supabase.from("tower_material_event_people").insert(people);
        if(r.error)throw r.error;
      }

      const plant=e.plant.filter(x=>x.plant_name.trim()).map(x=>({
        event_id:id,
        plant_asset_id:x.plant_asset_id||null,
        plant_name:x.plant_name.trim(),
        asset_number:x.asset_number.trim()||null,
        involvement_type:"affected",
        started_at:dateTimeIso(f.docketDate,x.started_at),
        finished_at:dateTimeIso(f.docketDate,x.finished_at)
      }));
      if(plant.length){
        const r=await supabase.from("tower_material_event_plant").insert(plant);
        if(r.error)throw r.error;
      }
    }
  }

  async function prefillPreviousDay(){
    if(!form||!projectId)return;
    setPrefilling(true);
    try{
      let q=supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("project_id",projectId)
        .eq("tower_id",form.towerId)
        .lt("docket_date",form.docketDate||today())
        .order("docket_date",{ascending:false})
        .limit(1);

      if(form.crewName.trim())q=q.eq("crew",form.crewName.trim());

      let {data,error}=await q;
      if(!error&&(!data||!data.length)&&form.crewName.trim()){
        const fallback=await supabase
          .from("tower_daily_dockets")
          .select("*")
          .eq("project_id",projectId)
          .eq("tower_id",form.towerId)
          .lt("docket_date",form.docketDate||today())
          .order("docket_date",{ascending:false})
          .limit(1);
        data=fallback.data;
        error=fallback.error;
      }

      if(error)throw error;
      const prev=(data?.[0]??null) as Docket|null;
      if(!prev){
        Alert.alert("No previous docket","No earlier docket was found for this tower.");
        return;
      }

      const [labourRes,progressRes,plantRes]=await Promise.all([
        supabase.from("tower_docket_labour").select("*").eq("docket_id",prev.id),
        supabase.from("tower_docket_progress").select("*").eq("docket_id",prev.id),
        supabase.from("tower_docket_plant").select("*").eq("docket_id",prev.id)
      ]);
      const err=[labourRes.error,progressRes.error,plantRes.error].find(Boolean);
      if(err)throw err;

      const previousProgress=(progressRes.data??[]) as ProgressDb[];
      const previousIsV2=clean(prev.progress_model)==="section_v2"||previousProgress.some(row=>clean(row.progress_model)==="section_v2");
      const previousHasBodyExtension=previousIsV2
        ?previousProgress.some(row=>clean(row.section_code).toUpperCase()==="BE")
        :inferBodyExtension(towers.find(t=>t.id===form.towerId)??null);

      const ccrew=crews.find(
        x=>clean(x.crew_number)===clean(prev.crew)||clean(x.crew_name)===clean(prev.crew)
      );

      setForm(cur=>!cur?cur:{
        ...cur,
        selectedCrewId:ccrew?.id??cur.selectedCrewId,
        crewName:clean(prev.crew)||cur.crewName,
        leadingHand:clean(prev.leading_hand)||cur.leadingHand,
        weather:"",
        rateType:prev.rate_type==="schedule_of_rates"?"schedule_of_rates":"tonnage_rate",
        progressModel:previousIsV2?"section_v2":"section_v2",
        approvalStatus:"draft",
        lunchBreakMinutes:prev.lunch_break_minutes==null?cur.lunchBreakMinutes:String(prev.lunch_break_minutes),
        travelInMinutes:prev.travel_in_minutes==null?cur.travelInMinutes:String(prev.travel_in_minutes),
        travelOutMinutes:prev.travel_out_minutes==null?cur.travelOutMinutes:String(prev.travel_out_minutes),
        mobilisationMinutes:prev.mobilisation_hours==null?cur.mobilisationMinutes:String(prev.mobilisation_hours*60),
        labourRows:(labourRes.data??[]).length?((labourRes.data??[]) as LabourDb[]).map(dbLabour):cur.labourRows,
        progressRows:previousIsV2&&previousProgress.length
          ?SECTION_V2.map(def=>{
              const row=previousProgress.find(r=>clean(r.section_code).toUpperCase()===def.code);
              return{
                section_label:def.label,
                assembled_qty:row?dbProgress(row).assembled_qty:"",
                erected_qty:row?dbProgress(row).erected_qty:""
              };
            })
          :cur.progressRows,
        hasBodyExtension:previousHasBodyExtension,
        plantRows:((plantRes.data??[]) as PlantDb[]).map(dbPlant),
        delayRows:[],
        materialEvents:[],
        delaysComments:"",
        incidentOccurred:false,
        incidentType:"",
        incidentNotes:"",
        bcRepName:"",
        clientRepName:"",
        signedDate:"",
        mobilisation:parseMobilisationLine(prev.delays_comments)
      });

      Alert.alert(
        "Previous day loaded",
        `${formatDate(prev.docket_date)} copied. Progress and Body Extension were carried forward; material issues and delays were not copied.`
      );
    }catch(e){
      Alert.alert("Could not prefill previous day",errorMessage(e));
    }finally{
      setPrefilling(false);
    }
  }

  async function saveDocket(){
    if(!form||!projectId)return;
    if(!form.docketDate){Alert.alert("Date required","Enter the docket date.");return;}
    if(!form.leadingHand.trim()){Alert.alert("Leading Hand required","Enter the leading hand.");return;}
    if(form.labourRows.some(r=>(r.time_in&&timeToMinutes(r.time_in)==null)||(r.time_out&&timeToMinutes(r.time_out)==null))){
      Alert.alert("Check worker times","Use 06:00, 6:00, 600, 18:00 or 1800.");
      return;
    }

    const names=form.labourRows.map(r=>normaliseName(r.worker_name)).filter(Boolean);
    if(new Set(names).size!==names.length){
      Alert.alert("Duplicate workers","Each worker can only appear once.");
      return;
    }

    for(const event of form.materialEvents){
      if(!event.items.some(item=>item.item_reference.trim()||(item.material_kind==="manual_bolt"&&item.bolt_size.trim()))){
        Alert.alert("Material item required","Each material record needs at least one item or a bolt size.");
        return;
      }
      if(event.event_type==="taken_from_another_tower"&&!event.source_tower_id){
        Alert.alert("Source tower required","Choose the source tower.");
        return;
      }
      if(event.event_type==="sent_to_another_tower"&&!event.destination_tower_id){
        Alert.alert("Destination tower required","Choose the destination tower.");
        return;
      }
      if(event.affected_work&&event.event_type!=="excess"&&!event.work_outcome){
        Alert.alert("Work impact required","Choose what happened to planned work.");
        return;
      }
    }

    setSaving(true);
    try{
      const existing=form.docketId?bundles.find(b=>b.docket.id===form.docketId):null;
      if(existing&&!canEditDocket(existing.docket)){
        throw new Error("This docket is locked by its approval status and cannot be edited.");
      }

      const values=computed(form);
      const mob=buildMobilisationLine(form.mobilisation);
      const comments=[stripMobilisationLine(form.delaysComments),mob].filter(Boolean).join("\n");

      const missingSummary=form.materialEvents
        .filter(event=>event.event_type==="missing")
        .flatMap(event=>event.items)
        .filter(item=>item.item_reference.trim()||(item.material_kind==="manual_bolt"&&item.bolt_size.trim()))
        .map(item=>{
          const ref=item.material_kind==="manual_bolt"?item.bolt_size.trim():item.item_reference.trim();
          return `${toNumber(item.quantity)||1} × ${ref}`;
        })
        .join("; ");

      const payload={
        project_id:projectId,
        tower_id:form.towerId,
        docket_date:form.docketDate,
        crew:form.crewName.trim()||null,
        leading_hand:form.leadingHand.trim(),
        weather:form.weather.trim()||null,
        rate_type:form.rateType,
        progress_model:form.progressModel,
        approval_status:form.approvalStatus||"draft",
        assembly_percent:values.progress.assembly,
        erection_percent:values.progress.erection,
        weather_delay_hours:form.delayRows.filter(r=>r.delay_type==="weather").reduce((sum,row)=>sum+toNumber(row.delay_hours),0),
        lightning_delay_hours:form.delayRows.filter(r=>r.delay_type==="lightning").reduce((sum,row)=>sum+toNumber(row.delay_hours),0),
        toolbox_delay_hours:form.delayRows.filter(r=>r.delay_type==="toolbox").reduce((sum,row)=>sum+toNumber(row.delay_hours),0),
        other_delay_hours:form.delayRows.filter(r=>r.delay_type==="other").reduce((sum,row)=>sum+toNumber(row.delay_hours),0),
        delays_comments:comments||null,
        missing_items_bolts:missingSummary||null,
        lunch_break_minutes:toNumber(form.lunchBreakMinutes),
        travel_in_minutes:toNumber(form.travelInMinutes),
        travel_out_minutes:toNumber(form.travelOutMinutes),
        mobilisation_hours:toNumber(form.mobilisationMinutes)/60,
        mobilisation_notes:form.mobilisation.enabled?form.mobilisation.notes.trim()||null:null,
        raw_manhours:values.raw,
        production_manhours:values.production,
        incident_occurred:form.incidentOccurred,
        incident_type:form.incidentOccurred?form.incidentType||null:null,
        incident_notes:form.incidentOccurred?form.incidentNotes.trim()||null:null,
        bc_rep_name:form.bcRepName.trim()||null
      };

      let docketId=form.docketId;
      if(form.mode==="create"){
        const result=await supabase.from("tower_daily_dockets").insert(payload).select("id").single();
        if(result.error||!result.data)throw result.error||new Error("Could not create docket.");
        docketId=String(result.data.id);
      }else{
        if(!form.docketId)throw new Error("Missing docket ID.");
        const result=await supabase.from("tower_daily_dockets").update(payload).eq("id",form.docketId);
        if(result.error)throw result.error;
      }

      if(!docketId)throw new Error("Missing docket ID.");

      const deletes=await Promise.all([
        supabase.from("tower_docket_labour").delete().eq("docket_id",docketId),
        supabase.from("tower_docket_progress").delete().eq("docket_id",docketId),
        supabase.from("tower_docket_delays").delete().eq("docket_id",docketId),
        supabase.from("tower_docket_plant").delete().eq("docket_id",docketId)
      ]);
      const deleteError=deletes.find(result=>result.error)?.error;
      if(deleteError)throw deleteError;

      const labour=values.labour
        .filter(row=>row.worker_name.trim())
        .map(row=>({
          docket_id:docketId,
          worker_name:row.worker_name.trim(),
          time_in:normaliseTimeInput(row.time_in)||null,
          time_out:normaliseTimeInput(row.time_out)||null,
          total_hours:toNumber(row.total_hours),
          lunch_minutes:toNumber(row.lunch_minutes),
          travel_in_minutes:toNumber(row.travel_in_minutes),
          travel_out_minutes:toNumber(row.travel_out_minutes),
          mobilisation_hours:toNumber(row.mobilisation_minutes)/60,
          delay_hours:toNumber(row.delay_hours),
          delay_reason:null,
          production_hours:toNumber(row.production_hours)
        }));

      const progressPayload=form.progressModel==="section_v2"
        ?SECTION_V2
          .filter(def=>form.hasBodyExtension||def.code!=="BE")
          .map(def=>{
            const row=form.progressRows.find(candidate=>candidate.section_label===def.label);
            const assembly=row?.assembled_qty?.trim()?toNumber(row.assembled_qty):null;
            const erection=row?.erected_qty?.trim()?toNumber(row.erected_qty):null;
            return{
              docket_id:docketId,
              progress_model:"section_v2",
              section:def.code,
              section_code:def.code,
              section_label:def.label,
              assembly_today:assembly,
              assembly_overall:assembly,
              erection_today:erection,
              erection_overall:erection,
              assembly_weight:SECTION_WEIGHTS[def.code]??0,
              erection_weight:SECTION_WEIGHTS[def.code]??0,
              assembled_qty:assembly??0,
              erected_qty:erection??0
            };
          })
        :form.progressRows.map(row=>({
            docket_id:docketId,
            progress_model:"legacy",
            section:row.section_label,
            section_label:row.section_label,
            assembled_qty:!form.hasBodyExtension&&row.section_label.toLowerCase().includes("body extension")?0:toNumber(row.assembled_qty),
            erected_qty:!form.hasBodyExtension&&row.section_label.toLowerCase().includes("body extension")?0:toNumber(row.erected_qty)
          }));

      const delays=form.delayRows
        .filter(row=>toNumber(row.delay_hours)>0||row.delay_reason.trim())
        .map(row=>({
          docket_id:docketId,
          delay_type:row.delay_type,
          delay_reason:row.delay_reason.trim()||null,
          delay_hours:toNumber(row.delay_hours),
          applies_to:row.applies_to,
          worker_names:row.applies_to==="selected_workers"?row.worker_names:[],
          delay_applies_mode:row.delay_mode,
          plant_names:row.delay_mode==="labour_and_plant"?row.plant_names:[]
        }));

      const plant=form.plantRows
        .filter(row=>row.plant_name.trim()||row.asset_id.trim()||row.plant_type.trim())
        .map(row=>({
          docket_id:docketId,
          plant_name:row.plant_name.trim()||null,
          plant_type:row.plant_type.trim()||null,
          asset_number:row.asset_id.trim()||null,
          time_in:form.rateType==="schedule_of_rates"?normaliseTimeInput(row.time_in)||null:null,
          time_out:form.rateType==="schedule_of_rates"?normaliseTimeInput(row.time_out)||null:null,
          total_hours:form.rateType==="schedule_of_rates"?toNumber(row.total_hours):0,
          notes:row.notes.trim()||null
        }));

      const inserts=await Promise.all([
        labour.length?supabase.from("tower_docket_labour").insert(labour):Promise.resolve({error:null}),
        progressPayload.length?supabase.from("tower_docket_progress").insert(progressPayload):Promise.resolve({error:null}),
        delays.length?supabase.from("tower_docket_delays").insert(delays):Promise.resolve({error:null}),
        plant.length?supabase.from("tower_docket_plant").insert(plant):Promise.resolve({error:null})
      ]);
      const insertError=inserts.find(result=>result.error)?.error;
      if(insertError)throw insertError;

      await syncMaterialEvents(docketId,form);

      if(existing&&clean(existing.docket.approval_status)==="submitted_bc"){
        const eventResult=await supabase.from("tower_docket_workflow_events").insert({
          docket_id:docketId,
          project_id:projectId,
          event_type:"submitted_docket_edited_mobile",
          performed_by:currentUserId||null,
          metadata:{source:"mobile",approval_status:"submitted_bc"}
        });
        if(eventResult.error)throw eventResult.error;
      }

      await recalcTower(form.towerId);
      setForm(null);
      setSelectedTowerId(form.towerId);
      await loadData(false);
      Alert.alert(
        form.mode==="create"?"Daily docket saved":"Daily docket updated",
        `${formatDate(form.docketDate)} · Crew ${form.crewName||"—"}`
      );
    }catch(e){
      Alert.alert("Could not save daily docket",errorMessage(e));
    }finally{
      setSaving(false);
    }
  }

  async function performDelete(b:Bundle){try{await Promise.all([supabase.from("tower_docket_labour").delete().eq("docket_id",b.docket.id),supabase.from("tower_docket_progress").delete().eq("docket_id",b.docket.id),supabase.from("tower_docket_delays").delete().eq("docket_id",b.docket.id),supabase.from("tower_docket_plant").delete().eq("docket_id",b.docket.id),supabase.from("tower_material_events").delete().eq("docket_id",b.docket.id)]);const r=await supabase.from("tower_daily_dockets").delete().eq("id",b.docket.id);if(r.error)throw r.error;await recalcTower(b.docket.tower_id);await loadData(false);}catch(e){Alert.alert("Could not delete docket",errorMessage(e));}}
  function deleteDocket(b:Bundle){
    const status=clean(b.docket.approval_status);
    if(isSigned(b.docket)||["submitted_bc","client_pending","final","legacy_final"].includes(status)){
      Alert.alert("Docket locked","Submitted or approved dockets cannot be deleted from the mobile app.");
      return;
    }
    Alert.alert("Delete daily docket?","This removes labour, progress, delay, plant and material-event rows.",[{text:"Cancel",style:"cancel"},{text:"Delete",style:"destructive",onPress:()=>void performDelete(b)}]);
  }

  function renderDocket({item}:{item:Bundle}){
    const progress=Math.round(toNumber(item.docket.assembly_percent)*.5+toNumber(item.docket.erection_percent)*.5),raw=item.docket.raw_manhours??item.labour.reduce((s,r)=>s+toNumber(r.total_hours),0),prod=item.docket.production_manhours??item.labour.reduce((s,r)=>s+toNumber(r.production_hours),0),issues=item.materialEvents.filter((e:any)=>e.event_type!=="excess").length,excess=item.materialEvents.filter((e:any)=>e.event_type==="excess").length;
    const editable=canEditDocket(item.docket);
    const deletable=editable&&!["submitted_bc","client_pending","final","legacy_final"].includes(clean(item.docket.approval_status));
    return <View style={styles.docketCard}>
      <Pressable onPress={()=>openBundle(item,"view")}>
        <View style={styles.docketTop}><View style={styles.docketText}><Text style={styles.docketDate}>{formatDate(item.docket.docket_date)}</Text><Text style={styles.docketMeta}>{item.docket.leading_hand||"No leading hand"} · Crew {item.docket.crew||"—"}</Text></View><StatusPill label={docketStatus(item.docket)}/></View>
        {(issues>0||excess>0)&&<View style={styles.cardPills}>{issues>0&&<InfoPill label={`${issues} material issue${issues===1?"":"s"}`} tone="amber"/>}{excess>0&&<InfoPill label={`${excess} excess`} tone="green"/>}</View>}
        <View style={styles.progressLine}><View style={styles.progressTextRow}><Text style={styles.progressLabel}>Progress</Text><Text style={styles.progressValue}>{progress}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill,{width:`${Math.max(0,Math.min(100,progress))}%`}]} /></View></View>
        <View style={styles.metricRow}><Metric label="Workers" value={String(item.labour.length)}/><Metric label="Raw" value={raw.toFixed(1)}/><Metric label="Prod" value={prod.toFixed(1)}/><Metric label="Issues" value={String(issues)}/></View>
      </Pressable>
      <View style={styles.cardActions}><ActionButton icon="eye-outline" label="View" onPress={()=>openBundle(item,"view")}/>{editable&&<ActionButton icon="create-outline" label={clean(item.docket.approval_status)==="submitted_bc"?"Edit Submitted":"Edit"} primary onPress={()=>openBundle(item,"edit")}/>} {deletable&&<Pressable style={styles.deleteButton} onPress={()=>deleteDocket(item)}><Ionicons name="trash-outline" size={18} color="#BE123C"/></Pressable>}</View>
    </View>;
  }

  if(loading)return <SafeAreaView style={styles.safeArea}><View style={styles.loading}><ActivityIndicator size="large" color="#2563EB"/><Text style={styles.loadingText}>Loading daily dockets…</Text></View></SafeAreaView>;

  return <SafeAreaView style={styles.safeArea}><View style={styles.screen}>
    <View style={styles.header}><View style={styles.headerRow}><View style={styles.headerText}><Text style={styles.title}>Daily Dockets</Text><Text style={styles.subtitle}>{projectNumber?`${projectNumber} · ${projectName}`:projectName||"No project selected"}</Text></View><Pressable style={styles.addButton} onPress={openCreate}><Ionicons name="add" size={23} color="#FFF"/></Pressable><Pressable style={styles.refreshButton} onPress={()=>void refresh()}>{refreshing?<ActivityIndicator size="small" color="#334155"/>:<Ionicons name="refresh" size={20} color="#334155"/>}</Pressable></View></View>
    {!projectId?<Empty title="No project selected" text="Select a project from Home first."/>:<FlatList data={visibleBundles} keyExtractor={i=>i.docket.id} renderItem={renderDocket} contentContainerStyle={styles.listContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh()}/>} ListHeaderComponent={<View>
      <Pressable style={styles.towerSelector} onPress={()=>setTowerPickerOpen(true)}><View style={styles.towerText}><Text style={styles.towerLabel}>SELECTED TOWER</Text><Text style={styles.towerValue}>{selectedTower?towerLabel(selectedTower):"Choose a tower"}</Text></View><Ionicons name="chevron-down" size={19} color="#64748B"/></Pressable>
      <View style={styles.summaryGrid}><Summary label="Dockets" value={String(summary.count)}/><Summary label="Raw Hrs" value={summary.raw.toFixed(1)}/><Summary label="Prod Hrs" value={summary.production.toFixed(1)}/><Summary label="Issues" value={String(summary.issues)}/></View>
      <View style={styles.searchBox}><Ionicons name="search" size={18} color="#64748B"/><TextInput value={search} onChangeText={setSearch} style={styles.searchInput} placeholder="Search dockets or members…" placeholderTextColor="#94A3B8"/></View>
    </View>} ListEmptyComponent={<Empty title="No dockets for this tower" text="Tap + to create the first docket."/>}/>}
    <TowerPicker visible={towerPickerOpen} towers={visibleTowers} search={towerSearch} onSearch={setTowerSearch} onClose={()=>setTowerPickerOpen(false)} onSelect={t=>{setSelectedTowerId(t.id);setTowerPickerOpen(false);setSearch("");}}/>
    <DocketEditor form={form} tower={towers.find(r=>r.id===form?.towerId)??null} towers={towers} crews={crews} employees={employees} saving={saving} prefilling={prefilling} onClose={()=>setForm(null)} onChange={setForm} onSelectCrew={id=>void selectCrew(id)} onPrefill={()=>void prefillPreviousDay()} onUpdateLabour={updateLabour} onBlurLabourTime={blurLabourTime} onUpdateProgress={updateProgress} onUpdatePlant={updatePlant} onBlurPlantTime={blurPlantTime} onUpdateDelay={updateDelay} onUpdateEvent={updateEvent} onUpdateItem={updateItem} onUpdatePerson={updatePerson} onUpdateMPlant={updateMPlant} onSearchMaterial={(ei,ii,q)=>void searchProjectMaterial(ei,ii,q)} onChooseCatalogItem={chooseCatalogItem} onSave={()=>void saveDocket()}/>
  </View></SafeAreaView>;
}

function DocketEditor(props:{
  form:FormState|null;tower:Tower|null;towers:Tower[];crews:Crew[];employees:Employee[];saving:boolean;prefilling:boolean;
  onClose:()=>void;onChange:React.Dispatch<React.SetStateAction<FormState|null>>;onSelectCrew:(id:string)=>void;onPrefill:()=>void;
  onUpdateLabour:(i:number,k:keyof LabourRow,v:string)=>void;onBlurLabourTime:(i:number,k:"time_in"|"time_out")=>void;
  onUpdateProgress:(i:number,k:keyof ProgressRow,v:string)=>void;onUpdatePlant:(i:number,k:keyof PlantRow,v:string)=>void;onBlurPlantTime:(i:number,k:"time_in"|"time_out")=>void;
  onUpdateDelay:(i:number,p:Partial<DelayRow>)=>void;onUpdateEvent:(i:number,p:Partial<MaterialEventDraft>)=>void;onUpdateItem:(ei:number,ii:number,p:Partial<MaterialEventItemDraft>)=>void;
  onUpdatePerson:(ei:number,pi:number,p:Partial<MaterialPersonDraft>)=>void;onUpdateMPlant:(ei:number,pi:number,p:Partial<MaterialPlantDraft>)=>void;
  onSearchMaterial:(ei:number,ii:number,q:string)=>void;onChooseCatalogItem:(ei:number,ii:number,item:MaterialCatalogItem)=>void;onSave:()=>void;
}){
  const {form,tower,towers,crews,employees,saving,prefilling,onClose,onChange,onSelectCrew,onPrefill,onUpdateLabour,onBlurLabourTime,onUpdateProgress,onUpdatePlant,onBlurPlantTime,onUpdateDelay,onUpdateEvent,onUpdateItem,onUpdatePerson,onUpdateMPlant,onSearchMaterial,onChooseCatalogItem,onSave}=props;
  const [open,setOpen]=useState<Record<string,boolean>>({details:true,progress:true,labour:true,defaults:false,plant:false,delays:false,materials:false,excess:false,mobilisation:false,safety:false,signoff:false});
  const [bulkIn,setBulkIn]=useState(""),[bulkOut,setBulkOut]=useState("");
  if(!form)return null;const f=form,readOnly=f.mode==="view"||Boolean(f.clientRepName&&f.signedDate)||["client_pending","final","legacy_final"].includes(f.approvalStatus);
  const values=f.labourRows.map(r=>{const total=calculateHours(r.time_in,r.time_out)||r.total_hours,n={...r,total_hours:total};return{...n,delay_hours:delayForWorker(n,f.delayRows),production_hours:productionHours(n,f.delayRows)}});
  const totals={workers:values.filter(r=>r.worker_name.trim()).length,raw:values.reduce((s,r)=>s+toNumber(r.total_hours),0),production:values.reduce((s,r)=>s+toNumber(r.production_hours),0)};
  const progress=progressTotals(f),issueCount=f.materialEvents.filter(e=>e.event_type!=="excess").length,excessCount=f.materialEvents.filter(e=>e.event_type==="excess").length;
  const workerNames=Array.from(new Set(f.labourRows.map(r=>r.worker_name.trim()).filter(Boolean)));
  const labourWorkers=workerNames.map(name=>{
    const employee=employees.find(emp=>normaliseName(emp.full_name)===normaliseName(name));
    return{
      id:employee?.id||`manual:${normaliseName(name)}`,
      name,
      role:clean(employee?.role)
    };
  });
  const plantNames=f.plantRows.map(plantDisplay);
  const update=<K extends keyof FormState>(k:K,v:FormState[K])=>onChange(cur=>cur?{...cur,[k]:v}:cur);
  const toggle=(k:string)=>setOpen(x=>({...x,[k]:!x[k]}));
  const addWorker=()=>update("labourRows",[...f.labourRows,blankLabour({lunch:f.lunchBreakMinutes,travelIn:f.travelInMinutes,travelOut:f.travelOutMinutes,mobilisation:f.mobilisationMinutes})]);
  const applyTimes=()=>{const a=normaliseTimeInput(bulkIn),b=normaliseTimeInput(bulkOut);setBulkIn(a);setBulkOut(b);update("labourRows",f.labourRows.map(r=>{const x=a||r.time_in,y=b||r.time_out;return{...r,time_in:x,time_out:y,total_hours:calculateHours(x,y)}}));};
  const applyDefaults=()=>update("labourRows",f.labourRows.map(r=>({...r,lunch_minutes:f.lunchBreakMinutes,travel_in_minutes:f.travelInMinutes,travel_out_minutes:f.travelOutMinutes,mobilisation_minutes:f.mobilisationMinutes})));
  const addEvent=(type:MaterialEventType)=>update("materialEvents",[...f.materialEvents,blankMaterialEvent(type)]);
  const toggleMitigation=(ei:number,a:string)=>{const e=f.materialEvents[ei],has=e.mitigation_actions.includes(a);onUpdateEvent(ei,{mitigation_actions:has?e.mitigation_actions.filter(x=>x!==a):[...e.mitigation_actions,a]});};
  const togglePerson=(ei:number,worker:{id:string;name:string;role:string})=>{
    const e=f.materialEvents[ei];
    const has=e.people.some(person=>normaliseName(person.employee_name)===normaliseName(worker.name));
    onUpdateEvent(ei,{
      people:has
        ?e.people.filter(person=>normaliseName(person.employee_name)!==normaliseName(worker.name))
        :[...e.people,{
            ui_id:uid("person"),
            employee_id:worker.id.startsWith("manual:")?"":worker.id,
            employee_name:worker.name,
            employee_role:worker.role,
            started_at:"",
            finished_at:""
          }]
    });
  };
  const toggleMPlant=(ei:number,row:PlantRow)=>{const e=f.materialEvents[ei],name=plantDisplay(row),has=e.plant.some(p=>normaliseName(p.plant_name)===normaliseName(name));onUpdateEvent(ei,{plant:has?e.plant.filter(p=>normaliseName(p.plant_name)!==normaliseName(name)):[...e.plant,{ui_id:uid("mplant"),plant_asset_id:"",plant_name:name,asset_number:row.asset_id,started_at:"",finished_at:""}]});};

  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}><SafeAreaView style={styles.safeArea}><KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==="ios"?"padding":undefined}>
    <View style={styles.modalHeader}><Pressable style={styles.backButton} onPress={onClose}><Ionicons name="arrow-back" size={22} color="#334155"/></Pressable><View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>{f.mode==="create"?"New Daily Docket":f.mode==="edit"?"Edit Docket":"View Docket"}</Text><Text style={styles.modalSubtitle}>{tower?towerLabel(tower):"Tower docket"}</Text></View>{!readOnly?<Pressable style={[styles.headerSave,saving&&styles.disabled]} disabled={saving} onPress={onSave}>{saving?<ActivityIndicator size="small" color="#FFF"/>:<Ionicons name="save-outline" size={20} color="#FFF"/>}</Pressable>:<View style={styles.modalSpacer}/>}</View>
    <ScrollView contentContainerStyle={styles.editorContent} keyboardShouldPersistTaps="handled">
      {f.mode==="create"&&!readOnly&&<Pressable style={[styles.prefillButton,prefilling&&styles.disabled]} disabled={prefilling} onPress={onPrefill}>{prefilling?<ActivityIndicator size="small" color="#FFF"/>:<Ionicons name="copy-outline" size={18} color="#FFF"/>}<Text style={styles.prefillText}>{prefilling?"Loading previous docket…":"Copy Previous Docket"}</Text></Pressable>}
      <View style={styles.quickSummary}><Kpi label="Workers" value={String(totals.workers)}/><Kpi label="Raw" value={totals.raw.toFixed(1)}/><Kpi label="Prod" value={totals.production.toFixed(1)}/><Kpi label="Progress" value={`${progress.overall}%`}/></View>

      <CollapsibleSection title="Docket details" open={open.details} onToggle={()=>toggle("details")}>
        <View style={styles.twoColumns}><SmallField label="Date" value={f.docketDate} onChangeText={v=>update("docketDate",v)} editable={!readOnly} keyboard="default"/><SmallField label="Weather" value={f.weather} onChangeText={v=>update("weather",v)} editable={!readOnly} keyboard="default"/></View>
        <SelectButtons label="Crew" value={f.selectedCrewId} options={crews.map(c=>({value:c.id,label:crewLabel(c)}))} onChange={onSelectCrew} disabled={readOnly}/>
        <Field label="Leading Hand" value={f.leadingHand} onChangeText={v=>update("leadingHand",v)} editable={!readOnly}/>
        <Choice label="Rate" value={f.rateType} options={[["tonnage_rate","Tonnage"],["schedule_of_rates","Schedule of Rates"]]} onChange={v=>update("rateType",v as RateType)} disabled={readOnly}/>
        <View style={styles.field}><Text style={styles.fieldLabel}>Workflow</Text><View style={styles.readOnlyField}><Text style={styles.readOnlyFieldText}>{approvalLabel(f.approvalStatus)}</Text></View></View>
      </CollapsibleSection>

      <CollapsibleSection title="Tower progress" open={open.progress} onToggle={()=>toggle("progress")} badge={`${progress.overall}%`}>
        {f.progressModel==="section_v2"&&<Choice label="Body Extension" value={f.hasBodyExtension?"yes":"no"} options={[["yes","Included"],["no","Excluded"]]} onChange={v=>update("hasBodyExtension",v==="yes")} disabled={readOnly}/>}
        {f.progressRows.filter(r=>f.hasBodyExtension||r.section_label.toLowerCase()!=="body extensions").map(r=>{const i=f.progressRows.findIndex(x=>x.section_label===r.section_label);return <View key={r.section_label} style={styles.compactProgressRow}><Text style={styles.compactProgressLabel}>{r.section_label}</Text><CompactPercent label="A" value={r.assembled_qty} onChange={v=>onUpdateProgress(i,"assembled_qty",v)} editable={!readOnly}/><CompactPercent label="E" value={r.erected_qty} onChange={v=>onUpdateProgress(i,"erected_qty",v)} editable={!readOnly}/></View>})}
      </CollapsibleSection>

      <CollapsibleSection title="Labour" open={open.labour} onToggle={()=>toggle("labour")} badge={String(totals.workers)}>
        {!readOnly&&<><Text style={styles.helperText}>Times accept 6, 600, 06:00, 6:30, 1800 or 18:00.</Text><View style={styles.bulkCompact}><TimeField label="Time In" value={bulkIn} onChangeText={setBulkIn} onBlur={()=>setBulkIn(normaliseTimeInput(bulkIn))} editable/><TimeField label="Time Out" value={bulkOut} onChangeText={setBulkOut} onBlur={()=>setBulkOut(normaliseTimeInput(bulkOut))} editable/><Pressable style={styles.applyButton} onPress={applyTimes}><Text style={styles.applyButtonText}>Apply</Text></Pressable></View></>}
        {values.map((r,i)=><View key={`worker-${i}`} style={styles.workerRow}><View style={styles.workerTopRow}><TextInput value={r.worker_name} onChangeText={v=>onUpdateLabour(i,"worker_name",v)} editable={!readOnly} style={[styles.workerNameInput,readOnly&&styles.inputDisabled]} placeholder="Worker name" placeholderTextColor="#94A3B8"/>{!readOnly&&<Pressable onPress={()=>update("labourRows",f.labourRows.filter((_,x)=>x!==i))} style={styles.iconDelete}><Ionicons name="trash-outline" size={17} color="#BE123C"/></Pressable>}</View><View style={styles.workerTimeRow}><TimeMiniInput label="In" value={r.time_in} onChange={v=>onUpdateLabour(i,"time_in",v)} onBlur={()=>onBlurLabourTime(i,"time_in")} editable={!readOnly}/><TimeMiniInput label="Out" value={r.time_out} onChange={v=>onUpdateLabour(i,"time_out",v)} onBlur={()=>onBlurLabourTime(i,"time_out")} editable={!readOnly}/><MiniStat label="Raw" value={r.total_hours||"0.00"}/><MiniStat label="Prod" value={r.production_hours} tone="green"/></View></View>)}
        {!readOnly&&<Pressable style={styles.secondaryButton} onPress={addWorker}><Ionicons name="person-add-outline" size={17} color="#0F172A"/><Text style={styles.secondaryButtonText}>Add worker</Text></Pressable>}
      </CollapsibleSection>

      <CollapsibleSection title="Work time defaults" open={open.defaults} onToggle={()=>toggle("defaults")}>
        <View style={styles.twoColumns}><SmallField label="Lunch min" value={f.lunchBreakMinutes} onChangeText={v=>update("lunchBreakMinutes",v)} editable={!readOnly}/><SmallField label="Prestart min" value={f.mobilisationMinutes} onChangeText={v=>update("mobilisationMinutes",v)} editable={!readOnly}/></View>
        <View style={styles.twoColumns}><SmallField label="Travel in" value={f.travelInMinutes} onChangeText={v=>update("travelInMinutes",v)} editable={!readOnly}/><SmallField label="Travel out" value={f.travelOutMinutes} onChangeText={v=>update("travelOutMinutes",v)} editable={!readOnly}/></View>
        {!readOnly&&<Pressable style={styles.secondaryButton} onPress={applyDefaults}><Text style={styles.secondaryButtonText}>Apply defaults to all workers</Text></Pressable>}
      </CollapsibleSection>

      <CollapsibleSection title="Plant & vehicles" open={open.plant} onToggle={()=>toggle("plant")} badge={f.plantRows.length?String(f.plantRows.length):undefined}>
        <Text style={styles.helperText}>Crew-assigned assets are auto-added. Hours are only required for Schedule of Rates.</Text>
        {f.plantRows.map((r,i)=><View key={`plant-${i}`} style={styles.plantCard}><View style={styles.rowHeader}><Text style={styles.rowTitle}>{plantDisplay(r)}</Text>{!readOnly&&<Pressable onPress={()=>update("plantRows",f.plantRows.filter((_,x)=>x!==i))}><Ionicons name="trash-outline" size={17} color="#BE123C"/></Pressable>}</View><View style={styles.twoColumns}><FieldCompact label="Name" value={r.plant_name}/><FieldCompact label="Asset ID" value={r.asset_id}/></View>{f.rateType==="schedule_of_rates"&&<View style={styles.workerTimeRow}><TimeMiniInput label="In" value={r.time_in} onChange={v=>onUpdatePlant(i,"time_in",v)} onBlur={()=>onBlurPlantTime(i,"time_in")} editable={!readOnly}/><TimeMiniInput label="Out" value={r.time_out} onChange={v=>onUpdatePlant(i,"time_out",v)} onBlur={()=>onBlurPlantTime(i,"time_out")} editable={!readOnly}/><MiniStat label="Hours" value={r.total_hours||"0.00"}/></View>}</View>)}
        {!readOnly&&<Pressable style={styles.secondaryButton} onPress={()=>update("plantRows",[...f.plantRows,blankPlant()])}><Text style={styles.secondaryButtonText}>Add plant / vehicle</Text></Pressable>}
      </CollapsibleSection>

      <CollapsibleSection title="General delays" open={open.delays} onToggle={()=>toggle("delays")} badge={f.delayRows.length?String(f.delayRows.length):undefined}>
        <TextArea label="General site comment" value={f.delaysComments} onChangeText={v=>update("delaysComments",v)} editable={!readOnly}/>
        {f.delayRows.map((d,i)=><View key={d.ui_id} style={styles.delayCard}><View style={styles.rowHeader}><Text style={styles.rowTitle}>Delay {i+1}</Text>{!readOnly&&<Pressable onPress={()=>update("delayRows",f.delayRows.filter((_,x)=>x!==i))}><Ionicons name="trash-outline" size={17} color="#BE123C"/></Pressable>}</View><SelectButtons label="Type" value={d.delay_type} options={DELAY_OPTIONS} onChange={v=>onUpdateDelay(i,{delay_type:v as DelayType})} disabled={readOnly}/><SmallField label="Hours" value={d.delay_hours} onChangeText={v=>onUpdateDelay(i,{delay_hours:v})} editable={!readOnly}/><TextArea label="Reason" value={d.delay_reason} onChangeText={v=>onUpdateDelay(i,{delay_reason:v})} editable={!readOnly}/><Choice label="Applies to" value={d.applies_to} options={[["entire_crew","Entire Crew"],["selected_workers","Selected Workers"]]} onChange={v=>onUpdateDelay(i,{applies_to:v as DelayScope,worker_names:v==="entire_crew"?[]:d.worker_names})} disabled={readOnly}/>{d.applies_to==="selected_workers"&&<ChipSelector label="Workers" values={workerNames} selected={d.worker_names} disabled={readOnly} onToggle={name=>{const has=d.worker_names.some(x=>normaliseName(x)===normaliseName(name));onUpdateDelay(i,{worker_names:has?d.worker_names.filter(x=>normaliseName(x)!==normaliseName(name)):[...d.worker_names,name]})}}/>}<Choice label="Plant affected?" value={d.delay_mode} options={[["labour_only","No"],["labour_and_plant","Yes"]]} onChange={v=>onUpdateDelay(i,{delay_mode:v as DelayMode,plant_names:v==="labour_only"?[]:d.plant_names})} disabled={readOnly}/>{d.delay_mode==="labour_and_plant"&&<ChipSelector label="Plant" values={plantNames} selected={d.plant_names} disabled={readOnly} onToggle={name=>{const has=d.plant_names.some(x=>normaliseName(x)===normaliseName(name));onUpdateDelay(i,{plant_names:has?d.plant_names.filter(x=>normaliseName(x)!==normaliseName(name)):[...d.plant_names,name]})}}/>}</View>)}
        {!readOnly&&<Pressable style={styles.secondaryButton} onPress={()=>update("delayRows",[...f.delayRows,blankDelay()])}><Text style={styles.secondaryButtonText}>Add general delay</Text></Pressable>}
      </CollapsibleSection>

      <CollapsibleSection title="Steel / material issues" open={open.materials} onToggle={()=>toggle("materials")} badge={issueCount?String(issueCount):undefined} tone="amber">
        <Text style={styles.helperText}>Missing, received, transferred or incorrect material. Excess is separate.</Text>
        {f.materialEvents.map((e,ei)=>e.event_type==="excess"?null:<MaterialEventCard key={e.ui_id} event={e} eventIndex={ei} towers={towers} labourWorkers={labourWorkers} plantRows={f.plantRows} progressRows={f.progressRows} readOnly={readOnly} onRemove={()=>update("materialEvents",f.materialEvents.filter((_,x)=>x!==ei))} onUpdateEvent={p=>onUpdateEvent(ei,p)} onUpdateItem={(ii,p)=>onUpdateItem(ei,ii,p)} onAddItem={()=>onUpdateEvent(ei,{items:[...e.items,blankMaterialItem()]})} onRemoveItem={ii=>onUpdateEvent(ei,{items:e.items.filter((_,x)=>x!==ii).length?e.items.filter((_,x)=>x!==ii):[blankMaterialItem()]})} onSearchItem={(ii,q)=>onSearchMaterial(ei,ii,q)} onChooseItem={(ii,item)=>onChooseCatalogItem(ei,ii,item)} onToggleWorker={worker=>togglePerson(ei,worker)} onTogglePlant={row=>toggleMPlant(ei,row)} onUpdatePerson={(pi,p)=>onUpdatePerson(ei,pi,p)} onUpdatePlant={(pi,p)=>onUpdateMPlant(ei,pi,p)} onToggleMitigation={a=>toggleMitigation(ei,a)}/>)}
        {!readOnly&&<Pressable style={[styles.secondaryButton,styles.amberButton]} onPress={()=>addEvent("missing")}><Text style={[styles.secondaryButtonText,styles.amberButtonText]}>Add material issue / movement</Text></Pressable>}
      </CollapsibleSection>

      <CollapsibleSection title="Excess steel / materials" open={open.excess} onToggle={()=>toggle("excess")} badge={excessCount?String(excessCount):undefined} tone="green">
        {f.materialEvents.map((e,ei)=>e.event_type!=="excess"?null:<ExcessMaterialCard key={e.ui_id} event={e} towers={towers} readOnly={readOnly} onRemove={()=>update("materialEvents",f.materialEvents.filter((_,x)=>x!==ei))} onUpdateEvent={p=>onUpdateEvent(ei,p)} onUpdateItem={(ii,p)=>onUpdateItem(ei,ii,p)} onAddItem={()=>onUpdateEvent(ei,{items:[...e.items,blankMaterialItem()]})} onRemoveItem={ii=>onUpdateEvent(ei,{items:e.items.filter((_,x)=>x!==ii).length?e.items.filter((_,x)=>x!==ii):[blankMaterialItem()]})} onSearchItem={(ii,q)=>onSearchMaterial(ei,ii,q)} onChooseItem={(ii,item)=>onChooseCatalogItem(ei,ii,item)}/>)}
        {!readOnly&&<Pressable style={[styles.secondaryButton,styles.greenButton]} onPress={()=>addEvent("excess")}><Text style={[styles.secondaryButtonText,styles.greenButtonText]}>Add excess material</Text></Pressable>}
      </CollapsibleSection>

      <CollapsibleSection title="Mobilisation" open={open.mobilisation} onToggle={()=>toggle("mobilisation")} badge={f.mobilisation.enabled?`${Math.round(toNumber(f.mobilisation.percent_complete))}%`:undefined} tone="blue">
        <Choice label="Track mobilisation?" value={f.mobilisation.enabled?"yes":"no"} options={[["no","No"],["yes","Yes"]]} onChange={v=>update("mobilisation",{...f.mobilisation,enabled:v==="yes"})} disabled={readOnly}/>
        {f.mobilisation.enabled&&<><TowerChoice label="Moving from" value={f.mobilisation.from_tower_id} towers={towers} disabled={readOnly} onChange={v=>update("mobilisation",{...f.mobilisation,from_tower_id:v})}/><TowerChoice label="Moving to" value={f.mobilisation.to_tower_id} towers={towers} disabled={readOnly} onChange={v=>update("mobilisation",{...f.mobilisation,to_tower_id:v})}/><SelectButtons label="Current stage" value={f.mobilisation.status} options={[{value:"planning",label:"Planning"},{value:"packing",label:"Packing"},{value:"demobilising",label:"Demob"},{value:"in_transit",label:"In Transit"},{value:"mobilising",label:"Mobilising"},{value:"setup",label:"Setup"},{value:"complete",label:"Complete"}]} onChange={v=>update("mobilisation",{...f.mobilisation,status:v as MobilisationDraft["status"]})} disabled={readOnly}/><SmallField label="Progress %" value={f.mobilisation.percent_complete} onChangeText={v=>update("mobilisation",{...f.mobilisation,percent_complete:String(Math.max(0,Math.min(100,toNumber(v))))})} editable={!readOnly}/><View style={styles.twoColumns}><SmallField label="Started" value={f.mobilisation.started_date} onChangeText={v=>update("mobilisation",{...f.mobilisation,started_date:v})} editable={!readOnly} keyboard="default"/><SmallField label="Target move" value={f.mobilisation.target_move_date} onChangeText={v=>update("mobilisation",{...f.mobilisation,target_move_date:v})} editable={!readOnly} keyboard="default"/></View><SmallField label="Completed" value={f.mobilisation.completed_date} onChangeText={v=>update("mobilisation",{...f.mobilisation,completed_date:v})} editable={!readOnly} keyboard="default"/><TextArea label="Mobilisation notes" value={f.mobilisation.notes} onChangeText={v=>update("mobilisation",{...f.mobilisation,notes:v})} editable={!readOnly}/></>}
      </CollapsibleSection>

      <CollapsibleSection title="Safety" open={open.safety} onToggle={()=>toggle("safety")} badge={f.incidentOccurred?"Incident":undefined}>
        <Choice label="Incident occurred?" value={f.incidentOccurred?"yes":"no"} options={[["no","No"],["yes","Yes"]]} onChange={v=>{const yes=v==="yes";update("incidentOccurred",yes);if(!yes){update("incidentType","");update("incidentNotes","");}}} disabled={readOnly}/>
        {f.incidentOccurred&&<><SelectButtons label="Type" value={f.incidentType} options={[{value:"injury",label:"Injury"},{value:"near_miss",label:"Near Miss"},{value:"property_damage",label:"Damage"},{value:"environmental",label:"Environmental"},{value:"other",label:"Other"}]} onChange={v=>update("incidentType",v)} disabled={readOnly}/><TextArea label="Incident notes" value={f.incidentNotes} onChangeText={v=>update("incidentNotes",v)} editable={!readOnly}/></>}
      </CollapsibleSection>

      <CollapsibleSection title="Sign-off" open={open.signoff} onToggle={()=>toggle("signoff")}>
        <Field label="BC Rep" value={f.bcRepName} onChangeText={v=>update("bcRepName",v)} editable={!readOnly}/><Field label="Client Rep" value={f.clientRepName} onChangeText={v=>update("clientRepName",v)} editable={!readOnly}/><Field label="Signed Date" value={f.signedDate} onChangeText={v=>update("signedDate",v)} editable={!readOnly} placeholder="YYYY-MM-DD"/>
      </CollapsibleSection>

      {!readOnly&&<Pressable style={[styles.saveButton,saving&&styles.disabled]} disabled={saving} onPress={onSave}>{saving?<ActivityIndicator color="#FFF"/>:<><Ionicons name="save-outline" size={20} color="#FFF"/><Text style={styles.saveText}>{f.mode==="create"?"Save Daily Docket":"Update Daily Docket"}</Text></>}</Pressable>}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView></Modal>;
}

function MaterialEventCard(props:{
  event:MaterialEventDraft;eventIndex:number;towers:Tower[];labourWorkers:{id:string;name:string;role:string}[];plantRows:PlantRow[];progressRows:ProgressRow[];readOnly:boolean;
  onRemove:()=>void;onUpdateEvent:(p:Partial<MaterialEventDraft>)=>void;onUpdateItem:(i:number,p:Partial<MaterialEventItemDraft>)=>void;onAddItem:()=>void;onRemoveItem:(i:number)=>void;
  onSearchItem:(i:number,q:string)=>void;onChooseItem:(i:number,item:MaterialCatalogItem)=>void;onToggleWorker:(worker:{id:string;name:string;role:string})=>void;onTogglePlant:(r:PlantRow)=>void;
  onUpdatePerson:(i:number,p:Partial<MaterialPersonDraft>)=>void;onUpdatePlant:(i:number,p:Partial<MaterialPlantDraft>)=>void;onToggleMitigation:(a:string)=>void;
}){
  const {event:e,towers,labourWorkers,plantRows,progressRows,readOnly,onRemove,onUpdateEvent,onUpdateItem,onAddItem,onRemoveItem,onSearchItem,onChooseItem,onToggleWorker,onTogglePlant,onUpdatePerson,onUpdatePlant,onToggleMitigation}=props;
  return <View style={styles.materialCard}>
    <View style={styles.rowHeader}><Text style={styles.materialCardTitle}>Material issue / movement</Text>{!readOnly&&<Pressable onPress={onRemove}><Ionicons name="trash-outline" size={17} color="#BE123C"/></Pressable>}</View>
    <SelectButtons label="What happened?" value={e.event_type} options={MATERIAL_EVENT_OPTIONS} onChange={v=>onUpdateEvent({event_type:v as MaterialEventType,source_tower_id:v==="taken_from_another_tower"?e.source_tower_id:"",destination_tower_id:v==="sent_to_another_tower"?e.destination_tower_id:""})} disabled={readOnly}/>
    {e.event_type==="taken_from_another_tower"&&<TowerChoice label="Taken from tower" value={e.source_tower_id} towers={towers} disabled={readOnly} onChange={v=>onUpdateEvent({source_tower_id:v})}/>}
    {e.event_type==="sent_to_another_tower"&&<TowerChoice label="Sent to tower" value={e.destination_tower_id} towers={towers} disabled={readOnly} onChange={v=>onUpdateEvent({destination_tower_id:v})}/>}
    <Text style={styles.subHeading}>What material?</Text>
    {e.items.map((item,i)=><MaterialItemEditor key={item.ui_id} item={item} readOnly={readOnly} onChange={p=>onUpdateItem(i,p)} onSearch={q=>onSearchItem(i,q)} onChoose={x=>onChooseItem(i,x)} onRemove={()=>onRemoveItem(i)}/>)}
    {!readOnly&&<Pressable style={styles.linkButton} onPress={onAddItem}><Text style={styles.linkButtonText}>+ Add another item</Text></Pressable>}
    <Choice label="Did this affect the work?" value={e.affected_work?"yes":"no"} options={[["no","No"],["yes","Yes"]]} onChange={v=>onUpdateEvent({affected_work:v==="yes"})} disabled={readOnly}/>
    {e.affected_work&&<>
      <SelectButtons label="What were you trying to do?" value={e.affected_activity} options={[{value:"Assembly",label:"Assembly"},{value:"Erection",label:"Erection"},{value:"Bolting",label:"Bolting"},{value:"Fit-off",label:"Fit-off"},{value:"Other",label:"Other"}]} onChange={v=>onUpdateEvent({affected_activity:v})} disabled={readOnly}/>
      <SelectButtons label="What section?" value={e.affected_section} options={progressRows.map(r=>({value:r.section_label,label:r.section_label}))} onChange={v=>onUpdateEvent({affected_section:v})} disabled={readOnly}/>
      <SelectButtons label="What happened to planned work?" value={e.work_outcome} options={[{value:"stopped_work",label:"Couldn't continue"},{value:"slowed_down",label:"Slowed down"},{value:"changed_sequence",label:"Changed sequence"},{value:"minor_impact",label:"Minor impact"}]} onChange={v=>onUpdateEvent({work_outcome:v as MaterialWorkOutcome,impact_start_time:v==="changed_sequence"?"":e.impact_start_time,impact_finish_time:v==="changed_sequence"?"":e.impact_finish_time,impact_ongoing:v==="changed_sequence"?false:e.impact_ongoing})} disabled={readOnly}/>
      {e.work_outcome!=="changed_sequence"?<><View style={styles.twoColumns}><TimeField label="Impact started" value={e.impact_start_time} onChangeText={v=>onUpdateEvent({impact_start_time:v})} onBlur={()=>onUpdateEvent({impact_start_time:normaliseTimeInput(e.impact_start_time)})} editable={!readOnly}/><TimeField label="Impact finished" value={e.impact_finish_time} onChangeText={v=>onUpdateEvent({impact_finish_time:v})} onBlur={()=>onUpdateEvent({impact_finish_time:normaliseTimeInput(e.impact_finish_time)})} editable={!readOnly&&!e.impact_ongoing}/></View><Choice label="Still affecting work?" value={e.impact_ongoing?"yes":"no"} options={[["no","No"],["yes","Yes"]]} onChange={v=>onUpdateEvent({impact_ongoing:v==="yes",impact_finish_time:v==="yes"?"":e.impact_finish_time})} disabled={readOnly}/></>:<View style={styles.infoBoxBlue}><Text style={styles.infoBoxBlueText}>Resequenced work does not need an artificial delay start / finish.</Text></View>}
      <Text style={styles.subHeading}>Who spent time searching / checking?</Text>
      <WorkerSearchSelector
        workers={labourWorkers}
        selectedNames={e.people.map(person=>person.employee_name)}
        disabled={readOnly}
        onToggle={onToggleWorker}
      />
      {e.people.map((p,i)=><View key={p.ui_id} style={styles.timeDetailRow}><Text style={styles.timeDetailName}>{p.employee_name}</Text><View style={styles.workerTimeRow}><TimeMiniInput label="Start" value={p.started_at} onChange={v=>onUpdatePerson(i,{started_at:v})} onBlur={()=>onUpdatePerson(i,{started_at:normaliseTimeInput(p.started_at)})} editable={!readOnly}/><TimeMiniInput label="Finish" value={p.finished_at} onChange={v=>onUpdatePerson(i,{finished_at:v})} onBlur={()=>onUpdatePerson(i,{finished_at:normaliseTimeInput(p.finished_at)})} editable={!readOnly}/><MiniStat label="Hrs" value={durationHours(p.started_at,p.finished_at).toFixed(2)}/></View></View>)}
      <Text style={styles.subHeading}>Was any plant tied up?</Text><View style={styles.chipGrid}>{plantRows.map((r,i)=>{const name=plantDisplay(r),s=e.plant.some(p=>normaliseName(p.plant_name)===normaliseName(name));return <Pressable key={`${name}-${i}`} disabled={readOnly} onPress={()=>onTogglePlant(r)} style={[styles.chip,s&&styles.chipActivePurple]}><Text style={[styles.chipText,s&&styles.chipTextActive]}>{s?"✓ ":"+ "}{name}</Text></Pressable>})}</View>
      {e.plant.map((p,i)=><View key={p.ui_id} style={styles.timeDetailRow}><Text style={styles.timeDetailName}>{p.plant_name}</Text><View style={styles.workerTimeRow}><TimeMiniInput label="Start" value={p.started_at} onChange={v=>onUpdatePlant(i,{started_at:v})} onBlur={()=>onUpdatePlant(i,{started_at:normaliseTimeInput(p.started_at)})} editable={!readOnly}/><TimeMiniInput label="Finish" value={p.finished_at} onChange={v=>onUpdatePlant(i,{finished_at:v})} onBlur={()=>onUpdatePlant(i,{finished_at:normaliseTimeInput(p.finished_at)})} editable={!readOnly}/><MiniStat label="Hrs" value={durationHours(p.started_at,p.finished_at).toFixed(2)}/></View></View>)}
      <Text style={styles.subHeading}>What did you do instead?</Text><View style={styles.chipGrid}>{MITIGATION_OPTIONS.map(a=>{const s=e.mitigation_actions.includes(a);return <Pressable key={a} disabled={readOnly} onPress={()=>onToggleMitigation(a)} style={[styles.chip,s&&styles.chipActiveGreen]}><Text style={[styles.chipText,s&&styles.chipTextActive]}>{s?"✓ ":""}{a}</Text></Pressable>})}</View>
      <SelectButtons label="What is happening now?" value={e.current_effect} options={[{value:"Waiting for material",label:"Waiting for material"},{value:"Erection stopped",label:"Erection stopped"},{value:"Working on another section",label:"Working elsewhere"},{value:"Resolved",label:"Resolved"},{value:"Unknown / awaiting confirmation",label:"Unknown"}]} onChange={v=>onUpdateEvent({current_effect:v})} disabled={readOnly}/>
    </>}
    <TextArea label="Extra notes" value={e.notes} onChangeText={v=>onUpdateEvent({notes:v})} editable={!readOnly}/>
  </View>;
}

function ExcessMaterialCard(props:{event:MaterialEventDraft;towers:Tower[];readOnly:boolean;onRemove:()=>void;onUpdateEvent:(p:Partial<MaterialEventDraft>)=>void;onUpdateItem:(i:number,p:Partial<MaterialEventItemDraft>)=>void;onAddItem:()=>void;onRemoveItem:(i:number)=>void;onSearchItem:(i:number,q:string)=>void;onChooseItem:(i:number,item:MaterialCatalogItem)=>void;}){
  const {event:e,towers,readOnly,onRemove,onUpdateEvent,onUpdateItem,onAddItem,onRemoveItem,onSearchItem,onChooseItem}=props;
  return <View style={styles.excessCard}><View style={styles.rowHeader}><Text style={styles.excessCardTitle}>Excess material record</Text>{!readOnly&&<Pressable onPress={onRemove}><Ionicons name="trash-outline" size={17} color="#BE123C"/></Pressable>}</View>
    {e.items.map((item,i)=><MaterialItemEditor key={item.ui_id} item={item} readOnly={readOnly} tone="green" onChange={p=>onUpdateItem(i,p)} onSearch={q=>onSearchItem(i,q)} onChoose={x=>onChooseItem(i,x)} onRemove={()=>onRemoveItem(i)}/>)}
    {!readOnly&&<Pressable style={styles.linkButton} onPress={onAddItem}><Text style={[styles.linkButtonText,{color:"#166534"}]}>+ Add another excess item</Text></Pressable>}
    <SelectButtons label="Where is the excess now?" value={e.destination_location} options={[{value:"",label:"Current tower"},{value:"laydown",label:"Laydown"},{value:"other_tower",label:"Another tower"},{value:"other",label:"Other"}]} onChange={v=>onUpdateEvent({destination_location:v,destination_tower_id:v==="other_tower"?e.destination_tower_id:""})} disabled={readOnly}/>
    {e.destination_location==="other_tower"&&<TowerChoice label="Destination tower" value={e.destination_tower_id} towers={towers} disabled={readOnly} onChange={v=>onUpdateEvent({destination_tower_id:v})}/>}
    <TextArea label="Notes" value={e.notes} onChangeText={v=>onUpdateEvent({notes:v})} editable={!readOnly}/>
  </View>;
}

function MaterialItemEditor(props:{item:MaterialEventItemDraft;readOnly:boolean;onChange:(p:Partial<MaterialEventItemDraft>)=>void;onSearch:(q:string)=>void;onChoose:(i:MaterialCatalogItem)=>void;onRemove:()=>void;tone?:"amber"|"green";}){
  const {item,readOnly,onChange,onSearch,onChoose,onRemove,tone="amber"}=props;

  return <View style={[styles.materialItemCard,tone==="green"&&styles.materialItemCardGreen]}>
    <View style={styles.rowHeader}>
      <Text style={styles.rowTitle}>
        {item.material_kind==="registered"
          ?"Search member / bundle"
          :item.material_kind==="manual_bolt"
          ?"Manual bolt"
          :"Unlisted material"}
      </Text>
      {!readOnly&&<Pressable onPress={onRemove}><Ionicons name="close-circle-outline" size={18} color="#64748B"/></Pressable>}
    </View>

    {item.material_kind==="registered"?<>
      <TextInput
        value={item.search_query}
        onChangeText={onSearch}
        editable={!readOnly}
        style={[styles.input,readOnly&&styles.inputDisabled]}
        placeholder="M1278, 23-04..."
        placeholderTextColor="#94A3B8"
      />
      {item.search_loading&&<View style={styles.searchResultLoading}><ActivityIndicator size="small" color="#2563EB"/><Text style={styles.searchResultLoadingText}>Searching…</Text></View>}
      {!item.search_loading&&item.search_results.length>0&&<View style={styles.searchResults}>
        {item.search_results.slice(0,12).map(row=>
          <Pressable key={`${row.source_table}:${row.source_record_id}`} onPress={()=>onChoose(row)} style={styles.searchResult}>
            <Text style={styles.searchResultTitle}>{row.item_reference}</Text>
            {row.item_description?<Text style={styles.searchResultMeta}>{row.item_description}</Text>:null}
          </Pressable>
        )}
      </View>}
      {item.item_reference?<View style={styles.selectedMaterial}>
        <Text style={styles.selectedMaterialLabel}>Selected</Text>
        <Text style={styles.selectedMaterialValue}>{item.item_reference}</Text>
        {item.item_description?<Text style={styles.selectedMaterialMeta}>{item.item_description}</Text>:null}
      </View>:null}

      {!readOnly&&<View style={styles.inlineLinks}>
        <Pressable
          style={styles.linkButton}
          onPress={()=>onChange({
            material_kind:"manual_bolt",
            manual_category:"",
            bolt_size:"",
            search_query:"",
            search_results:[],
            source_table:"",
            source_record_id:"",
            item_reference:"",
            item_description:"",
            unit:"ea"
          })}
        >
          <Text style={styles.linkButtonText}>+ Enter bolt manually</Text>
        </Pressable>
        <Pressable
          style={styles.linkButton}
          onPress={()=>onChange({
            material_kind:"manual",
            manual_category:"",
            bolt_size:"",
            search_query:"",
            search_results:[],
            source_table:"",
            source_record_id:"",
            item_reference:"",
            item_description:"",
            unit:"ea"
          })}
        >
          <Text style={styles.linkButtonText}>+ Other unlisted item</Text>
        </Pressable>
      </View>}
    </>:item.material_kind==="manual_bolt"?<>
      <Field
        label="Bolt Size"
        value={item.bolt_size}
        onChangeText={v=>onChange({bolt_size:v})}
        editable={!readOnly}
        placeholder="e.g. M16 x 45"
      />
      <TextArea
        label="Description / Notes"
        value={item.item_description}
        onChangeText={v=>onChange({item_description:v})}
        editable={!readOnly}
      />
      {!readOnly&&<Pressable style={styles.linkButton} onPress={()=>onChange({material_kind:"registered",bolt_size:"",item_reference:"",item_description:"",search_query:""})}>
        <Text style={styles.linkButtonText}>Search registered steel / bundle</Text>
      </Pressable>}
    </>:<>
      <View style={styles.twoColumns}>
        <SmallField label="Item type" value={item.manual_category} onChangeText={v=>onChange({manual_category:v})} editable={!readOnly} keyboard="default"/>
        <SmallField label="Item" value={item.item_reference} onChangeText={v=>onChange({item_reference:v})} editable={!readOnly} keyboard="default"/>
      </View>
      {!readOnly&&<Pressable style={styles.linkButton} onPress={()=>onChange({material_kind:"registered",manual_category:"",bolt_size:"",item_reference:"",item_description:"",search_query:""})}>
        <Text style={styles.linkButtonText}>Search registered steel / bundle</Text>
      </Pressable>}
    </>}

    <View style={styles.twoColumns}>
      <SmallField label="Qty" value={item.quantity} onChangeText={v=>onChange({quantity:v})} editable={!readOnly}/>
      <SmallField label="Unit" value={item.material_kind==="manual_bolt"?"ea":item.unit} onChangeText={v=>onChange({unit:v})} editable={!readOnly&&item.material_kind!=="manual_bolt"} keyboard="default"/>
    </View>
  </View>;
}

function TowerPicker({visible,towers,search,onSearch,onClose,onSelect}:{visible:boolean;towers:Tower[];search:string;onSearch:(v:string)=>void;onClose:()=>void;onSelect:(t:Tower)=>void;}){
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}><SafeAreaView style={styles.safeArea}><View style={styles.modalHeader}><Pressable style={styles.backButton} onPress={onClose}><Ionicons name="close" size={22} color="#334155"/></Pressable><View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>Select Tower</Text></View><View style={styles.modalSpacer}/></View><View style={styles.pickerContent}><View style={styles.searchBox}><Ionicons name="search" size={18} color="#64748B"/><TextInput value={search} onChangeText={onSearch} style={styles.searchInput} placeholder="Search towers…" placeholderTextColor="#94A3B8"/></View><FlatList data={towers} keyExtractor={i=>i.id} contentContainerStyle={styles.towerList} renderItem={({item})=><Pressable style={styles.towerOption} onPress={()=>onSelect(item)}><View style={styles.towerOptionText}><Text style={styles.towerOptionTitle}>{towerLabel(item)}</Text><Text style={styles.towerOptionMeta}>{item.status||"Not Started"} · {toNumber(item.progress)}%</Text></View><Ionicons name="chevron-forward" size={18} color="#94A3B8"/></Pressable>}/></View></SafeAreaView></Modal>;
}
function TowerChoice({label,value,towers,onChange,disabled}:{label:string;value:string;towers:Tower[];onChange:(v:string)=>void;disabled:boolean;}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState("");
  const selected=towers.find(t=>t.id===value)??null;
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return towers.slice(0,20);
    return towers.filter(t=>towerLabel(t).toLowerCase().includes(q)).slice(0,40);
  },[query,towers]);

  return <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Pressable
      disabled={disabled}
      onPress={()=>setOpen(true)}
      style={[styles.searchSelectButton,disabled&&styles.inputDisabled]}
    >
      <Ionicons name="search" size={17} color="#64748B"/>
      <Text style={styles.searchSelectValue}>{selected?towerLabel(selected):"Search tower..."}</Text>
      <Ionicons name="chevron-forward" size={17} color="#94A3B8"/>
    </Pressable>

    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={()=>setOpen(false)}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.modalHeader}>
          <Pressable style={styles.backButton} onPress={()=>setOpen(false)}><Ionicons name="close" size={22} color="#334155"/></Pressable>
          <View style={styles.modalTitleWrap}><Text style={styles.modalTitle}>{label}</Text></View>
          <View style={styles.modalSpacer}/>
        </View>
        <View style={styles.pickerContent}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#64748B"/>
            <TextInput
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholder="Search tower..."
              placeholderTextColor="#94A3B8"
              autoFocus
            />
          </View>
          <FlatList
            data={visible}
            keyboardShouldPersistTaps="handled"
            keyExtractor={item=>item.id}
            renderItem={({item})=>
              <Pressable
                style={[styles.towerOption,item.id===value&&styles.towerOptionSelected]}
                onPress={()=>{onChange(item.id);setOpen(false);setQuery("");}}
              >
                <View style={styles.towerOptionText}>
                  <Text style={styles.towerOptionTitle}>{towerLabel(item)}</Text>
                  <Text style={styles.towerOptionMeta}>{item.status||"Not Started"} · {toNumber(item.progress)}%</Text>
                </View>
                {item.id===value?<Ionicons name="checkmark-circle" size={20} color="#2563EB"/>:<Ionicons name="chevron-forward" size={18} color="#94A3B8"/>}
              </Pressable>
            }
          />
        </View>
      </SafeAreaView>
    </Modal>
  </View>;
}

function WorkerSearchSelector({workers,selectedNames,disabled,onToggle}:{workers:{id:string;name:string;role:string}[];selectedNames:string[];disabled:boolean;onToggle:(worker:{id:string;name:string;role:string})=>void;}){
  const [query,setQuery]=useState("");
  const selectedSet=useMemo(()=>new Set(selectedNames.map(normaliseName)),[selectedNames]);
  const visible=useMemo(()=>{
    const q=query.trim().toLowerCase();
    if(!q)return [];
    return workers
      .filter(worker=>`${worker.name} ${worker.role}`.toLowerCase().includes(q))
      .slice(0,8);
  },[query,workers]);

  const selectedWorkers=workers.filter(worker=>selectedSet.has(normaliseName(worker.name)));

  return <View style={styles.field}>
    {selectedWorkers.length>0&&<View style={styles.chipGrid}>
      {selectedWorkers.map(worker=>
        <Pressable
          key={worker.id}
          disabled={disabled}
          onPress={()=>onToggle(worker)}
          style={[styles.chip,styles.chipActiveBlue]}
        >
          <Text style={[styles.chipText,styles.chipTextActive]}>✓ {worker.name}</Text>
        </Pressable>
      )}
    </View>}

    {!disabled&&<>
      <View style={styles.searchBoxCompact}>
        <Ionicons name="search" size={17} color="#64748B"/>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Search workers on this docket..."
          placeholderTextColor="#94A3B8"
        />
      </View>
      {query.trim()!==""&&<View style={styles.workerSearchResults}>
        {visible.length===0
          ?<Text style={styles.searchEmptyText}>No worker on this docket matched.</Text>
          :visible.map(worker=>{
              const selected=selectedSet.has(normaliseName(worker.name));
              return <Pressable
                key={worker.id}
                onPress={()=>{onToggle(worker);setQuery("");}}
                style={styles.workerSearchResult}
              >
                <View style={{flex:1}}>
                  <Text style={styles.searchResultTitle}>{worker.name}</Text>
                  {worker.role?<Text style={styles.searchResultMeta}>{worker.role}</Text>:null}
                </View>
                <Ionicons name={selected?"checkmark-circle":"add-circle-outline"} size={20} color={selected?"#2563EB":"#64748B"}/>
              </Pressable>;
            })}
      </View>}
    </>}
  </View>;
}
function CollapsibleSection({title,open,onToggle,badge,children,tone="slate"}:{title:string;open:boolean;onToggle:()=>void;badge?:string;children:React.ReactNode;tone?:"slate"|"amber"|"green"|"blue";}){return <View style={[styles.section,tone==="amber"&&styles.sectionAmber,tone==="green"&&styles.sectionGreen,tone==="blue"&&styles.sectionBlue]}><Pressable style={styles.sectionHeader} onPress={onToggle}><Text style={styles.sectionTitle}>{title}</Text>{badge&&<View style={styles.sectionBadge}><Text style={styles.sectionBadgeText}>{badge}</Text></View>}<Ionicons name={open?"chevron-up":"chevron-down"} size={19} color="#64748B"/></Pressable>{open&&<View style={styles.sectionBody}>{children}</View>}</View>;}
function Field({label,value,onChangeText,editable=true,placeholder}:{label:string;value:string;onChangeText:(v:string)=>void;editable?:boolean;placeholder?:string;}){return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.input,!editable&&styles.inputDisabled]} editable={editable} placeholder={placeholder||label} placeholderTextColor="#94A3B8"/></View>;}
function FieldCompact({label,value}:{label:string;value:string;}){return <View style={styles.smallField}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.readOnlyField}><Text style={styles.readOnlyFieldText}>{value||"—"}</Text></View></View>;}
function SmallField({label,value,onChangeText,editable=true,keyboard="decimal-pad"}:{label:string;value:string;onChangeText:(v:string)=>void;editable?:boolean;keyboard?:"decimal-pad"|"default";}){return <View style={styles.smallField}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.input,!editable&&styles.inputDisabled]} editable={editable} keyboardType={keyboard}/></View>;}
function TimeField({label,value,onChangeText,onBlur,editable}:{label:string;value:string;onChangeText:(v:string)=>void;onBlur:()=>void;editable:boolean;}){return <View style={styles.smallField}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} onBlur={onBlur} editable={editable} keyboardType={Platform.OS==="ios"?"numbers-and-punctuation":"numeric"} placeholder="06:00" placeholderTextColor="#94A3B8" style={[styles.input,!editable&&styles.inputDisabled]}/></View>;}
function TextArea({label,value,onChangeText,editable=true}:{label:string;value:string;onChangeText:(v:string)=>void;editable?:boolean;}){return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.textArea,!editable&&styles.inputDisabled]} editable={editable} multiline textAlignVertical="top"/></View>;}
function Choice({label,value,options,onChange,disabled=false}:{label:string;value:string;options:[string,string][];onChange:(v:string)=>void;disabled?:boolean;}){return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.choiceGrid}>{options.map(([v,l])=><Pressable key={v} style={[styles.choiceButton,value===v&&styles.choiceActive,disabled&&styles.disabled]} disabled={disabled} onPress={()=>onChange(v)}><Text style={[styles.choiceText,value===v&&styles.choiceTextActive]}>{l}</Text></Pressable>)}</View></View>;}
function SelectButtons({label,value,options,onChange,disabled=false}:{label:string;value:string;options:{value:string;label:string}[];onChange:(v:string)=>void;disabled?:boolean;}){return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.selectRow}>{options.map(o=><Pressable key={o.value} style={[styles.selectButton,value===o.value&&styles.selectActive,disabled&&styles.disabled]} disabled={disabled} onPress={()=>onChange(o.value)}><Text style={[styles.selectText,value===o.value&&styles.selectTextActive]}>{o.label}</Text></Pressable>)}</ScrollView></View>;}
function CompactPercent({label,value,onChange,editable}:{label:string;value:string;onChange:(v:string)=>void;editable:boolean;}){return <View style={styles.compactPercent}><Text style={styles.compactPercentLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} editable={editable} keyboardType="number-pad" style={[styles.compactPercentInput,!editable&&styles.inputDisabled]} placeholder="0" placeholderTextColor="#94A3B8"/><Text style={styles.percentSymbol}>%</Text></View>;}
function TimeMiniInput({label,value,onChange,onBlur,editable}:{label:string;value:string;onChange:(v:string)=>void;onBlur:()=>void;editable:boolean;}){return <View style={styles.miniField}><Text style={styles.miniLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} onBlur={onBlur} editable={editable} keyboardType={Platform.OS==="ios"?"numbers-and-punctuation":"numeric"} placeholder="06:00" placeholderTextColor="#94A3B8" style={[styles.miniInput,!editable&&styles.inputDisabled]}/></View>;}
function MiniStat({label,value,tone="slate"}:{label:string;value:string;tone?:"slate"|"green";}){return <View style={[styles.miniStat,tone==="green"&&styles.miniStatGreen]}><Text style={styles.miniLabel}>{label}</Text><Text style={[styles.miniStatValue,tone==="green"&&styles.miniStatValueGreen]}>{value||"0.00"}</Text></View>;}
function ChipSelector({label,values,selected,disabled,onToggle}:{label:string;values:string[];selected:string[];disabled:boolean;onToggle:(v:string)=>void;}){return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><View style={styles.chipGrid}>{values.map(v=>{const a=selected.some(x=>normaliseName(x)===normaliseName(v));return <Pressable key={v} style={[styles.chip,a&&styles.chipActive,disabled&&styles.disabled]} disabled={disabled} onPress={()=>onToggle(v)}><Text style={[styles.chipText,a&&styles.chipTextActive]}>{v}</Text></Pressable>})}</View></View>;}
function Metric({label,value}:{label:string;value:string;}){return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;}
function Summary({label,value}:{label:string;value:string;}){return <View style={styles.summaryCard}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;}
function Kpi({label,value}:{label:string;value:string;}){return <View style={styles.kpi}><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiValue}>{value}</Text></View>;}
function StatusPill({label}:{label:string;}){const v=label.toLowerCase(),st=v==="closed"?styles.statusClosed:v.includes("submitted")||v.includes("signed")?styles.statusSubmitted:styles.statusDraft;return <View style={[styles.statusPill,st]}><Text style={styles.statusText}>{label}</Text></View>;}
function InfoPill({label,tone}:{label:string;tone:"amber"|"green";}){return <View style={[styles.infoPill,tone==="amber"?styles.infoPillAmber:styles.infoPillGreen]}><Text style={[styles.infoPillText,tone==="amber"?styles.infoPillTextAmber:styles.infoPillTextGreen]}>{label}</Text></View>;}
function ActionButton({icon,label,primary=false,onPress}:{icon:keyof typeof Ionicons.glyphMap;label:string;primary?:boolean;onPress:()=>void;}){return <Pressable style={[styles.actionButton,primary&&styles.actionPrimary]} onPress={onPress}><Ionicons name={icon} size={17} color={primary?"#FFF":"#334155"}/><Text style={[styles.actionText,primary&&styles.actionTextPrimary]}>{label}</Text></Pressable>;}
function Empty({title,text}:{title:string;text:string;}){return <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="document-text-outline" size={29} color="#64748B"/></View><Text style={styles.emptyTitle}>{title}</Text><Text style={styles.emptyText}>{text}</Text></View>;}

const styles=StyleSheet.create({
  safeArea:{flex:1,backgroundColor:"#F8FAFC"},screen:{flex:1,backgroundColor:"#F8FAFC"},loading:{flex:1,alignItems:"center",justifyContent:"center"},loadingText:{color:"#64748B",fontSize:12,fontWeight:"700",marginTop:10},
  header:{backgroundColor:"#FFF",borderBottomWidth:1,borderBottomColor:"#E2E8F0",padding:12},headerRow:{flexDirection:"row",alignItems:"center"},headerText:{flex:1},title:{color:"#0F172A",fontSize:21,fontWeight:"900"},subtitle:{color:"#64748B",fontSize:11,marginTop:3},
  addButton:{width:40,height:40,borderRadius:12,backgroundColor:"#0F172A",alignItems:"center",justifyContent:"center",marginRight:7},refreshButton:{width:40,height:40,borderRadius:12,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#FFF",alignItems:"center",justifyContent:"center"},
  listContent:{padding:12,paddingBottom:100},towerSelector:{minHeight:60,borderRadius:15,borderWidth:1,borderColor:"#BFDBFE",backgroundColor:"#EFF6FF",flexDirection:"row",alignItems:"center",padding:12,marginBottom:10},towerText:{flex:1},towerLabel:{color:"#64748B",fontSize:8,fontWeight:"900"},towerValue:{color:"#0F172A",fontSize:13,fontWeight:"900",marginTop:3},
  summaryGrid:{flexDirection:"row",flexWrap:"wrap",gap:7,marginBottom:10},summaryCard:{width:"48%",minHeight:60,borderRadius:14,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#FFF",padding:10},summaryLabel:{color:"#64748B",fontSize:8,fontWeight:"900",textTransform:"uppercase"},summaryValue:{color:"#0F172A",fontSize:18,fontWeight:"900",marginTop:4},
  searchBox:{minHeight:44,flexDirection:"row",alignItems:"center",borderRadius:13,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",paddingHorizontal:11,marginBottom:10},searchInput:{flex:1,color:"#0F172A",fontSize:13,marginLeft:8},
  searchBoxCompact:{minHeight:44,flexDirection:"row",alignItems:"center",borderRadius:12,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",paddingHorizontal:10,marginBottom:6},
  searchSelectButton:{minHeight:46,borderRadius:12,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",flexDirection:"row",alignItems:"center",paddingHorizontal:11},
  searchSelectValue:{flex:1,color:"#0F172A",fontSize:12,fontWeight:"800",marginHorizontal:8},
  towerOptionSelected:{borderColor:"#93C5FD",backgroundColor:"#EFF6FF"},
  workerSearchResults:{borderRadius:12,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",overflow:"hidden",marginBottom:8},
  workerSearchResult:{minHeight:48,flexDirection:"row",alignItems:"center",paddingHorizontal:11,paddingVertical:8,borderBottomWidth:1,borderBottomColor:"#F1F5F9"},
  searchEmptyText:{color:"#64748B",fontSize:10,padding:11},
  inlineLinks:{flexDirection:"row",flexWrap:"wrap",gap:10,alignItems:"center"},
  docketCard:{borderRadius:16,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#FFF",padding:12,marginBottom:9},docketTop:{flexDirection:"row",alignItems:"flex-start"},docketText:{flex:1,marginRight:8},docketDate:{color:"#0F172A",fontSize:14,fontWeight:"900"},docketMeta:{color:"#64748B",fontSize:10,marginTop:4},
  cardPills:{flexDirection:"row",flexWrap:"wrap",gap:6,marginTop:8},infoPill:{borderRadius:999,paddingHorizontal:9,paddingVertical:5,borderWidth:1},infoPillAmber:{backgroundColor:"#FFFBEB",borderColor:"#FCD34D"},infoPillGreen:{backgroundColor:"#F0FDF4",borderColor:"#86EFAC"},infoPillText:{fontSize:8,fontWeight:"900"},infoPillTextAmber:{color:"#92400E"},infoPillTextGreen:{color:"#166534"},
  progressLine:{marginTop:10},progressTextRow:{flexDirection:"row",justifyContent:"space-between"},progressLabel:{color:"#475569",fontSize:9,fontWeight:"900"},progressValue:{color:"#0F172A",fontSize:11,fontWeight:"900"},progressTrack:{height:8,borderRadius:999,backgroundColor:"#E2E8F0",overflow:"hidden",marginTop:6},progressFill:{height:"100%",borderRadius:999,backgroundColor:"#2563EB"},
  metricRow:{flexDirection:"row",gap:7,marginTop:10},metric:{flex:1,minHeight:48,borderRadius:11,backgroundColor:"#F1F5F9",padding:8},metricLabel:{color:"#64748B",fontSize:7,fontWeight:"900",textTransform:"uppercase"},metricValue:{color:"#0F172A",fontSize:11,fontWeight:"900",marginTop:4},
  cardActions:{flexDirection:"row",gap:7,marginTop:10},actionButton:{flex:1,minHeight:42,borderRadius:11,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",flexDirection:"row",alignItems:"center",justifyContent:"center"},actionPrimary:{backgroundColor:"#2563EB",borderColor:"#2563EB"},actionText:{color:"#334155",fontSize:10,fontWeight:"900",marginLeft:6},actionTextPrimary:{color:"#FFF"},deleteButton:{width:42,height:42,borderRadius:11,borderWidth:1,borderColor:"#FECDD3",backgroundColor:"#FFF1F2",alignItems:"center",justifyContent:"center"},
  modalHeader:{minHeight:58,flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderBottomColor:"#E2E8F0",backgroundColor:"#FFF",paddingHorizontal:12},backButton:{width:40,height:40,borderRadius:12,backgroundColor:"#F1F5F9",alignItems:"center",justifyContent:"center"},modalTitleWrap:{flex:1,marginHorizontal:8},modalTitle:{color:"#0F172A",fontSize:17,fontWeight:"900",textAlign:"center"},modalSubtitle:{color:"#64748B",fontSize:9,textAlign:"center",marginTop:2},modalSpacer:{width:40},headerSave:{width:40,height:40,borderRadius:12,backgroundColor:"#0F172A",alignItems:"center",justifyContent:"center"},
  editorContent:{padding:12,paddingBottom:60},prefillButton:{minHeight:46,borderRadius:13,backgroundColor:"#334155",flexDirection:"row",alignItems:"center",justifyContent:"center",marginBottom:10},prefillText:{color:"#FFF",fontSize:11,fontWeight:"900",marginLeft:7},quickSummary:{flexDirection:"row",gap:7,marginBottom:10},kpi:{flex:1,minHeight:58,borderRadius:12,backgroundColor:"#F1F5F9",padding:9},kpiLabel:{color:"#64748B",fontSize:7,fontWeight:"900",textTransform:"uppercase"},kpiValue:{color:"#0F172A",fontSize:13,fontWeight:"900",marginTop:5},
  section:{borderRadius:16,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#FFF",marginBottom:9,overflow:"hidden"},sectionAmber:{borderColor:"#FCD34D"},sectionGreen:{borderColor:"#86EFAC"},sectionBlue:{borderColor:"#93C5FD"},sectionHeader:{minHeight:52,flexDirection:"row",alignItems:"center",paddingHorizontal:13},sectionTitle:{flex:1,color:"#0F172A",fontSize:14,fontWeight:"900"},sectionBadge:{borderRadius:999,backgroundColor:"#E2E8F0",paddingHorizontal:8,paddingVertical:4,marginRight:8},sectionBadgeText:{color:"#334155",fontSize:8,fontWeight:"900"},sectionBody:{borderTopWidth:1,borderTopColor:"#E2E8F0",padding:12},
  helperText:{color:"#64748B",fontSize:10,lineHeight:15,marginBottom:10},subHeading:{color:"#0F172A",fontSize:11,fontWeight:"900",marginTop:6,marginBottom:7},field:{marginBottom:10},smallField:{flex:1},fieldLabel:{color:"#475569",fontSize:10,fontWeight:"800",marginBottom:5},input:{minHeight:44,borderRadius:12,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",color:"#0F172A",fontSize:13,paddingHorizontal:11},inputDisabled:{backgroundColor:"#F1F5F9",color:"#64748B"},readOnlyField:{minHeight:44,borderRadius:12,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#F8FAFC",justifyContent:"center",paddingHorizontal:11},readOnlyFieldText:{color:"#334155",fontSize:12,fontWeight:"700"},textArea:{minHeight:84,borderRadius:12,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",color:"#0F172A",fontSize:12,padding:11},twoColumns:{flexDirection:"row",gap:8,marginBottom:10},
  choiceGrid:{flexDirection:"row",gap:7},choiceButton:{flex:1,minHeight:40,borderRadius:11,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",alignItems:"center",justifyContent:"center",paddingHorizontal:7},choiceActive:{backgroundColor:"#0F172A",borderColor:"#0F172A"},choiceText:{color:"#475569",fontSize:9,fontWeight:"900",textAlign:"center"},choiceTextActive:{color:"#FFF"},selectRow:{gap:6},selectButton:{minHeight:38,borderRadius:999,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",alignItems:"center",justifyContent:"center",paddingHorizontal:12},selectActive:{backgroundColor:"#0F172A",borderColor:"#0F172A"},selectText:{color:"#475569",fontSize:9,fontWeight:"800"},selectTextActive:{color:"#FFF"},
  compactProgressRow:{flexDirection:"row",alignItems:"center",minHeight:52,borderBottomWidth:1,borderBottomColor:"#F1F5F9"},compactProgressLabel:{flex:1,color:"#334155",fontSize:11,fontWeight:"800"},compactPercent:{width:84,flexDirection:"row",alignItems:"center",marginLeft:6},compactPercentLabel:{width:16,color:"#64748B",fontSize:9,fontWeight:"900"},compactPercentInput:{flex:1,height:38,borderRadius:10,borderWidth:1,borderColor:"#CBD5E1",color:"#0F172A",textAlign:"center",fontSize:12,fontWeight:"900"},percentSymbol:{color:"#64748B",fontSize:10,marginLeft:3},
  bulkCompact:{flexDirection:"row",gap:8,alignItems:"flex-end",marginBottom:10},applyButton:{minHeight:44,borderRadius:11,backgroundColor:"#334155",alignItems:"center",justifyContent:"center",paddingHorizontal:15},applyButtonText:{color:"#FFF",fontSize:10,fontWeight:"900"},workerRow:{borderRadius:13,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#FFF",padding:9,marginBottom:8},workerTopRow:{flexDirection:"row",alignItems:"center",marginBottom:8},workerNameInput:{flex:1,minHeight:42,borderRadius:11,borderWidth:1,borderColor:"#CBD5E1",paddingHorizontal:10,color:"#0F172A",fontSize:12,fontWeight:"800"},iconDelete:{width:36,height:36,alignItems:"center",justifyContent:"center",marginLeft:6},workerTimeRow:{flexDirection:"row",gap:6},miniField:{flex:1},miniLabel:{color:"#64748B",fontSize:8,fontWeight:"900",marginBottom:4},miniInput:{minHeight:40,borderRadius:10,borderWidth:1,borderColor:"#CBD5E1",color:"#0F172A",fontSize:11,textAlign:"center"},miniStat:{flex:1,minHeight:40,borderRadius:10,backgroundColor:"#F8FAFC",borderWidth:1,borderColor:"#CBD5E1",padding:6},miniStatGreen:{backgroundColor:"#F0FDF4",borderColor:"#86EFAC"},miniStatValue:{color:"#334155",fontSize:11,fontWeight:"900",textAlign:"center",marginTop:2},miniStatValueGreen:{color:"#166534"},
  secondaryButton:{minHeight:44,borderRadius:11,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#F8FAFC",flexDirection:"row",alignItems:"center",justifyContent:"center",marginTop:4},secondaryButtonText:{color:"#0F172A",fontSize:10,fontWeight:"900",marginLeft:7},amberButton:{borderColor:"#FCD34D",backgroundColor:"#FFFBEB"},amberButtonText:{color:"#92400E"},greenButton:{borderColor:"#86EFAC",backgroundColor:"#F0FDF4"},greenButtonText:{color:"#166534"},
  delayCard:{borderRadius:13,borderWidth:1,borderColor:"#FCD34D",backgroundColor:"#FFFBEB",padding:10,marginBottom:9},plantCard:{borderRadius:13,borderWidth:1,borderColor:"#C4B5FD",backgroundColor:"#F5F3FF",padding:10,marginBottom:9},materialCard:{borderRadius:14,borderWidth:1,borderColor:"#FCD34D",backgroundColor:"#FFFBEB",padding:11,marginBottom:10},materialCardTitle:{flex:1,color:"#92400E",fontSize:12,fontWeight:"900"},excessCard:{borderRadius:14,borderWidth:1,borderColor:"#86EFAC",backgroundColor:"#F0FDF4",padding:11,marginBottom:10},excessCardTitle:{flex:1,color:"#166534",fontSize:12,fontWeight:"900"},materialItemCard:{borderRadius:12,borderWidth:1,borderColor:"#FDE68A",backgroundColor:"#FFF",padding:10,marginBottom:9},materialItemCardGreen:{borderColor:"#BBF7D0"},rowHeader:{flexDirection:"row",alignItems:"center",marginBottom:9},rowTitle:{flex:1,color:"#0F172A",fontSize:11,fontWeight:"900"},
  chipGrid:{flexDirection:"row",flexWrap:"wrap",gap:6,marginBottom:8},chip:{borderRadius:999,borderWidth:1,borderColor:"#CBD5E1",backgroundColor:"#FFF",paddingHorizontal:10,paddingVertical:7},chipActive:{backgroundColor:"#0F172A",borderColor:"#0F172A"},chipActiveBlue:{backgroundColor:"#2563EB",borderColor:"#2563EB"},chipActivePurple:{backgroundColor:"#7C3AED",borderColor:"#7C3AED"},chipActiveGreen:{backgroundColor:"#15803D",borderColor:"#15803D"},chipText:{color:"#475569",fontSize:9,fontWeight:"800"},chipTextActive:{color:"#FFF"},linkButton:{flexDirection:"row",alignItems:"center",alignSelf:"flex-start",paddingVertical:7,marginBottom:5},linkButtonText:{color:"#1D4ED8",fontSize:9,fontWeight:"900",marginLeft:5},
  searchResults:{marginTop:5,borderWidth:1,borderColor:"#CBD5E1",borderRadius:11,backgroundColor:"#FFF",overflow:"hidden"},searchResult:{paddingHorizontal:10,paddingVertical:9,borderBottomWidth:1,borderBottomColor:"#F1F5F9"},searchResultTitle:{color:"#0F172A",fontSize:11,fontWeight:"900"},searchResultMeta:{color:"#64748B",fontSize:9,lineHeight:13,marginTop:2},searchResultLoading:{flexDirection:"row",alignItems:"center",paddingVertical:8},searchResultLoadingText:{color:"#64748B",fontSize:9,marginLeft:7},selectedMaterial:{borderRadius:11,backgroundColor:"#F8FAFC",borderWidth:1,borderColor:"#E2E8F0",padding:9,marginTop:7},selectedMaterialLabel:{color:"#64748B",fontSize:7,fontWeight:"900",textTransform:"uppercase"},selectedMaterialValue:{color:"#0F172A",fontSize:12,fontWeight:"900",marginTop:3},selectedMaterialMeta:{color:"#64748B",fontSize:9,lineHeight:13,marginTop:2},
  timeDetailRow:{borderRadius:11,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#FFF",padding:8,marginBottom:7},timeDetailName:{color:"#0F172A",fontSize:10,fontWeight:"900",marginBottom:7},infoBoxBlue:{borderRadius:11,borderWidth:1,borderColor:"#BFDBFE",backgroundColor:"#EFF6FF",padding:10,marginBottom:10},infoBoxBlueText:{color:"#1E40AF",fontSize:9,lineHeight:14},
  saveButton:{minHeight:50,borderRadius:14,backgroundColor:"#2563EB",flexDirection:"row",alignItems:"center",justifyContent:"center"},saveText:{color:"#FFF",fontSize:12,fontWeight:"900",marginLeft:7},statusPill:{alignSelf:"flex-start",borderRadius:999,paddingHorizontal:8,paddingVertical:5},statusDraft:{backgroundColor:"#FEF3C7"},statusSubmitted:{backgroundColor:"#DBEAFE"},statusClosed:{backgroundColor:"#DCFCE7"},statusText:{color:"#334155",fontSize:8,fontWeight:"900"},
  pickerContent:{flex:1,padding:12},towerList:{paddingTop:10,paddingBottom:30},towerOption:{minHeight:58,borderRadius:14,borderWidth:1,borderColor:"#E2E8F0",backgroundColor:"#FFF",flexDirection:"row",alignItems:"center",padding:10,marginBottom:8},towerOptionText:{flex:1},towerOptionTitle:{color:"#0F172A",fontSize:12,fontWeight:"900"},towerOptionMeta:{color:"#64748B",fontSize:9,marginTop:3},disabled:{opacity:.45},empty:{alignItems:"center",justifyContent:"center",paddingVertical:50,paddingHorizontal:30},emptyIcon:{width:60,height:60,borderRadius:20,backgroundColor:"#E2E8F0",alignItems:"center",justifyContent:"center"},emptyTitle:{color:"#0F172A",fontSize:16,fontWeight:"900",marginTop:12},emptyText:{color:"#64748B",fontSize:12,lineHeight:18,textAlign:"center",marginTop:5},
});
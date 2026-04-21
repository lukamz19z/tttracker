"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type TowerRecord = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  extra_data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type ItcMode = "BC" | "Client";
type ItcValidation = "" | "Y" | "N" | "NA";

type ItcDocument = {
  id: string;
  tower_id: string;
  project_id?: string | null;
  title?: string | null;
  status?: string | null;
  revision?: string | null;
  structure_number?: string | null;
  structure_type?: string | null;
  structure_height?: number | string | null;
  structure_weight?: number | string | null;
  itc_mode?: ItcMode | null;
  subcontractor_name?: string | null;
  subcontractor_signed_at?: string | null;
  ugl_supervisor_name?: string | null;
  ugl_supervisor_signed_at?: string | null;
  project_engineer_name?: string | null;
  project_engineer_signed_at?: string | null;
  transgrid_rep_name?: string | null;
  transgrid_rep_signed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ItcItem = {
  id: string;
  itc_id: string;
  section_key: string;
  item_no: number;
  description: string;
  validation: ItcValidation;
  responsible_role: string | null;
  lh_name: string | null;
  lh_signature: string | null;
  checked_date: string | null;
  notes: string | null;
};

type TorqueRow = {
  id: string;
  itc_id: string;
  item_no: number | null;
  bolt_grade: string | null;
  bolt_dia: number | null;
  structural_washers: string | null;
  bolt_count: number | null;
  torque_achieved: string | null;
  remarks: string | null;
};

type ClientItcUpload = {
  id: string;
  tower_id: string;
  project_id?: string | null;
  title: string | null;
  revision: string | null;
  status: string | null;
  file_url: string | null;
  file_name: string | null;
  comments: string | null;
  created_at?: string | null;
};

type GenericRow = Record<string, unknown>;

type ChecklistSeedItem = {
  itemNo: number;
  description: string;
  role: string;
};

type ChecklistSection = {
  key: string;
  title: string;
  note?: string;
  items: ChecklistSeedItem[];
};

const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    key: "preparation",
    title: "1. Preparation",
    note: "Report all discrepancies and modifications in Non-Conformance Report and Structure Modification ITCs respectively.",
    items: [
      { itemNo: 1, description: "Check access and crane pad and assembly area suitability to work", role: "LH" },
      { itemNo: 2, description: "Crane Lift Study is in place", role: "LH" },
      { itemNo: 3, description: "DCP tests of crane pad are in order", role: "LH" },
      { itemNo: 4, description: "Lift Plan (Tower Sectioning) is in place", role: "LH" },
      { itemNo: 5, description: "Foundation suitability verification to erect tower", role: "LH" },
      { itemNo: 6, description: "Updated work packs available at site", role: "LH" },
      { itemNo: 7, description: "Correct assembly drawings are ensured", role: "LH" },
      { itemNo: 8, description: "All relevant permits (including access, safety and environment, TMP) are in place", role: "LH" },
      { itemNo: 9, description: "Weather check completed", role: "LH" },
      { itemNo: 10, description: "Communication systems working has been checked", role: "LH" },
      { itemNo: 11, description: "Test and tag are checked", role: "LH" },
      { itemNo: 12, description: "Area demarcation has been conducted", role: "LH" },
      { itemNo: 13, description: "Signages are in place", role: "LH" },
      { itemNo: 14, description: "Applicable equipment to access site checked to avoid double handling", role: "LH" },
      { itemNo: 15, description: "Steel is delivered as per Steel Delivery Plan at designated area", role: "LH" },
      { itemNo: 16, description: "Material delivery is complete and correct", role: "LH" },
      { itemNo: 17, description: "Steel is stored at site clear off swampy ground surface", role: "LH" },
    ],
  },
  {
    key: "assembly",
    title: "2. Assembly and Erection",
    note: "Report all discrepancies and modifications in Non-Conformance Report and Structure Modification ITCs respectively.",
    items: [
      { itemNo: 18, description: "Members are checked for straightness", role: "LH" },
      { itemNo: 19, description: "Members, plates and fasteners are properly galvanized", role: "LH" },
      { itemNo: 20, description: "Members, plates and fasteners are properly marked", role: "LH" },
      { itemNo: 21, description: "Members and plates are assembled in correct orientation", role: "LH" },
      { itemNo: 22, description: "Correct size and number of bolts are installed in correct locations", role: "LH" },
      { itemNo: 23, description: "Bolts are installed in correct direction (nuts outwards / downwards)", role: "LH" },
      { itemNo: 24, description: "Correct size and numbers of packers are installed in correct locations", role: "LH" },
      { itemNo: 25, description: "Spring lock washers used under nut of every bolt (excluding locknuts)", role: "LH" },
      { itemNo: 26, description: "No flat washer is used with spring lock washer", role: "LH" },
      { itemNo: 27, description: "Lock nuts are used with bolts holding brackets or hangers supporting insulator strings", role: "LH" },
      { itemNo: 28, description: "Bolts are torqued as per design, manufacturer recommendations and/or project specifications", role: "LH" },
      { itemNo: 29, description: "Threads of bolts when fully tightened project past depth of nut and do not exceed 12mm", role: "LH" },
      { itemNo: 30, description: "Nut for all bolts is not thread-bound when tightened", role: "LH" },
      { itemNo: 31, description: "One fourth turn is applied to nuts when spring lock washer is flat", role: "LH" },
      { itemNo: 32, description: "During erection no force is applied for bolt jointing", role: "LH" },
      { itemNo: 33, description: "Structure is straight after erection", role: "LH" },
      { itemNo: 34, description: "Step bolts and fall arrest are installed as per structure drawings", role: "LH" },
      { itemNo: 35, description: "After erection structure is free of dirt, rust and damaged galvanised surface", role: "LH" },
      { itemNo: 36, description: "Verification survey of critical measurement deviations is conducted", role: "LH" },
      { itemNo: 37, description: "Structure painting completed if required", role: "LH" },
    ],
  },
  {
    key: "final",
    title: "3. Final Checks / Close Out",
    note: "Report all discrepancies and modifications in Non-Conformance Report and Structure Modification ITCs respectively.",
    items: [
      { itemNo: 38, description: "Structure ID plates installed", role: "LH" },
      { itemNo: 39, description: "Warning plates installed", role: "LH" },
      { itemNo: 40, description: "Aerial ID installed – correct orientation", role: "LH" },
      { itemNo: 41, description: "Structure cleaning from soil and debris", role: "LH" },
      { itemNo: 42, description: "ACD installed and fitted correctly", role: "LH" },
      { itemNo: 43, description: "All nuts below ACDs welded or threads punched if required", role: "LH" },
      { itemNo: 44, description: "Double nuts installed if required", role: "LH" },
      { itemNo: 45, description: "Earthing cable(s) connected to the tower", role: "LH" },
      { itemNo: 46, description: "Site cleaned and restored", role: "LH" },
    ],
  },
];

function normaliseStatus(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getStringField(row: GenericRow, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function getRowStatus(row: GenericRow): string {
  return (
    getStringField(row, "status") ??
    getStringField(row, "delivery_status") ??
    getStringField(row, "defect_status") ??
    getStringField(row, "current_status") ??
    getStringField(row, "state") ??
    ""
  );
}

function isClosedLike(status: unknown): boolean {
  const s = normaliseStatus(status);
  return ["closed", "complete", "completed", "resolved", "approved", "accepted", "done"].includes(s);
}

function isDeliveredLike(status: unknown): boolean {
  const s = normaliseStatus(status);
  return ["delivered", "complete", "completed", "received", "closed"].includes(s);
}

function badgeClasses(kind: "green" | "yellow" | "red" | "blue" | "slate") {
  switch (kind) {
    case "green":
      return "bg-green-100 text-green-700 border-green-200";
    case "yellow":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "red":
      return "bg-red-100 text-red-700 border-red-200";
    case "blue":
      return "bg-blue-100 text-blue-700 border-blue-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function validationButtonClasses(current: ItcValidation, value: ItcValidation) {
  if (current !== value) return "border bg-white text-slate-700 hover:bg-slate-50";
  if (value === "Y") return "border bg-green-100 text-green-700 border-green-200";
  if (value === "N") return "border bg-red-100 text-red-700 border-red-200";
  if (value === "NA") return "border bg-yellow-100 text-yellow-800 border-yellow-200";
  return "border bg-slate-100 text-slate-700 border-slate-200";
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function emptyToNumberOrNull(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function numberOrBlank(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value);
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getTowerFieldValue(tower: TowerRecord | null, candidateKeys: string[]): string {
  if (!tower) return "";

  const normalizedCandidates = candidateKeys.map(normalizeKey);
  const directEntries = Object.entries(tower).filter(([key]) => key !== "extra_data");

  for (const [key, value] of directEntries) {
    const normalizedKey = normalizeKey(key);
    if (normalizedCandidates.includes(normalizedKey)) {
      if (typeof value === "string" && value.trim()) return value;
      if (typeof value === "number") return String(value);
    }
  }

  const extra = tower.extra_data;
  if (extra && typeof extra === "object") {
    for (const [key, value] of Object.entries(extra)) {
      const normalizedKey = normalizeKey(key);
      if (normalizedCandidates.includes(normalizedKey)) {
        if (typeof value === "string" && value.trim()) return value;
        if (typeof value === "number") return String(value);
      }
    }

    for (const [key, value] of Object.entries(extra)) {
      const normalizedKey = normalizeKey(key);
      const matched = candidateKeys.some((candidate) => {
        const c = normalizeKey(candidate);
        return normalizedKey.includes(c) || c.includes(normalizedKey);
      });

      if (matched) {
        if (typeof value === "string" && value.trim()) return value;
        if (typeof value === "number") return String(value);
      }
    }
  }

  return "";
}

function getTowerStructureType(tower: TowerRecord | null): string {
  return getTowerFieldValue(tower, [
    "structure_type",
    "structure type",
    "tower_type",
    "tower type",
    "type",
    "structure",
  ]);
}

function getTowerStructureHeight(tower: TowerRecord | null): string {
  return getTowerFieldValue(tower, [
    "structure_height",
    "structure height",
    "tower_height",
    "tower height",
    "height",
    "towerheight",
    "structureheight",
  ]);
}

function getTowerStructureWeight(tower: TowerRecord | null): string {
  return getTowerFieldValue(tower, [
    "structure_weight",
    "structure weight",
    "structure total weights",
    "structure total weight",
    "tower_weight",
    "tower weight",
    "weight",
    "mass",
    "total weight",
    "weights",
  ]);
}

function buildDefaultItems(itcId: string): Omit<ItcItem, "id">[] {
  return CHECKLIST_SECTIONS.flatMap((section) =>
    section.items.map((item) => ({
      itc_id: itcId,
      section_key: section.key,
      item_no: item.itemNo,
      description: item.description,
      validation: "",
      responsible_role: item.role,
      lh_name: null,
      lh_signature: null,
      checked_date: null,
      notes: null,
    })),
  );
}

export default function ItcPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<TowerRecord | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [itcDoc, setItcDoc] = useState<ItcDocument | null>(null);
  const [itcItems, setItcItems] = useState<ItcItem[]>([]);
  const [torqueRows, setTorqueRows] = useState<TorqueRow[]>([]);
  const [clientUploads, setClientUploads] = useState<ClientItcUpload[]>([]);
  const [defects, setDefects] = useState<GenericRow[]>([]);
  const [deliveries, setDeliveries] = useState<GenericRow[]>([]);
  const [modifications, setModifications] = useState<GenericRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    preparation: true,
    assembly: false,
    final: false,
    torque: false,
    client: false,
    signoff: false,
  });

  const [savingDetails, setSavingDetails] = useState(false);
  const [savingSignoff, setSavingSignoff] = useState(false);
  const [uploadingClient, setUploadingClient] = useState(false);

  const [clientTitle, setClientTitle] = useState("");
  const [clientRevision, setClientRevision] = useState("");
  const [clientStatus, setClientStatus] = useState("Uploaded");
  const [clientComments, setClientComments] = useState("");
  const [clientFile, setClientFile] = useState<File | null>(null);

  const [newTorque, setNewTorque] = useState({
    item_no: "",
    bolt_grade: "",
    bolt_dia: "",
    structural_washers: "",
    bolt_count: "",
    torque_achieved: "",
    remarks: "",
  });

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function seedChecklistItems(itcId: string) {
    const defaults = buildDefaultItems(itcId);
    const { error } = await supabase.from("tower_itc_items").insert(defaults);
    if (error) {
      alert(error.message || "Failed to seed checklist items.");
    }
  }

  async function createDefaultItcDocument(
    towerRecord: TowerRecord | null,
  ): Promise<ItcDocument | null> {
    const payload = {
      tower_id: towerId,
      project_id: projectId,
      title: "ITC - Tower Assembly and Erection",
      status: "Draft",
      revision: "Rev 0",
      structure_number: towerRecord?.name ? String(towerRecord.name) : null,
      structure_type: emptyToNull(getTowerStructureType(towerRecord)),
      structure_height: emptyToNumberOrNull(getTowerStructureHeight(towerRecord)),
      structure_weight: emptyToNumberOrNull(getTowerStructureWeight(towerRecord)),
      itc_mode: "BC" as ItcMode,
      subcontractor_name: "",
      ugl_supervisor_name: "",
      project_engineer_name: "",
      transgrid_rep_name: "",
    };

    const { data, error } = await supabase
      .from("tower_itc_documents")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to create ITC record.");
      return null;
    }

    const created = data as ItcDocument;
    await seedChecklistItems(created.id);
    return created;
  }

  async function loadPage() {
    setLoading(true);

    const [
      towerRes,
      docketRes,
      itcRes,
      defectsRes,
      deliveriesRes,
      modificationsRes,
      clientUploadsRes,
    ] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_itc_documents")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("tower_defects").select("*").eq("tower_id", towerId),
      supabase.from("tower_deliveries").select("*").eq("tower_id", towerId),
      supabase.from("tower_modifications").select("*").eq("tower_id", towerId),
      supabase
        .from("tower_itc_client_uploads")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    const towerData = (towerRes.data as TowerRecord | null) ?? null;
    setTower(towerData);
    setLatestDate(docketRes.data?.[0]?.docket_date ?? null);
    setDefects((defectsRes.data as GenericRow[] | null) ?? []);
    setDeliveries((deliveriesRes.data as GenericRow[] | null) ?? []);
    setModifications((modificationsRes.data as GenericRow[] | null) ?? []);
    setClientUploads((clientUploadsRes.data as ClientItcUpload[] | null) ?? []);

    let latestItc = (itcRes.data as ItcDocument | null) ?? null;

    if (!latestItc) {
      latestItc = await createDefaultItcDocument(towerData);
    }

    if (latestItc) {
      const patched: ItcDocument = {
        ...latestItc,
        itc_mode: latestItc.itc_mode ?? "BC",
        structure_number:
          latestItc.structure_number || (towerData?.name ? String(towerData.name) : ""),
        structure_type: latestItc.structure_type || getTowerStructureType(towerData),
        structure_height:
          latestItc.structure_height ?? getTowerStructureHeight(towerData),
        structure_weight:
          latestItc.structure_weight ?? getTowerStructureWeight(towerData),
      };

      setItcDoc(patched);

      const itemsRes = await supabase
        .from("tower_itc_items")
        .select("*")
        .eq("itc_id", latestItc.id)
        .order("item_no", { ascending: true });

      const torqueRes = await supabase
        .from("tower_itc_torque")
        .select("*")
        .eq("itc_id", latestItc.id)
        .order("item_no", { ascending: true });

      let itemData = (itemsRes.data as ItcItem[] | null) ?? [];

      if (itemData.length === 0) {
        await seedChecklistItems(latestItc.id);

        const retry = await supabase
          .from("tower_itc_items")
          .select("*")
          .eq("itc_id", latestItc.id)
          .order("item_no", { ascending: true });

        itemData = (retry.data as ItcItem[] | null) ?? [];
      }

      setItcItems(itemData);
      setTorqueRows((torqueRes.data as TorqueRow[] | null) ?? []);
    } else {
      setItcDoc(null);
      setItcItems([]);
      setTorqueRows([]);
    }

    setLoading(false);
  }

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setItemLocal(id: string, patch: Partial<ItcItem>) {
    setItcItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function saveItem(id: string) {
    const row = itcItems.find((item) => item.id === id);
    if (!row) return;

    const patch = {
      validation: row.validation,
      lh_name: emptyToNull(row.lh_name),
      lh_signature: emptyToNull(row.lh_signature),
      checked_date: emptyToNull(row.checked_date),
      notes: emptyToNull(row.notes),
    };

    const { error, data } = await supabase
      .from("tower_itc_items")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to save checklist row.");
      return;
    }

    setItcItems((prev) => prev.map((item) => (item.id === id ? (data as ItcItem) : item)));
  }

  async function saveDetails() {
    if (!itcDoc?.id) return;

    setSavingDetails(true);

    const payload = {
      revision: emptyToNull(itcDoc.revision) ?? "Rev 0",
      status: emptyToNull(itcDoc.status) ?? "Draft",
      itc_mode: itcDoc.itc_mode ?? "BC",
      structure_number:
        emptyToNull(itcDoc.structure_number) ?? (tower?.name ? String(tower.name) : null),
      structure_type:
        emptyToNull(
          typeof itcDoc.structure_type === "string"
            ? itcDoc.structure_type
            : String(itcDoc.structure_type ?? ""),
        ) ?? emptyToNull(getTowerStructureType(tower)),
      structure_height:
        emptyToNumberOrNull(numberOrBlank(itcDoc.structure_height)) ??
        emptyToNumberOrNull(getTowerStructureHeight(tower)),
      structure_weight:
        emptyToNumberOrNull(numberOrBlank(itcDoc.structure_weight)) ??
        emptyToNumberOrNull(getTowerStructureWeight(tower)),
    };

    const { error, data } = await supabase
      .from("tower_itc_documents")
      .update(payload)
      .eq("id", itcDoc.id)
      .select("*")
      .single();

    setSavingDetails(false);

    if (error) {
      alert(error.message || "Failed to save ITC details.");
      return;
    }

    setItcDoc(data as ItcDocument);
    alert("ITC details saved.");
  }

  async function addTorqueRow() {
    if (!itcDoc?.id) return;

    const payload = {
      itc_id: itcDoc.id,
      item_no: emptyToNumberOrNull(newTorque.item_no),
      bolt_grade: emptyToNull(newTorque.bolt_grade),
      bolt_dia: emptyToNumberOrNull(newTorque.bolt_dia),
      structural_washers: emptyToNull(newTorque.structural_washers),
      bolt_count: emptyToNumberOrNull(newTorque.bolt_count),
      torque_achieved: emptyToNull(newTorque.torque_achieved),
      remarks: emptyToNull(newTorque.remarks),
    };

    const { error, data } = await supabase
      .from("tower_itc_torque")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to add torque row.");
      return;
    }

    setTorqueRows((prev) =>
      [...prev, data as TorqueRow].sort((a, b) => (a.item_no ?? 0) - (b.item_no ?? 0)),
    );

    setNewTorque({
      item_no: "",
      bolt_grade: "",
      bolt_dia: "",
      structural_washers: "",
      bolt_count: "",
      torque_achieved: "",
      remarks: "",
    });
  }

  async function deleteTorqueRow(id: string) {
    const confirmed = window.confirm("Delete this torque row?");
    if (!confirmed) return;

    const { error } = await supabase.from("tower_itc_torque").delete().eq("id", id);
    if (error) {
      alert(error.message || "Failed to delete torque row.");
      return;
    }

    setTorqueRows((prev) => prev.filter((row) => row.id !== id));
  }

  async function uploadClientItc() {
    if (!clientFile) {
      alert("Choose a file first.");
      return;
    }

    setUploadingClient(true);

    const safeName = clientFile.name.replace(/\s+/g, "-");
    const path = `${projectId}/${towerId}/${Date.now()}-${safeName}`;

    const uploadRes = await supabase.storage.from("itc-files").upload(path, clientFile, {
      upsert: true,
    });

    if (uploadRes.error) {
      setUploadingClient(false);
      alert(uploadRes.error.message || "Failed to upload file.");
      return;
    }

    const { data: urlData } = supabase.storage.from("itc-files").getPublicUrl(path);

    const { error, data } = await supabase
      .from("tower_itc_client_uploads")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        title: emptyToNull(clientTitle) ?? clientFile.name,
        revision: emptyToNull(clientRevision),
        status: clientStatus,
        comments: emptyToNull(clientComments),
        file_name: clientFile.name,
        file_url: urlData.publicUrl,
      })
      .select("*")
      .single();

    setUploadingClient(false);

    if (error) {
      alert(error.message || "Failed to save client ITC upload.");
      return;
    }

    setClientUploads((prev) => [data as ClientItcUpload, ...prev]);
    setClientTitle("");
    setClientRevision("");
    setClientStatus("Uploaded");
    setClientComments("");
    setClientFile(null);

    const input = document.getElementById("client-itc-file") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  async function updateClientUpload(id: string, patch: Partial<ClientItcUpload>) {
    const { error, data } = await supabase
      .from("tower_itc_client_uploads")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to update client ITC.");
      return;
    }

    setClientUploads((prev) => prev.map((row) => (row.id === id ? (data as ClientItcUpload) : row)));
  }

  async function saveSignoff() {
    if (!itcDoc?.id) return;

    setSavingSignoff(true);

    const { error, data } = await supabase
      .from("tower_itc_documents")
      .update({
        subcontractor_name: emptyToNull(itcDoc.subcontractor_name),
        subcontractor_signed_at: emptyToNull(itcDoc.subcontractor_signed_at),
        ugl_supervisor_name: emptyToNull(itcDoc.ugl_supervisor_name),
        ugl_supervisor_signed_at: emptyToNull(itcDoc.ugl_supervisor_signed_at),
        project_engineer_name: emptyToNull(itcDoc.project_engineer_name),
        project_engineer_signed_at: emptyToNull(itcDoc.project_engineer_signed_at),
        transgrid_rep_name: emptyToNull(itcDoc.transgrid_rep_name),
        transgrid_rep_signed_at: emptyToNull(itcDoc.transgrid_rep_signed_at),
        status: overallReady ? "Submitted" : (emptyToNull(itcDoc.status) ?? "Draft"),
      })
      .eq("id", itcDoc.id)
      .select("*")
      .single();

    setSavingSignoff(false);

    if (error) {
      alert(error.message || "Failed to save sign-off.");
      return;
    }

    setItcDoc(data as ItcDocument);
    alert("Sign-off saved.");
  }

  function exportToPdf() {
    if (!itcDoc || !tower) return;

    const checklistHtml = CHECKLIST_SECTIONS.map((section) => {
      const rows = itcItems.filter((item) => item.section_key === section.key);

      return `
        <div style="margin-bottom:24px; page-break-inside:avoid;">
          <h2 style="font-size:18px; margin:0 0 8px 0;">${section.title}</h2>
          <p style="font-size:12px; color:#555; margin:0 0 12px 0;">${section.note ?? ""}</p>
          <table style="width:100%; border-collapse:collapse; font-size:12px;">
            <thead>
              <tr>
                <th style="border:1px solid #ccc; padding:8px; text-align:left;">Item</th>
                <th style="border:1px solid #ccc; padding:8px; text-align:left;">Description</th>
                <th style="border:1px solid #ccc; padding:8px; text-align:left;">Validation</th>
                <th style="border:1px solid #ccc; padding:8px; text-align:left;">LH Name</th>
                <th style="border:1px solid #ccc; padding:8px; text-align:left;">Signature</th>
                <th style="border:1px solid #ccc; padding:8px; text-align:left;">Date</th>
                <th style="border:1px solid #ccc; padding:8px; text-align:left;">Notes</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length > 0
                  ? rows
                      .map(
                        (row) => `
                          <tr>
                            <td style="border:1px solid #ccc; padding:8px;">${row.item_no}</td>
                            <td style="border:1px solid #ccc; padding:8px;">${row.description}</td>
                            <td style="border:1px solid #ccc; padding:8px;">${row.validation || "-"}</td>
                            <td style="border:1px solid #ccc; padding:8px;">${row.lh_name || "-"}</td>
                            <td style="border:1px solid #ccc; padding:8px;">${row.lh_signature || "-"}</td>
                            <td style="border:1px solid #ccc; padding:8px;">${row.checked_date || "-"}</td>
                            <td style="border:1px solid #ccc; padding:8px;">${row.notes || "-"}</td>
                          </tr>
                        `,
                      )
                      .join("")
                  : `
                    <tr>
                      <td colspan="7" style="border:1px solid #ccc; padding:8px;">No rows</td>
                    </tr>
                  `
              }
            </tbody>
          </table>
        </div>
      `;
    }).join("");

    const torqueHtml =
      currentMode === "BC"
        ? `
          <div style="margin-bottom:24px;">
            <h2 style="font-size:18px; margin:0 0 8px 0;">Torque Sheet</h2>
            <table style="width:100%; border-collapse:collapse; font-size:12px;">
              <thead>
                <tr>
                  <th style="border:1px solid #ccc; padding:8px; text-align:left;">Item</th>
                  <th style="border:1px solid #ccc; padding:8px; text-align:left;">Bolt Grade</th>
                  <th style="border:1px solid #ccc; padding:8px; text-align:left;">Bolt Dia</th>
                  <th style="border:1px solid #ccc; padding:8px; text-align:left;">Washers</th>
                  <th style="border:1px solid #ccc; padding:8px; text-align:left;">Bolt Count</th>
                  <th style="border:1px solid #ccc; padding:8px; text-align:left;">Torque Achieved</th>
                  <th style="border:1px solid #ccc; padding:8px; text-align:left;">Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${
                  torqueRows.length > 0
                    ? torqueRows
                        .map(
                          (row) => `
                            <tr>
                              <td style="border:1px solid #ccc; padding:8px;">${row.item_no ?? "-"}</td>
                              <td style="border:1px solid #ccc; padding:8px;">${row.bolt_grade || "-"}</td>
                              <td style="border:1px solid #ccc; padding:8px;">${row.bolt_dia ?? "-"}</td>
                              <td style="border:1px solid #ccc; padding:8px;">${row.structural_washers || "-"}</td>
                              <td style="border:1px solid #ccc; padding:8px;">${row.bolt_count ?? "-"}</td>
                              <td style="border:1px solid #ccc; padding:8px;">${row.torque_achieved || "-"}</td>
                              <td style="border:1px solid #ccc; padding:8px;">${row.remarks || "-"}</td>
                            </tr>
                          `,
                        )
                        .join("")
                    : `
                      <tr>
                        <td colspan="7" style="border:1px solid #ccc; padding:8px;">No torque rows</td>
                      </tr>
                    `
                }
              </tbody>
            </table>
          </div>
        `
        : "";

    const clientHtml = `
      <div style="margin-bottom:24px;">
        <h2 style="font-size:18px; margin:0 0 8px 0;">Client ITC Uploads</h2>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr>
              <th style="border:1px solid #ccc; padding:8px; text-align:left;">Title</th>
              <th style="border:1px solid #ccc; padding:8px; text-align:left;">Revision</th>
              <th style="border:1px solid #ccc; padding:8px; text-align:left;">Status</th>
              <th style="border:1px solid #ccc; padding:8px; text-align:left;">Comments</th>
              <th style="border:1px solid #ccc; padding:8px; text-align:left;">Uploaded</th>
            </tr>
          </thead>
          <tbody>
            ${
              clientUploads.length > 0
                ? clientUploads
                    .map(
                      (row) => `
                        <tr>
                          <td style="border:1px solid #ccc; padding:8px;">${row.title || row.file_name || "-"}</td>
                          <td style="border:1px solid #ccc; padding:8px;">${row.revision || "-"}</td>
                          <td style="border:1px solid #ccc; padding:8px;">${row.status || "-"}</td>
                          <td style="border:1px solid #ccc; padding:8px;">${row.comments || "-"}</td>
                          <td style="border:1px solid #ccc; padding:8px;">${formatDate(row.created_at)}</td>
                        </tr>
                      `,
                    )
                    .join("")
                : `
                  <tr>
                    <td colspan="5" style="border:1px solid #ccc; padding:8px;">No client uploads</td>
                  </tr>
                `
            }
          </tbody>
        </table>
      </div>
    `;

    const signoffHtml = `
      <div style="margin-bottom:24px;">
        <h2 style="font-size:18px; margin:0 0 8px 0;">Sign-off</h2>
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <tbody>
            <tr>
              <td style="border:1px solid #ccc; padding:8px; font-weight:600;">Sub-contractor Representative</td>
              <td style="border:1px solid #ccc; padding:8px;">${itcDoc.subcontractor_name || "-"}</td>
              <td style="border:1px solid #ccc; padding:8px;">${itcDoc.subcontractor_signed_at || "-"}</td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc; padding:8px; font-weight:600;">UGL Supervisor</td>
              <td style="border:1px solid #ccc; padding:8px;">${itcDoc.ugl_supervisor_name || "-"}</td>
              <td style="border:1px solid #ccc; padding:8px;">${itcDoc.ugl_supervisor_signed_at || "-"}</td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc; padding:8px; font-weight:600;">Project Engineer / Construction Manager</td>
              <td style="border:1px solid #ccc; padding:8px;">${itcDoc.project_engineer_name || "-"}</td>
              <td style="border:1px solid #ccc; padding:8px;">${itcDoc.project_engineer_signed_at || "-"}</td>
            </tr>
            <tr>
              <td style="border:1px solid #ccc; padding:8px; font-weight:600;">TransGrid Representative</td>
              <td style="border:1px solid #ccc; padding:8px;">${itcDoc.transgrid_rep_name || "-"}</td>
              <td style="border:1px solid #ccc; padding:8px;">${itcDoc.transgrid_rep_signed_at || "-"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Popup blocked. Please allow popups and try again.");
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>ITC Export - ${itcDoc.structure_number || tower.name || towerId}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin: 0 0 12px 0; font-size: 24px; }
            .meta { margin-bottom: 24px; }
            .meta-row { margin-bottom: 6px; font-size: 13px; }
            .status { display:inline-block; padding: 4px 8px; border:1px solid #ccc; border-radius: 999px; font-size: 12px; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Inspection & Test Checksheet (ITC)</h1>
          <div class="meta">
            <div class="meta-row"><strong>Structure Number:</strong> ${itcDoc.structure_number || tower.name || "-"}</div>
            <div class="meta-row"><strong>Structure Type:</strong> ${typeof itcDoc.structure_type === "string" ? itcDoc.structure_type : "-"}</div>
            <div class="meta-row"><strong>Structure Height:</strong> ${numberOrBlank(itcDoc.structure_height) || "-"}</div>
            <div class="meta-row"><strong>Structure Weight:</strong> ${numberOrBlank(itcDoc.structure_weight) || "-"}</div>
            <div class="meta-row"><strong>Revision:</strong> ${itcDoc.revision || "-"}</div>
            <div class="meta-row"><strong>Mode:</strong> ${itcDoc.itc_mode || "BC"}</div>
            <div class="meta-row"><strong>Status:</strong> <span class="status">${itcDoc.status || "-"}</span></div>
            <div class="meta-row"><strong>Latest Daily Docket:</strong> ${latestDate || "-"}</div>
          </div>
          ${currentMode === "BC" ? checklistHtml : ""}
          ${torqueHtml}
          ${clientHtml}
          ${signoffHtml}
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  }

  const defectsSummary = useMemo(() => {
    const total = defects.length;
    const closed = defects.filter((row) => isClosedLike(getRowStatus(row))).length;
    return {
      total,
      closed,
      open: total - closed,
      complete: total === 0 || total - closed === 0,
    };
  }, [defects]);

  const deliveriesSummary = useMemo(() => {
    const total = deliveries.length;
    const complete = deliveries.filter((row) => isDeliveredLike(getRowStatus(row))).length;
    return {
      total,
      complete,
      pending: total - complete,
      allDelivered: total === 0 || total - complete === 0,
    };
  }, [deliveries]);

  const modificationsSummary = useMemo(() => {
    return { total: modifications.length, complete: true };
  }, [modifications]);

  const docketSummary = useMemo(() => {
    return { complete: !!latestDate };
  }, [latestDate]);

  const checklistSummary = useMemo(() => {
    const total = itcItems.length;
    const passed = itcItems.filter((item) => item.validation === "Y" || item.validation === "NA").length;
    const failed = itcItems.filter((item) => item.validation === "N").length;
    const pending = itcItems.filter((item) => item.validation === "").length;
    return {
      total,
      passed,
      failed,
      pending,
      done: total > 0 && failed === 0 && pending === 0,
    };
  }, [itcItems]);

  const torqueSummary = useMemo(() => {
    const total = torqueRows.length;
    const complete = torqueRows.filter((row) => String(row.torque_achieved || "").trim() !== "").length;
    return {
      total,
      complete,
      done: total > 0 && total === complete,
    };
  }, [torqueRows]);

  const clientItcSummary = useMemo(() => {
    return { total: clientUploads.length, present: clientUploads.length > 0 };
  }, [clientUploads]);

  const currentMode: ItcMode = itcDoc?.itc_mode ?? "BC";

  const readinessItems = useMemo(() => {
    const common = [
      {
        label: "Latest daily docket submitted",
        complete: docketSummary.complete,
        detail: latestDate ? `Latest docket: ${latestDate}` : "No daily docket submitted yet",
      },
      {
        label: "Defects closed",
        complete: defectsSummary.complete,
        detail:
          defectsSummary.total > 0
            ? `${defectsSummary.closed}/${defectsSummary.total} closed`
            : "No defects raised",
      },
      {
        label: "Deliveries complete",
        complete: deliveriesSummary.allDelivered,
        detail:
          deliveriesSummary.total > 0
            ? `${deliveriesSummary.complete}/${deliveriesSummary.total} complete`
            : "No delivery records logged",
      },
      {
        label: "Modifications reviewed / logged",
        complete: modificationsSummary.complete,
        detail:
          modificationsSummary.total > 0
            ? `${modificationsSummary.total} modification record(s)`
            : "No modification records",
      },
    ];

    if (currentMode === "Client") {
      return [
        ...common,
        {
          label: "Client ITC uploaded",
          complete: clientItcSummary.present,
          detail: clientItcSummary.present
            ? `${clientItcSummary.total} uploaded`
            : "No client ITC uploaded yet",
        },
      ];
    }

    return [
      ...common,
      {
        label: "BC checklist complete",
        complete: checklistSummary.done,
        detail: `${checklistSummary.passed}/${checklistSummary.total} compliant, ${checklistSummary.failed} failed, ${checklistSummary.pending} pending`,
      },
      {
        label: "Torque sheet complete",
        complete: torqueSummary.done,
        detail:
          torqueSummary.total > 0
            ? `${torqueSummary.complete}/${torqueSummary.total} rows complete`
            : "No torque rows added yet",
      },
    ];
  }, [
    checklistSummary.done,
    checklistSummary.failed,
    checklistSummary.passed,
    checklistSummary.pending,
    checklistSummary.total,
    clientItcSummary.present,
    clientItcSummary.total,
    currentMode,
    deliveriesSummary.allDelivered,
    deliveriesSummary.complete,
    deliveriesSummary.total,
    defectsSummary.closed,
    defectsSummary.complete,
    defectsSummary.total,
    docketSummary.complete,
    latestDate,
    modificationsSummary.complete,
    modificationsSummary.total,
    torqueSummary.complete,
    torqueSummary.done,
    torqueSummary.total,
  ]);

  const overallReady = useMemo(() => {
    if (currentMode === "Client") {
      return (
        docketSummary.complete &&
        defectsSummary.complete &&
        deliveriesSummary.allDelivered &&
        clientItcSummary.present
      );
    }

    return (
      docketSummary.complete &&
      defectsSummary.complete &&
      deliveriesSummary.allDelivered &&
      checklistSummary.done &&
      torqueSummary.done
    );
  }, [
    checklistSummary.done,
    clientItcSummary.present,
    currentMode,
    deliveriesSummary.allDelivered,
    defectsSummary.complete,
    docketSummary.complete,
    torqueSummary.done,
  ]);

  const sectionItems = useMemo(() => {
    return CHECKLIST_SECTIONS.map((section) => ({
      ...section,
      rows: itcItems.filter((item) => item.section_key === section.key),
    }));
  }, [itcItems]);

  if (loading || !tower || !itcDoc) {
    return <div className="p-8">Loading ITC...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
        >
          Safety
        </Link>
        <Link
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
        >
          ITCs
        </Link>
        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}
        >
          Permits
        </Link>
        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/lifts`}
        >
          Lift Studies
        </Link>
        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>
      </div>

      <div
        className={`border rounded-2xl p-5 ${
          overallReady ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Inspection & Test Checksheet (ITC)</h1>
            <p className="text-sm text-slate-600 mt-1">
              {currentMode === "BC"
                ? "BC ITC mode with checklist, torque and sign-off."
                : "Client ITC mode with upload tracking and sign-off."}
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={exportToPdf}
              className="border px-4 py-2 rounded-lg hover:bg-white"
            >
              Export to PDF
            </button>

            <div
              className={`inline-flex items-center px-3 py-2 rounded-full border text-sm font-semibold w-fit ${
                overallReady ? badgeClasses("green") : badgeClasses("yellow")
              }`}
            >
              {overallReady ? "Ready for sign-off" : "Attention required"}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-xl font-bold">ITC Readiness</h2>
          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/project/${projectId}/tower/${towerId}/defects`}
              className="border px-4 py-2 rounded-lg"
            >
              Defects
            </Link>
            <Link
              href={`/project/${projectId}/tower/${towerId}/deliveries`}
              className="border px-4 py-2 rounded-lg"
            >
              Deliveries
            </Link>
            <Link
              href={`/project/${projectId}/tower/${towerId}/modifications`}
              className="border px-4 py-2 rounded-lg"
            >
              Modifications
            </Link>
            <Link
              href={`/project/${projectId}/tower/${towerId}/dockets`}
              className="border px-4 py-2 rounded-lg"
            >
              Daily Dockets
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          {readinessItems.map((item) => (
            <div
              key={item.label}
              className="border rounded-xl p-4 flex items-start justify-between gap-4"
            >
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-sm text-slate-500">{item.detail}</div>
              </div>

              <span
                className={`px-3 py-1 rounded-full border text-xs font-semibold whitespace-nowrap ${
                  item.complete ? badgeClasses("green") : badgeClasses("red")
                }`}
              >
                {item.complete ? "Complete" : "Required"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-bold">ITC Details</h2>
          <button
            onClick={() => void saveDetails()}
            disabled={savingDetails}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {savingDetails ? "Saving..." : "Save Details"}
          </button>
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-4">
          <select
            value={itcDoc.itc_mode ?? "BC"}
            onChange={(e) =>
              setItcDoc((prev) => (prev ? { ...prev, itc_mode: e.target.value as ItcMode } : prev))
            }
            className="border rounded-lg p-2"
          >
            <option value="BC">BC ITC</option>
            <option value="Client">Client ITC</option>
          </select>

          <input
            value={itcDoc.revision ?? "Rev 0"}
            onChange={(e) => setItcDoc((prev) => (prev ? { ...prev, revision: e.target.value } : prev))}
            placeholder="Revision"
            className="border rounded-lg p-2"
          />

          <input
            value={itcDoc.status ?? "Draft"}
            onChange={(e) => setItcDoc((prev) => (prev ? { ...prev, status: e.target.value } : prev))}
            placeholder="Status"
            className="border rounded-lg p-2"
          />

          <input
            readOnly
            value={itcDoc.structure_number ?? (tower.name ? String(tower.name) : "")}
            placeholder="Structure Number"
            className="border rounded-lg p-2 bg-slate-50"
          />

          <input
            readOnly
            value={
              typeof itcDoc.structure_type === "string"
                ? itcDoc.structure_type
                : getTowerStructureType(tower)
            }
            placeholder="Structure Type"
            className="border rounded-lg p-2 bg-slate-50"
          />

          <input
            readOnly
            value={numberOrBlank(itcDoc.structure_height) || getTowerStructureHeight(tower)}
            placeholder="Structure Height"
            className="border rounded-lg p-2 bg-slate-50"
          />

          <input
            readOnly
            value={numberOrBlank(itcDoc.structure_weight) || getTowerStructureWeight(tower)}
            placeholder="Structure Weight"
            className="border rounded-lg p-2 bg-slate-50"
          />
        </div>
      </div>

      {currentMode === "BC" &&
        sectionItems.map((section) => (
          <div key={section.key} className="bg-white border rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection(section.key)}
              className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100 text-left"
            >
              <div>
                <div className="text-lg font-bold">{section.title}</div>
                <div className="text-sm text-slate-500">
                  {section.rows.filter((row) => row.validation !== "").length}/{section.rows.length} answered
                </div>
              </div>
              <span className="text-sm font-medium">
                {expandedSections[section.key] ? "Collapse" : "Expand"}
              </span>
            </button>

            {expandedSections[section.key] && (
              <div className="p-6 space-y-4">
                {section.note && (
                  <div className="text-sm text-slate-600 bg-slate-50 border rounded-xl p-3">
                    {section.note}
                  </div>
                )}

                {section.rows.length === 0 && (
                  <div className="border rounded-xl p-4 text-slate-500">
                    No checklist rows found for this section.
                  </div>
                )}

                <div className="space-y-4">
                  {section.rows.map((item) => (
                    <div key={item.id} className="border rounded-xl p-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                          <div className="lg:w-[45%]">
                            <div className="font-semibold">
                              {item.item_no}. {item.description}
                            </div>
                            <div className="text-sm text-slate-500 mt-1">
                              Responsibility: {item.responsible_role || "LH"}
                            </div>
                          </div>

                          <div className="lg:w-[55%] space-y-3">
                            <div className="flex gap-2 flex-wrap">
                              {(["Y", "N", "NA"] as ItcValidation[]).map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setItemLocal(item.id, { validation: value })}
                                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${validationButtonClasses(
                                    item.validation,
                                    value,
                                  )}`}
                                >
                                  {value}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setItemLocal(item.id, { validation: "" })}
                                className={`px-4 py-2 rounded-lg text-sm font-semibold ${validationButtonClasses(
                                  item.validation,
                                  "",
                                )}`}
                              >
                                Clear
                              </button>
                            </div>

                            <div className="grid md:grid-cols-3 gap-3">
                              <input
                                value={item.lh_name ?? ""}
                                onChange={(e) => setItemLocal(item.id, { lh_name: e.target.value })}
                                placeholder="LH Name"
                                className="border rounded-lg p-2"
                              />
                              <input
                                value={item.lh_signature ?? ""}
                                onChange={(e) => setItemLocal(item.id, { lh_signature: e.target.value })}
                                placeholder="Signature / Initials"
                                className="border rounded-lg p-2"
                              />
                              <input
                                type="date"
                                value={item.checked_date ?? ""}
                                onChange={(e) => setItemLocal(item.id, { checked_date: e.target.value })}
                                className="border rounded-lg p-2"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col md:flex-row gap-3">
                          <input
                            value={item.notes ?? ""}
                            onChange={(e) => setItemLocal(item.id, { notes: e.target.value })}
                            placeholder="Notes / comments"
                            className="border rounded-lg p-2 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => void saveItem(item.id)}
                            className="border px-4 py-2 rounded-lg hover:bg-slate-50"
                          >
                            Save Row
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

      {currentMode === "BC" && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <button
            onClick={() => toggleSection("torque")}
            className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100 text-left"
          >
            <div>
              <div className="text-lg font-bold">Torque Sheet</div>
              <div className="text-sm text-slate-500">
                {torqueSummary.complete}/{torqueSummary.total} rows complete
              </div>
            </div>
            <span className="text-sm font-medium">
              {expandedSections.torque ? "Collapse" : "Expand"}
            </span>
          </button>

          {expandedSections.torque && (
            <div className="p-6 space-y-4">
              <div className="grid md:grid-cols-7 gap-3">
                <input
                  value={newTorque.item_no}
                  onChange={(e) => setNewTorque((prev) => ({ ...prev, item_no: e.target.value }))}
                  placeholder="Item No."
                  className="border rounded-lg p-2"
                />
                <input
                  value={newTorque.bolt_grade}
                  onChange={(e) => setNewTorque((prev) => ({ ...prev, bolt_grade: e.target.value }))}
                  placeholder="Bolt Grade"
                  className="border rounded-lg p-2"
                />
                <input
                  value={newTorque.bolt_dia}
                  onChange={(e) => setNewTorque((prev) => ({ ...prev, bolt_dia: e.target.value }))}
                  placeholder="Bolt Dia"
                  className="border rounded-lg p-2"
                />
                <input
                  value={newTorque.structural_washers}
                  onChange={(e) => setNewTorque((prev) => ({ ...prev, structural_washers: e.target.value }))}
                  placeholder="Structural Washers"
                  className="border rounded-lg p-2"
                />
                <input
                  value={newTorque.bolt_count}
                  onChange={(e) => setNewTorque((prev) => ({ ...prev, bolt_count: e.target.value }))}
                  placeholder="Bolt Count"
                  className="border rounded-lg p-2"
                />
                <input
                  value={newTorque.torque_achieved}
                  onChange={(e) => setNewTorque((prev) => ({ ...prev, torque_achieved: e.target.value }))}
                  placeholder="Torque Achieved"
                  className="border rounded-lg p-2"
                />
                <input
                  value={newTorque.remarks}
                  onChange={(e) => setNewTorque((prev) => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Remarks"
                  className="border rounded-lg p-2"
                />
              </div>

              <button
                type="button"
                onClick={() => void addTorqueRow()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Add Torque Row
              </button>

              <div className="space-y-3">
                {torqueRows.length === 0 && (
                  <div className="text-slate-500">No torque rows added yet.</div>
                )}

                {torqueRows.map((row) => (
                  <div
                    key={row.id}
                    className="border rounded-xl p-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4"
                  >
                    <div>
                      <div className="font-semibold">
                        Item {row.item_no ?? "-"} · Grade {row.bolt_grade || "-"}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">
                        Dia: {row.bolt_dia ?? "-"} · Washers: {row.structural_washers || "-"}
                      </div>
                      <div className="text-sm text-slate-500">
                        Bolts: {row.bolt_count ?? "-"} · Achieved: {row.torque_achieved || "-"}
                      </div>
                      <div className="text-sm text-slate-500">
                        Remarks: {row.remarks || "-"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void deleteTorqueRow(row.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection("client")}
          className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100 text-left"
        >
          <div>
            <div className="text-lg font-bold">Client ITC Uploads</div>
            <div className="text-sm text-slate-500">{clientUploads.length} uploaded record(s)</div>
          </div>
          <span className="text-sm font-medium">
            {expandedSections.client ? "Collapse" : "Expand"}
          </span>
        </button>

        {expandedSections.client && (
          <div className="p-6 space-y-5">
            <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
              <input
                value={clientTitle}
                onChange={(e) => setClientTitle(e.target.value)}
                placeholder="Title"
                className="border rounded-lg p-2"
              />
              <input
                value={clientRevision}
                onChange={(e) => setClientRevision(e.target.value)}
                placeholder="Revision"
                className="border rounded-lg p-2"
              />
              <select
                value={clientStatus}
                onChange={(e) => setClientStatus(e.target.value)}
                className="border rounded-lg p-2"
              >
                <option>Uploaded</option>
                <option>Submitted</option>
                <option>Accepted</option>
                <option>Rejected</option>
                <option>Superseded</option>
              </select>
              <input
                value={clientComments}
                onChange={(e) => setClientComments(e.target.value)}
                placeholder="Comments"
                className="border rounded-lg p-2"
              />
              <input
                id="client-itc-file"
                type="file"
                onChange={(e) => setClientFile(e.target.files?.[0] ?? null)}
                className="border rounded-lg p-2"
              />
            </div>

            <button
              type="button"
              onClick={() => void uploadClientItc()}
              disabled={uploadingClient}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {uploadingClient ? "Uploading..." : "Upload Client ITC"}
            </button>

            <div className="space-y-3">
              {clientUploads.length === 0 && (
                <div className="text-slate-500">No client ITC uploads yet.</div>
              )}

              {clientUploads.map((row) => (
                <div key={row.id} className="border rounded-xl p-4">
                  <div className="grid lg:grid-cols-[2fr_1fr_1fr_auto] gap-4 items-start">
                    <div>
                      <div className="font-semibold">{row.title || row.file_name || "Client ITC"}</div>
                      <div className="text-sm text-slate-500 mt-1">
                        Revision: {row.revision || "-"} · Uploaded: {formatDate(row.created_at)}
                      </div>
                      <div className="text-sm text-slate-500">{row.comments || "-"}</div>
                    </div>

                    <select
                      value={row.status || "Uploaded"}
                      onChange={(e) => void updateClientUpload(row.id, { status: e.target.value })}
                      className="border rounded-lg p-2"
                    >
                      <option>Uploaded</option>
                      <option>Submitted</option>
                      <option>Accepted</option>
                      <option>Rejected</option>
                      <option>Superseded</option>
                    </select>

                    <input
                      value={row.revision || ""}
                      onChange={(e) =>
                        setClientUploads((prev) =>
                          prev.map((x) => (x.id === row.id ? { ...x, revision: e.target.value } : x)),
                        )
                      }
                      onBlur={(e) => void updateClientUpload(row.id, { revision: e.target.value })}
                      placeholder="Revision"
                      className="border rounded-lg p-2"
                    />

                    <a
                      href={row.file_url || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="border px-4 py-2 rounded-lg hover:bg-slate-50 text-center"
                    >
                      Open File
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection("signoff")}
          className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100 text-left"
        >
          <div>
            <div className="text-lg font-bold">Sign-off</div>
            <div className="text-sm text-slate-500">
              Sub-contractor, UGL, Project Engineer / CM, and TransGrid fields
            </div>
          </div>
          <span className="text-sm font-medium">
            {expandedSections.signoff ? "Collapse" : "Expand"}
          </span>
        </button>

        {expandedSections.signoff && (
          <div className="p-6 space-y-5">
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="border rounded-xl p-4 space-y-3">
                <div className="font-semibold">Sub-contractor Representative</div>
                <input
                  value={itcDoc.subcontractor_name ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, subcontractor_name: e.target.value } : prev))
                  }
                  placeholder="Name"
                  className="border rounded-lg p-2 w-full"
                />
                <input
                  type="date"
                  value={itcDoc.subcontractor_signed_at ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) =>
                      prev ? { ...prev, subcontractor_signed_at: e.target.value } : prev,
                    )
                  }
                  className="border rounded-lg p-2 w-full"
                />
              </div>

              <div className="border rounded-xl p-4 space-y-3">
                <div className="font-semibold">UGL Supervisor</div>
                <input
                  value={itcDoc.ugl_supervisor_name ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, ugl_supervisor_name: e.target.value } : prev))
                  }
                  placeholder="Name"
                  className="border rounded-lg p-2 w-full"
                />
                <input
                  type="date"
                  value={itcDoc.ugl_supervisor_signed_at ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) =>
                      prev ? { ...prev, ugl_supervisor_signed_at: e.target.value } : prev,
                    )
                  }
                  className="border rounded-lg p-2 w-full"
                />
              </div>

              <div className="border rounded-xl p-4 space-y-3">
                <div className="font-semibold">Project Engineer / Construction Manager</div>
                <input
                  value={itcDoc.project_engineer_name ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) =>
                      prev ? { ...prev, project_engineer_name: e.target.value } : prev,
                    )
                  }
                  placeholder="Name"
                  className="border rounded-lg p-2 w-full"
                />
                <input
                  type="date"
                  value={itcDoc.project_engineer_signed_at ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) =>
                      prev ? { ...prev, project_engineer_signed_at: e.target.value } : prev,
                    )
                  }
                  className="border rounded-lg p-2 w-full"
                />
              </div>

              <div className="border rounded-xl p-4 space-y-3">
                <div className="font-semibold">TransGrid Representative</div>
                <input
                  value={itcDoc.transgrid_rep_name ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, transgrid_rep_name: e.target.value } : prev))
                  }
                  placeholder="Name"
                  className="border rounded-lg p-2 w-full"
                />
                <input
                  type="date"
                  value={itcDoc.transgrid_rep_signed_at ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) =>
                      prev ? { ...prev, transgrid_rep_signed_at: e.target.value } : prev,
                    )
                  }
                  className="border rounded-lg p-2 w-full"
                />
              </div>
            </div>

            <div
              className={`border rounded-xl p-4 ${
                overallReady ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"
              }`}
            >
              <div className="font-semibold">
                {overallReady
                  ? "This ITC appears ready for submission / sign-off."
                  : "This ITC still has outstanding items before full sign-off."}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Status will save as{" "}
                <span className="font-medium">{overallReady ? "Submitted" : itcDoc.status || "Draft"}</span>.
              </div>
            </div>

            <button
              type="button"
              onClick={() => void saveSignoff()}
              disabled={savingSignoff}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {savingSignoff ? "Saving..." : "Save Sign-off"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
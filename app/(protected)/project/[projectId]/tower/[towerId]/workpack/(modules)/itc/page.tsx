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
  [key: string]: unknown;
};

type ItcDocument = {
  id: string;
  tower_id: string;
  project_id?: string | null;
  title?: string | null;
  status?: string | null;
  work_lot_no?: string | null;
  document_no?: string | null;
  revision?: string | null;
  structure_number?: string | null;
  structure_type?: string | null;
  structure_height?: string | null;
  structure_weight?: string | null;
  comments_preparation?: string | null;
  comments_assembly?: string | null;
  comments_final?: string | null;
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
  validation: "Y" | "N" | "NA" | "";
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
      { itemNo: 8, description: "All relevant permits (including access, safety, environment, TMP) are in place", role: "LH" },
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
      { itemNo: 20, description: "Members, plates, and fasteners are properly marked", role: "LH" },
      { itemNo: 21, description: "Members and plates are assembled in correct orientation", role: "LH" },
      { itemNo: 22, description: "Correct size and number of bolts are installed in correct locations", role: "LH" },
      { itemNo: 23, description: "Bolts are installed in correct direction (nuts outwards/downwards)", role: "LH" },
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

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
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
    }))
  );
}

export default function TowerItcPage() {
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

  const [savingHeader, setSavingHeader] = useState(false);
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
    const latestDocket = docketRes.data?.[0]?.docket_date ?? null;
    const latestItc = (itcRes.data as ItcDocument | null) ?? null;

    setTower(towerData);
    setLatestDate(latestDocket);
    setDefects((defectsRes.data as GenericRow[] | null) ?? []);
    setDeliveries((deliveriesRes.data as GenericRow[] | null) ?? []);
    setModifications((modificationsRes.data as GenericRow[] | null) ?? []);
    setClientUploads((clientUploadsRes.data as ClientItcUpload[] | null) ?? []);
    setItcDoc(latestItc);

    if (latestItc) {
      const [itemsRes, torqueRes] = await Promise.all([
        supabase
          .from("tower_itc_items")
          .select("*")
          .eq("itc_id", latestItc.id)
          .order("item_no", { ascending: true }),
        supabase
          .from("tower_itc_torque")
          .select("*")
          .eq("itc_id", latestItc.id)
          .order("item_no", { ascending: true }),
      ]);

      const itemData = (itemsRes.data as ItcItem[] | null) ?? [];
      const torqueData = (torqueRes.data as TorqueRow[] | null) ?? [];

      setItcItems(itemData);
      setTorqueRows(torqueData);

      if (itemData.length === 0) {
        await seedChecklistItems(latestItc.id);
      }
    }

    setLoading(false);
  }

  async function seedChecklistItems(itcId: string) {
    const defaults = buildDefaultItems(itcId);

    const { error } = await supabase.from("tower_itc_items").insert(defaults);
    if (error) {
      alert(error.message || "Failed to seed checklist items.");
      return;
    }

    const { data } = await supabase
      .from("tower_itc_items")
      .select("*")
      .eq("itc_id", itcId)
      .order("item_no", { ascending: true });

    setItcItems((data as ItcItem[] | null) ?? []);
  }

  async function ensureItcDocument(): Promise<ItcDocument | null> {
    if (itcDoc) return itcDoc;

    const defaultDoc = {
      tower_id: towerId,
      project_id: projectId,
      title: "BC ITC - Tower Assembly and Erection",
      status: "Draft",
      work_lot_no: "",
      document_no: "3200-0645-ME-002",
      revision: "Rev 0",
      structure_number: tower?.name ? String(tower.name) : "",
      structure_type: "",
      structure_height: "",
      structure_weight: "",
      comments_preparation: "",
      comments_assembly: "",
      comments_final: "",
      subcontractor_name: "",
      ugl_supervisor_name: "",
      project_engineer_name: "",
      transgrid_rep_name: "",
    };

    const { data, error } = await supabase
      .from("tower_itc_documents")
      .insert(defaultDoc)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to create ITC document.");
      return null;
    }

    const created = data as ItcDocument;
    setItcDoc(created);
    await seedChecklistItems(created.id);
    return created;
  }

  async function saveHeaderFields() {
    const doc = await ensureItcDocument();
    if (!doc) return;

    setSavingHeader(true);
    const { error, data } = await supabase
      .from("tower_itc_documents")
      .update({
        title: doc.title,
        work_lot_no: doc.work_lot_no ?? "",
        document_no: doc.document_no ?? "",
        revision: doc.revision ?? "",
        structure_number: doc.structure_number ?? "",
        structure_type: doc.structure_type ?? "",
        structure_height: doc.structure_height ?? "",
        structure_weight: doc.structure_weight ?? "",
        comments_preparation: doc.comments_preparation ?? "",
        comments_assembly: doc.comments_assembly ?? "",
        comments_final: doc.comments_final ?? "",
        status: doc.status ?? "Draft",
      })
      .eq("id", doc.id)
      .select("*")
      .single();

    setSavingHeader(false);

    if (error) {
      alert(error.message || "Failed to save ITC header.");
      return;
    }

    setItcDoc(data as ItcDocument);
    alert("ITC header saved.");
  }

  async function updateChecklistItem(id: string, patch: Partial<ItcItem>) {
    const { error, data } = await supabase
      .from("tower_itc_items")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to update checklist item.");
      return;
    }

    setItcItems((prev) => prev.map((item) => (item.id === id ? (data as ItcItem) : item)));
  }

  function setItemLocal(id: string, patch: Partial<ItcItem>) {
    setItcItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function saveItem(id: string) {
    const item = itcItems.find((x) => x.id === id);
    if (!item) return;

    await updateChecklistItem(id, {
      validation: item.validation,
      lh_name: item.lh_name,
      lh_signature: item.lh_signature,
      checked_date: item.checked_date,
      notes: item.notes,
    });
  }

  async function addTorqueRow() {
    const doc = await ensureItcDocument();
    if (!doc) return;

    const { error, data } = await supabase
      .from("tower_itc_torque")
      .insert({
        itc_id: doc.id,
        item_no: newTorque.item_no ? Number(newTorque.item_no) : null,
        bolt_grade: newTorque.bolt_grade || null,
        bolt_dia: newTorque.bolt_dia ? Number(newTorque.bolt_dia) : null,
        structural_washers: newTorque.structural_washers || null,
        bolt_count: newTorque.bolt_count ? Number(newTorque.bolt_count) : null,
        torque_achieved: newTorque.torque_achieved || null,
        remarks: newTorque.remarks || null,
      })
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to add torque row.");
      return;
    }

    setTorqueRows((prev) => [...prev, data as TorqueRow].sort((a, b) => (a.item_no ?? 0) - (b.item_no ?? 0)));
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
    const ok = window.confirm("Delete this torque row?");
    if (!ok) return;

    const { error } = await supabase.from("tower_itc_torque").delete().eq("id", id);
    if (error) {
      alert(error.message || "Failed to delete torque row.");
      return;
    }

    setTorqueRows((prev) => prev.filter((row) => row.id !== id));
  }

  async function uploadClientItc() {
    if (!clientFile) {
      alert("Please choose a file.");
      return;
    }

    setUploadingClient(true);

    const safeName = clientFile.name.replace(/\s+/g, "-");
    const path = `${projectId}/${towerId}/${Date.now()}-${safeName}`;

    const storageRes = await supabase.storage.from("itc-files").upload(path, clientFile, {
      upsert: true,
    });

    if (storageRes.error) {
      setUploadingClient(false);
      alert(storageRes.error.message || "Failed to upload file.");
      return;
    }

    const { data: publicUrlData } = supabase.storage.from("itc-files").getPublicUrl(path);

    const { error, data } = await supabase
      .from("tower_itc_client_uploads")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        title: clientTitle || clientFile.name,
        revision: clientRevision || null,
        status: clientStatus || "Uploaded",
        comments: clientComments || null,
        file_name: clientFile.name,
        file_url: publicUrlData.publicUrl,
      })
      .select("*")
      .single();

    setUploadingClient(false);

    if (error) {
      alert(error.message || "Failed to save client ITC record.");
      return;
    }

    setClientUploads((prev) => [data as ClientItcUpload, ...prev]);
    setClientTitle("");
    setClientRevision("");
    setClientStatus("Uploaded");
    setClientComments("");
    setClientFile(null);

    const fileInput = document.getElementById("client-itc-file") as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  }

  async function updateClientUpload(id: string, patch: Partial<ClientItcUpload>) {
    const { error, data } = await supabase
      .from("tower_itc_client_uploads")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      alert(error.message || "Failed to update client ITC record.");
      return;
    }

    setClientUploads((prev) => prev.map((row) => (row.id === id ? (data as ClientItcUpload) : row)));
  }

  async function saveSignoff() {
    const doc = await ensureItcDocument();
    if (!doc) return;

    setSavingSignoff(true);

    const { error, data } = await supabase
      .from("tower_itc_documents")
      .update({
        subcontractor_name: doc.subcontractor_name ?? "",
        subcontractor_signed_at: doc.subcontractor_signed_at ?? null,
        ugl_supervisor_name: doc.ugl_supervisor_name ?? "",
        ugl_supervisor_signed_at: doc.ugl_supervisor_signed_at ?? null,
        project_engineer_name: doc.project_engineer_name ?? "",
        project_engineer_signed_at: doc.project_engineer_signed_at ?? null,
        transgrid_rep_name: doc.transgrid_rep_name ?? "",
        transgrid_rep_signed_at: doc.transgrid_rep_signed_at ?? null,
        status: overallReady ? "Submitted" : doc.status ?? "Draft",
      })
      .eq("id", doc.id)
      .select("*")
      .single();

    setSavingSignoff(false);

    if (error) {
      alert(error.message || "Failed to save sign-off.");
      return;
    }

    setItcDoc(data as ItcDocument);
    alert("Sign-off section saved.");
  }

  const defectsSummary = useMemo(() => {
    const total = defects.length;
    const closed = defects.filter((row) => isClosedLike(getRowStatus(row))).length;
    const open = total - closed;
    return {
      total,
      closed,
      open,
      complete: total === 0 || open === 0,
    };
  }, [defects]);

  const deliveriesSummary = useMemo(() => {
    const total = deliveries.length;
    const complete = deliveries.filter((row) => isDeliveredLike(getRowStatus(row))).length;
    const pending = total - complete;
    return {
      total,
      complete,
      pending,
      allDelivered: total === 0 || pending === 0,
    };
  }, [deliveries]);

  const modificationsSummary = useMemo(() => {
    return {
      total: modifications.length,
      complete: true,
    };
  }, [modifications]);

  const docketSummary = useMemo(() => {
    return {
      exists: !!latestDate,
      complete: !!latestDate,
    };
  }, [latestDate]);

  const torqueSummary = useMemo(() => {
    const total = torqueRows.length;
    const complete = torqueRows.filter((row) => String(row.torque_achieved || "").trim() !== "").length;
    return {
      total,
      complete,
      done: total > 0 && complete === total,
    };
  }, [torqueRows]);

  const checklistSummary = useMemo(() => {
    const total = itcItems.length;
    const completed = itcItems.filter((item) => item.validation === "Y" || item.validation === "NA").length;
    const failed = itcItems.filter((item) => item.validation === "N").length;
    const pending = total - completed - failed;
    return {
      total,
      completed,
      failed,
      pending,
      done: total > 0 && pending === 0 && failed === 0,
    };
  }, [itcItems]);

  const clientItcSummary = useMemo(() => {
    return {
      total: clientUploads.length,
      present: clientUploads.length > 0,
    };
  }, [clientUploads]);

  const readinessItems = useMemo(
    () => [
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
      {
        label: "BC checklist complete",
        complete: checklistSummary.done,
        detail: `${checklistSummary.completed}/${checklistSummary.total} compliant, ${checklistSummary.failed} failed, ${checklistSummary.pending} pending`,
      },
      {
        label: "Torque sheet complete",
        complete: torqueSummary.done,
        detail:
          torqueSummary.total > 0
            ? `${torqueSummary.complete}/${torqueSummary.total} rows complete`
            : "No torque rows added yet",
      },
      {
        label: "Client ITC uploaded",
        complete: clientItcSummary.present,
        detail: clientItcSummary.present
          ? `${clientItcSummary.total} uploaded`
          : "No client ITC uploaded yet",
      },
    ],
    [
      checklistSummary.completed,
      checklistSummary.done,
      checklistSummary.failed,
      checklistSummary.pending,
      checklistSummary.total,
      clientItcSummary.present,
      clientItcSummary.total,
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
    ]
  );

  const overallReady = useMemo(() => {
    return (
      docketSummary.complete &&
      defectsSummary.complete &&
      deliveriesSummary.allDelivered &&
      checklistSummary.done &&
      torqueSummary.done
    );
  }, [
    docketSummary.complete,
    defectsSummary.complete,
    deliveriesSummary.allDelivered,
    checklistSummary.done,
    torqueSummary.done,
  ]);

  const sectionItems = useMemo(() => {
    return CHECKLIST_SECTIONS.map((section) => ({
      ...section,
      rows: itcItems.filter((item) => item.section_key === section.key),
    }));
  }, [itcItems]);

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading || !tower) {
    return <div className="p-8">Loading ITC...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />

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
              Combined BC checklist, torque register, client ITC upload, readiness tracking, and sign-off.
            </p>
          </div>

          <div
            className={`inline-flex items-center px-3 py-2 rounded-full border text-sm font-semibold w-fit ${
              overallReady ? badgeClasses("green") : badgeClasses("yellow")
            }`}
          >
            {overallReady ? "Ready for sign-off" : "Attention required"}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-4 xl:grid-cols-7 gap-4">
        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Daily Docket</div>
          <div className="text-lg font-bold">{latestDate || "None"}</div>
          <div className="text-sm text-slate-600 mt-1">Latest tower docket</div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Defects</div>
          <div className="text-2xl font-bold">{defectsSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">
            Open {defectsSummary.open} · Closed {defectsSummary.closed}
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Deliveries</div>
          <div className="text-2xl font-bold">{deliveriesSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">
            Pending {deliveriesSummary.pending} · Complete {deliveriesSummary.complete}
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Modifications</div>
          <div className="text-2xl font-bold">{modificationsSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">Linked to this tower</div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Checklist</div>
          <div className="text-2xl font-bold">{checklistSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">
            Done {checklistSummary.completed} · Pending {checklistSummary.pending}
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Torque Rows</div>
          <div className="text-2xl font-bold">{torqueSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">
            Complete {torqueSummary.complete}/{torqueSummary.total}
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4">
          <div className="text-sm text-slate-500">Client ITC</div>
          <div className="text-2xl font-bold">{clientItcSummary.total}</div>
          <div className="text-sm text-slate-600 mt-1">Uploads recorded</div>
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
          <h2 className="text-xl font-bold">ITC Header / Details</h2>
          <button
            onClick={() => void saveHeaderFields()}
            disabled={savingHeader}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {savingHeader ? "Saving..." : "Save Header"}
          </button>
        </div>

        <div className="grid md:grid-cols-4 gap-4">
          <input
            value={itcDoc?.work_lot_no ?? ""}
            onChange={(e) =>
              setItcDoc((prev) =>
                prev
                  ? { ...prev, work_lot_no: e.target.value }
                  : {
                      id: "",
                      tower_id: towerId,
                      project_id: projectId,
                      work_lot_no: e.target.value,
                    }
              )
            }
            placeholder="Work Lot No."
            className="border rounded-lg p-2"
          />
          <input
            value={itcDoc?.document_no ?? "3200-0645-ME-002"}
            onChange={(e) =>
              setItcDoc((prev) =>
                prev
                  ? { ...prev, document_no: e.target.value }
                  : {
                      id: "",
                      tower_id: towerId,
                      project_id: projectId,
                      document_no: e.target.value,
                    }
              )
            }
            placeholder="Document No."
            className="border rounded-lg p-2"
          />
          <input
            value={itcDoc?.revision ?? "Rev 0"}
            onChange={(e) =>
              setItcDoc((prev) =>
                prev
                  ? { ...prev, revision: e.target.value }
                  : {
                      id: "",
                      tower_id: towerId,
                      project_id: projectId,
                      revision: e.target.value,
                    }
              )
            }
            placeholder="Revision"
            className="border rounded-lg p-2"
          />
          <input
            value={itcDoc?.status ?? "Draft"}
            onChange={(e) =>
              setItcDoc((prev) =>
                prev
                  ? { ...prev, status: e.target.value }
                  : {
                      id: "",
                      tower_id: towerId,
                      project_id: projectId,
                      status: e.target.value,
                    }
              )
            }
            placeholder="Status"
            className="border rounded-lg p-2"
          />

          <input
            value={itcDoc?.structure_number ?? (typeof tower.name === "string" ? tower.name : "")}
            onChange={(e) =>
              setItcDoc((prev) =>
                prev
                  ? { ...prev, structure_number: e.target.value }
                  : {
                      id: "",
                      tower_id: towerId,
                      project_id: projectId,
                      structure_number: e.target.value,
                    }
              )
            }
            placeholder="Structure Number"
            className="border rounded-lg p-2"
          />
          <input
            value={itcDoc?.structure_type ?? ""}
            onChange={(e) =>
              setItcDoc((prev) =>
                prev
                  ? { ...prev, structure_type: e.target.value }
                  : {
                      id: "",
                      tower_id: towerId,
                      project_id: projectId,
                      structure_type: e.target.value,
                    }
              )
            }
            placeholder="Structure Type"
            className="border rounded-lg p-2"
          />
          <input
            value={itcDoc?.structure_height ?? ""}
            onChange={(e) =>
              setItcDoc((prev) =>
                prev
                  ? { ...prev, structure_height: e.target.value }
                  : {
                      id: "",
                      tower_id: towerId,
                      project_id: projectId,
                      structure_height: e.target.value,
                    }
              )
            }
            placeholder="Structure Height"
            className="border rounded-lg p-2"
          />
          <input
            value={itcDoc?.structure_weight ?? ""}
            onChange={(e) =>
              setItcDoc((prev) =>
                prev
                  ? { ...prev, structure_weight: e.target.value }
                  : {
                      id: "",
                      tower_id: towerId,
                      project_id: projectId,
                      structure_weight: e.target.value,
                    }
              )
            }
            placeholder="Structure Weight"
            className="border rounded-lg p-2"
          />
        </div>
      </div>

      {sectionItems.map((section) => (
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

              <div className="space-y-4">
                {section.rows.map((item) => (
                  <div key={item.id} className="border rounded-xl p-4">
                    <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
                      <div className="xl:w-[40%]">
                        <div className="font-semibold">
                          {item.item_no}. {item.description}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">
                          Responsibility: {item.responsible_role || "LH"}
                        </div>
                      </div>

                      <div className="xl:w-[60%] grid md:grid-cols-4 gap-3">
                        <select
                          value={item.validation}
                          onChange={(e) => setItemLocal(item.id, { validation: e.target.value as ItcItem["validation"] })}
                          className="border rounded-lg p-2"
                        >
                          <option value="">Validation</option>
                          <option value="Y">Y</option>
                          <option value="N">N</option>
                          <option value="NA">NA</option>
                        </select>

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

                    <div className="mt-3 flex flex-col md:flex-row gap-3">
                      <input
                        value={item.notes ?? ""}
                        onChange={(e) => setItemLocal(item.id, { notes: e.target.value })}
                        placeholder="Notes / comments"
                        className="border rounded-lg p-2 flex-1"
                      />
                      <button
                        onClick={() => void saveItem(item.id)}
                        className="border px-4 py-2 rounded-lg hover:bg-slate-50"
                      >
                        Save Row
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                {section.key === "preparation" && (
                  <textarea
                    value={itcDoc?.comments_preparation ?? ""}
                    onChange={(e) =>
                      setItcDoc((prev) => (prev ? { ...prev, comments_preparation: e.target.value } : prev))
                    }
                    placeholder="Preparation comments"
                    className="border rounded-xl p-3 min-h-[110px]"
                  />
                )}
                {section.key === "assembly" && (
                  <textarea
                    value={itcDoc?.comments_assembly ?? ""}
                    onChange={(e) =>
                      setItcDoc((prev) => (prev ? { ...prev, comments_assembly: e.target.value } : prev))
                    }
                    placeholder="Assembly / erection comments"
                    className="border rounded-xl p-3 min-h-[110px]"
                  />
                )}
                {section.key === "final" && (
                  <textarea
                    value={itcDoc?.comments_final ?? ""}
                    onChange={(e) =>
                      setItcDoc((prev) => (prev ? { ...prev, comments_final: e.target.value } : prev))
                    }
                    placeholder="Final comments"
                    className="border rounded-xl p-3 min-h-[110px]"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      ))}

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

      <div className="bg-white border rounded-2xl overflow-hidden">
        <button
          onClick={() => toggleSection("client")}
          className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100 text-left"
        >
          <div>
            <div className="text-lg font-bold">Client ITC Uploads</div>
            <div className="text-sm text-slate-500">
              {clientUploads.length} uploaded record(s)
            </div>
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
                          prev.map((x) => (x.id === row.id ? { ...x, revision: e.target.value } : x))
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
                  value={itcDoc?.subcontractor_name ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, subcontractor_name: e.target.value } : prev))
                  }
                  placeholder="Name"
                  className="border rounded-lg p-2 w-full"
                />
                <input
                  type="date"
                  value={itcDoc?.subcontractor_signed_at ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, subcontractor_signed_at: e.target.value } : prev))
                  }
                  className="border rounded-lg p-2 w-full"
                />
              </div>

              <div className="border rounded-xl p-4 space-y-3">
                <div className="font-semibold">UGL Supervisor</div>
                <input
                  value={itcDoc?.ugl_supervisor_name ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, ugl_supervisor_name: e.target.value } : prev))
                  }
                  placeholder="Name"
                  className="border rounded-lg p-2 w-full"
                />
                <input
                  type="date"
                  value={itcDoc?.ugl_supervisor_signed_at ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, ugl_supervisor_signed_at: e.target.value } : prev))
                  }
                  className="border rounded-lg p-2 w-full"
                />
              </div>

              <div className="border rounded-xl p-4 space-y-3">
                <div className="font-semibold">Project Engineer / Construction Manager</div>
                <input
                  value={itcDoc?.project_engineer_name ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, project_engineer_name: e.target.value } : prev))
                  }
                  placeholder="Name"
                  className="border rounded-lg p-2 w-full"
                />
                <input
                  type="date"
                  value={itcDoc?.project_engineer_signed_at ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, project_engineer_signed_at: e.target.value } : prev))
                  }
                  className="border rounded-lg p-2 w-full"
                />
              </div>

              <div className="border rounded-xl p-4 space-y-3">
                <div className="font-semibold">TransGrid Representative</div>
                <input
                  value={itcDoc?.transgrid_rep_name ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, transgrid_rep_name: e.target.value } : prev))
                  }
                  placeholder="Name"
                  className="border rounded-lg p-2 w-full"
                />
                <input
                  type="date"
                  value={itcDoc?.transgrid_rep_signed_at ?? ""}
                  onChange={(e) =>
                    setItcDoc((prev) => (prev ? { ...prev, transgrid_rep_signed_at: e.target.value } : prev))
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
                  ? "This ITC appears ready for submission/sign-off."
                  : "This ITC still has outstanding items before full sign-off."}
              </div>
              <div className="text-sm text-slate-600 mt-1">
                Status will save as <span className="font-medium">{overallReady ? "Submitted" : (itcDoc?.status || "Draft")}</span>.
              </div>
            </div>

            <button
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
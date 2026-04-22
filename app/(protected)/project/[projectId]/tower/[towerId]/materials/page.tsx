"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Papa, { ParseResult } from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

/* =========================================================
   TYPES
========================================================= */

type DbBundleRow = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string | null;
  qty_required: number | null;
  total_weight: number | null;
};

type Bundle = {
  ui_id: string;
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string;
  qty_required: number;
  total_weight: number | null;
};

type DbMemberRow = {
  id?: string;
  tower_id: string;
  bundle_reference: string;
  drawing_number: string | null;
  mark_no: string;
  pn_final: string | null;
  qty_per_tower: number | null;
  section: string | null;
};

type Member = {
  ui_id: string;
  id?: string;
  tower_id: string;
  bundle_reference: string;
  drawing_number: string;
  mark_no: string;
  pn_final: string;
  qty_per_tower: number;
  section: string;
};

type DeliveryItem = {
  bundle_no: string;
  qty_delivered: number;
};

type Delivery = {
  tower_bundle_delivery_items: DeliveryItem[];
};

type BundleCheckStatus = "not_checked" | "arrived" | "partial" | "missing" | "issue";
type MemberCheckStatus = "not_checked" | "arrived" | "not_here" | "missing" | "issue";

type DbBundleCheckRow = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  status: BundleCheckStatus;
  notes: string | null;
  checked_by: string | null;
  checked_at: string | null;
};

type BundleCheck = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  status: BundleCheckStatus;
  notes: string;
  checked_by: string;
  checked_at: string | null;
};

type DbMemberCheckRow = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  mark_no: string;
  status: MemberCheckStatus;
  notes: string | null;
  checked_by: string | null;
  checked_at: string | null;
};

type MemberCheck = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  mark_no: string;
  status: MemberCheckStatus;
  notes: string;
  checked_by: string;
  checked_at: string | null;
};

type SegmentTotals = {
  required: number;
  delivered: number;
  remaining: number;
  progress: number;
};

type ViewMode = "bundles" | "members" | "crosscheck";
type StatusFilter =
  | "all"
  | "not_checked"
  | "arrived"
  | "partial"
  | "missing"
  | "not_here"
  | "issue";

type TowerRecord = {
  id: string;
  project_id?: string | null;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  extra_data?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type CsvRow = Record<string, string | undefined>;

type BundleImportRow = {
  tower_id: string;
  bundle_no: string;
  section: string;
  qty_required: number;
  total_weight: number | null;
};

type MemberImportRow = {
  tower_id: string;
  bundle_reference: string;
  drawing_number: string;
  mark_no: string;
  pn_final: string;
  qty_per_tower: number;
  section: string;
};

/* =========================================================
   HELPERS
========================================================= */

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normaliseSection(value: string): string {
  const trimmed = value.trim();
  return trimmed === "" ? "General" : trimmed;
}

function makeUiId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normaliseSearch(value: string): string {
  return value.trim().toLowerCase();
}

function statusLabel(status: BundleCheckStatus | MemberCheckStatus): string {
  switch (status) {
    case "arrived":
      return "Arrived";
    case "partial":
      return "Partially Here";
    case "missing":
      return "Missing";
    case "not_here":
      return "Not Here";
    case "issue":
      return "Issue / Review";
    case "not_checked":
    default:
      return "Not Checked";
  }
}

function statusClasses(status: BundleCheckStatus | MemberCheckStatus): string {
  switch (status) {
    case "arrived":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "partial":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "missing":
      return "bg-rose-100 text-rose-700 border-rose-200";
    case "not_here":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "issue":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "not_checked":
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function csvEscape(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function matchesText(...values: Array<string | number | null | undefined>) {
  const joined = values
    .map((v) => (v === null || v === undefined ? "" : String(v)))
    .join(" ")
    .toLowerCase();
  return joined;
}

/* =========================================================
   PAGE
========================================================= */

export default function MaterialsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = createSupabaseBrowser();

  const [tower, setTower] = useState<TowerRecord | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [bundleChecks, setBundleChecks] = useState<BundleCheck[]>([]);
  const [memberChecks, setMemberChecks] = useState<MemberCheck[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("bundles");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [manageMode, setManageMode] = useState(false);

  const [expandedBundles, setExpandedBundles] = useState<Record<string, boolean>>({});
  const [selectedBundleRows, setSelectedBundleRows] = useState<Record<string, boolean>>({});
  const [selectedMemberRows, setSelectedMemberRows] = useState<Record<string, boolean>>({});

  const [bundleImporting, setBundleImporting] = useState(false);
  const [memberImporting, setMemberImporting] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* =========================================================
     LOAD
  ========================================================= */

  useEffect(() => {
    void load();
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [towerId]);

  async function load() {
    setLoading(true);

    const [
      towerRes,
      bundlesRes,
      membersRes,
      deliveriesRes,
      docketRes,
      bundleChecksRes,
      memberChecksRes,
    ] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_required_bundles")
        .select("*")
        .eq("tower_id", towerId)
        .order("section", { ascending: true })
        .order("bundle_no", { ascending: true }),
      supabase
        .from("tower_material_members")
        .select("*")
        .eq("tower_id", towerId)
        .order("section", { ascending: true })
        .order("bundle_reference", { ascending: true })
        .order("mark_no", { ascending: true }),
      supabase
        .from("tower_bundle_deliveries")
        .select("tower_bundle_delivery_items(*)")
        .eq("tower_id", towerId),
      supabase
        .from("tower_daily_dockets")
        .select("docket_date")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false })
        .limit(1),
      supabase
        .from("tower_material_bundle_checks")
        .select("*")
        .eq("tower_id", towerId),
      supabase
        .from("tower_material_member_checks")
        .select("*")
        .eq("tower_id", towerId),
    ]);

    if (towerRes.error) console.error("tower load error", towerRes.error);
    if (bundlesRes.error) console.error("bundles load error", bundlesRes.error);
    if (membersRes.error) console.error("members load error", membersRes.error);
    if (deliveriesRes.error) console.error("deliveries load error", deliveriesRes.error);
    if (docketRes.error) console.error("dockets load error", docketRes.error);
    if (bundleChecksRes.error) console.error("bundle checks load error", bundleChecksRes.error);
    if (memberChecksRes.error) console.error("member checks load error", memberChecksRes.error);

    setTower((towerRes.data as TowerRecord | null) || null);
    setLatestDate(docketRes.data?.[0]?.docket_date || null);

    const loadedBundles: Bundle[] = ((bundlesRes.data || []) as DbBundleRow[]).map((row) => ({
      ui_id: makeUiId(),
      id: row.id,
      tower_id: towerId,
      bundle_no: safeString(row.bundle_no),
      section: normaliseSection(safeString(row.section, "General")),
      qty_required: safeNumber(row.qty_required, 0),
      total_weight:
        row.total_weight === null || row.total_weight === undefined
          ? null
          : safeNumber(row.total_weight, 0),
    }));

    const loadedMembers: Member[] = ((membersRes.data || []) as DbMemberRow[]).map((row) => ({
      ui_id: makeUiId(),
      id: row.id,
      tower_id: towerId,
      bundle_reference: safeString(row.bundle_reference),
      drawing_number: safeString(row.drawing_number),
      mark_no: safeString(row.mark_no),
      pn_final: safeString(row.pn_final),
      qty_per_tower: safeNumber(row.qty_per_tower, 0),
      section: normaliseSection(safeString(row.section, "General")),
    }));

    const loadedBundleChecks: BundleCheck[] = ((bundleChecksRes.data || []) as DbBundleCheckRow[]).map(
      (row) => ({
        id: row.id,
        tower_id: row.tower_id,
        bundle_no: row.bundle_no,
        status: row.status || "not_checked",
        notes: safeString(row.notes),
        checked_by: safeString(row.checked_by),
        checked_at: row.checked_at || null,
      })
    );

    const loadedMemberChecks: MemberCheck[] = ((memberChecksRes.data || []) as DbMemberCheckRow[]).map(
      (row) => ({
        id: row.id,
        tower_id: row.tower_id,
        bundle_no: row.bundle_no,
        mark_no: row.mark_no,
        status: row.status || "not_checked",
        notes: safeString(row.notes),
        checked_by: safeString(row.checked_by),
        checked_at: row.checked_at || null,
      })
    );

    setBundles(loadedBundles);
    setMembers(loadedMembers);
    setBundleChecks(loadedBundleChecks);
    setMemberChecks(loadedMemberChecks);
    setDeliveries((deliveriesRes.data || []) as Delivery[]);
    setLoading(false);
  }

  /* =========================================================
     DELIVERY CALCS
  ========================================================= */

  function deliveredQty(bundleNo: string): number {
    let total = 0;

    deliveries.forEach((delivery) => {
      delivery.tower_bundle_delivery_items.forEach((item) => {
        if (safeString(item.bundle_no).trim() === bundleNo.trim()) {
          total += safeNumber(item.qty_delivered, 0);
        }
      });
    });

    return total;
  }

  function remainingQty(bundle: Bundle): number {
    return Math.max(bundle.qty_required - deliveredQty(bundle.bundle_no), 0);
  }

  function getSegmentTotals(rows: Bundle[]): SegmentTotals {
    const required = rows.reduce((sum, row) => sum + safeNumber(row.qty_required, 0), 0);
    const delivered = rows.reduce((sum, row) => sum + deliveredQty(row.bundle_no), 0);
    const remaining = Math.max(required - delivered, 0);
    const progress = required > 0 ? (delivered / required) * 100 : 0;

    return {
      required,
      delivered,
      remaining,
      progress,
    };
  }

  /* =========================================================
     LOOKUPS
  ========================================================= */

  const membersByBundle = useMemo(() => {
    const map: Record<string, Member[]> = {};
    members.forEach((member) => {
      const key = member.bundle_reference.trim();
      if (!map[key]) map[key] = [];
      map[key].push(member);
    });
    return map;
  }, [members]);

  const bundleMap = useMemo(() => {
    const map: Record<string, Bundle> = {};
    bundles.forEach((bundle) => {
      map[bundle.bundle_no.trim()] = bundle;
    });
    return map;
  }, [bundles]);

  const bundleCheckMap = useMemo(() => {
    const map: Record<string, BundleCheck> = {};
    bundleChecks.forEach((check) => {
      map[check.bundle_no.trim()] = check;
    });
    return map;
  }, [bundleChecks]);

  const memberCheckMap = useMemo(() => {
    const map: Record<string, MemberCheck> = {};
    memberChecks.forEach((check) => {
      map[`${check.bundle_no.trim()}__${check.mark_no.trim()}`] = check;
    });
    return map;
  }, [memberChecks]);

  const allSections = useMemo(() => {
    const set = new Set<string>();
    bundles.forEach((b) => set.add(normaliseSection(b.section)));
    members.forEach((m) => set.add(normaliseSection(m.section)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bundles, members]);

  function getMemberCheck(member: Member): MemberCheck | undefined {
    return memberCheckMap[`${member.bundle_reference.trim()}__${member.mark_no.trim()}`];
  }

  function deriveBundleStatus(bundleNo: string): BundleCheckStatus {
    const manual = bundleCheckMap[bundleNo.trim()];
    const relatedMembers = membersByBundle[bundleNo.trim()] || [];

    if (relatedMembers.length === 0) {
      return manual?.status || "not_checked";
    }

    const statuses = relatedMembers.map((member) => getMemberCheck(member)?.status || "not_checked");

    const arrivedCount = statuses.filter((s) => s === "arrived").length;
    const missingCount = statuses.filter((s) => s === "missing").length;
    const notHereCount = statuses.filter((s) => s === "not_here").length;
    const issueCount = statuses.filter((s) => s === "issue").length;
    const notCheckedCount = statuses.filter((s) => s === "not_checked").length;

    if (issueCount > 0) return "issue";
    if (arrivedCount === statuses.length && statuses.length > 0) return "arrived";
    if (missingCount === statuses.length && statuses.length > 0) return "missing";
    if (arrivedCount > 0 && arrivedCount < statuses.length) return "partial";
    if (notHereCount > 0 && arrivedCount === 0 && missingCount === 0 && notCheckedCount === 0) {
      return "partial";
    }
    if (arrivedCount > 0 || missingCount > 0 || notHereCount > 0) return "partial";

    return manual?.status || "not_checked";
  }

  function bundleMatchesStatus(bundleNo: string, filter: StatusFilter): boolean {
    if (filter === "all") return true;
    const derived = deriveBundleStatus(bundleNo);
    return derived === filter;
  }

  function memberMatchesStatus(member: Member, filter: StatusFilter): boolean {
    if (filter === "all") return true;
    const status = getMemberCheck(member)?.status || "not_checked";
    return status === filter;
  }

  /* =========================================================
     AUTO SAVE FOR BUNDLES
  ========================================================= */

  function scheduleAutoSave(nextRows: Bundle[]) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      void persistBundles(nextRows);
    }, 1000);
  }

  async function persistBundles(rows: Bundle[]) {
    const payload = rows
      .filter((row) => row.bundle_no.trim() !== "")
      .map((row) => ({
        tower_id: towerId,
        bundle_no: row.bundle_no.trim(),
        section: normaliseSection(row.section),
        qty_required: safeNumber(row.qty_required, 0),
        total_weight:
          row.total_weight === null || row.total_weight === undefined
            ? null
            : safeNumber(row.total_weight, 0),
      }));

    setSaving(true);

    if (payload.length > 0) {
      const { error } = await supabase.from("tower_required_bundles").upsert(payload, {
        onConflict: "tower_id,bundle_no",
      });

      if (error) {
        console.error("bundle auto save error", error);
      }
    }

    setSaving(false);
  }

  async function persistMembers(rows: Member[]) {
    const payload = rows
      .filter((row) => row.mark_no.trim() !== "")
      .map((row) => ({
        tower_id: towerId,
        bundle_reference: row.bundle_reference.trim(),
        drawing_number: safeString(row.drawing_number),
        mark_no: row.mark_no.trim(),
        pn_final: safeString(row.pn_final),
        qty_per_tower: safeNumber(row.qty_per_tower, 0),
        section: normaliseSection(row.section),
      }));

    setSaving(true);

    if (payload.length > 0) {
      const { error } = await supabase.from("tower_material_members").upsert(payload, {
        onConflict: "tower_id,bundle_reference,mark_no",
      });

      if (error) {
        console.error("member save error", error);
      }
    }

    setSaving(false);
  }

  /* =========================================================
     BUNDLE ACTIONS
  ========================================================= */

  function addBundleRow() {
    setBundles((prev) => [
      ...prev,
      {
        ui_id: makeUiId(),
        tower_id: towerId,
        bundle_no: "",
        section: "General",
        qty_required: 0,
        total_weight: null,
      },
    ]);
  }

  function updateBundleRow(ui_id: string, field: keyof Bundle, value: string | number | null) {
    setBundles((prev) => {
      const next = prev.map((row) => {
        if (row.ui_id !== ui_id) return row;
        return {
          ...row,
          [field]: value,
        };
      });
      scheduleAutoSave(next);
      return next;
    });
  }

  async function deleteSelectedBundles() {
    const selected = bundles.filter((row) => selectedBundleRows[row.ui_id]);
    if (!selected.length) {
      alert("No bundle rows selected.");
      return;
    }

    const confirmed = window.confirm(`Delete ${selected.length} selected bundle row(s)?`);
    if (!confirmed) return;

    for (const row of selected) {
      if (row.bundle_no.trim() !== "") {
        const { error } = await supabase
          .from("tower_required_bundles")
          .delete()
          .eq("tower_id", towerId)
          .eq("bundle_no", row.bundle_no.trim());

        if (error) {
          console.error("delete bundle error", error);
        }
      }
    }

    setSelectedBundleRows({});
    await load();
  }

  /* =========================================================
     MEMBER ACTIONS
  ========================================================= */

  function addMemberRow() {
    setMembers((prev) => [
      ...prev,
      {
        ui_id: makeUiId(),
        tower_id: towerId,
        bundle_reference: "",
        drawing_number: "",
        mark_no: "",
        pn_final: "",
        qty_per_tower: 0,
        section: "General",
      },
    ]);
  }

  function updateMemberRow(ui_id: string, field: keyof Member, value: string | number) {
    setMembers((prev) =>
      prev.map((row) => {
        if (row.ui_id !== ui_id) return row;
        return {
          ...row,
          [field]: value,
        };
      })
    );
  }

  async function saveMembersNow() {
    await persistMembers(members);
    alert("Members saved.");
    await load();
  }

  async function deleteSelectedMembers() {
    const selected = members.filter((row) => selectedMemberRows[row.ui_id]);
    if (!selected.length) {
      alert("No member rows selected.");
      return;
    }

    const confirmed = window.confirm(`Delete ${selected.length} selected member row(s)?`);
    if (!confirmed) return;

    for (const row of selected) {
      if (row.mark_no.trim() !== "") {
        const { error } = await supabase
          .from("tower_material_members")
          .delete()
          .eq("tower_id", towerId)
          .eq("bundle_reference", row.bundle_reference.trim())
          .eq("mark_no", row.mark_no.trim());

        if (error) {
          console.error("delete member error", error);
        }
      }
    }

    setSelectedMemberRows({});
    await load();
  }

  /* =========================================================
     CHECK ACTIONS
  ========================================================= */

  async function updateMemberStatus(member: Member, status: MemberCheckStatus, notes?: string) {
    const payload = {
      tower_id: towerId,
      bundle_no: member.bundle_reference.trim(),
      mark_no: member.mark_no.trim(),
      status,
      notes: notes ?? getMemberCheck(member)?.notes ?? "",
      checked_by: "Site Check",
      checked_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("tower_material_member_checks").upsert(payload, {
      onConflict: "tower_id,bundle_no,mark_no",
    });

    if (error) {
      console.error("member status save error", error);
      alert("Failed to save member check.");
      return;
    }

    setMemberChecks((prev) => {
      const key = `${payload.bundle_no}__${payload.mark_no}`;
      const next = prev.filter(
        (row) => `${row.bundle_no.trim()}__${row.mark_no.trim()}` !== key
      );
      next.push(payload);
      return next;
    });

    await saveDerivedBundleStatus(payload.bundle_no);
  }

  async function updateBundleManualStatus(bundleNo: string, status: BundleCheckStatus, notes = "") {
    const payload = {
      tower_id: towerId,
      bundle_no: bundleNo.trim(),
      status,
      notes,
      checked_by: "Site Check",
      checked_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("tower_material_bundle_checks").upsert(payload, {
      onConflict: "tower_id,bundle_no",
    });

    if (error) {
      console.error("bundle check save error", error);
      alert("Failed to save bundle status.");
      return;
    }

    setBundleChecks((prev) => {
      const next = prev.filter((row) => row.bundle_no.trim() !== payload.bundle_no);
      next.push(payload);
      return next;
    });
  }

  async function saveDerivedBundleStatus(bundleNo: string) {
    const derived = deriveBundleStatus(bundleNo);

    const payload = {
      tower_id: towerId,
      bundle_no: bundleNo.trim(),
      status: derived,
      notes: bundleCheckMap[bundleNo.trim()]?.notes || "",
      checked_by: "Site Check",
      checked_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("tower_material_bundle_checks").upsert(payload, {
      onConflict: "tower_id,bundle_no",
    });

    if (error) {
      console.error("derived bundle status save error", error);
      return;
    }

    setBundleChecks((prev) => {
      const next = prev.filter((row) => row.bundle_no.trim() !== payload.bundle_no);
      next.push(payload);
      return next;
    });
  }

  async function markWholeBundle(bundleNo: string, status: MemberCheckStatus) {
    const relatedMembers = membersByBundle[bundleNo.trim()] || [];
    if (!relatedMembers.length) {
      await updateBundleManualStatus(
        bundleNo,
        status === "arrived" ? "arrived" : status === "missing" ? "missing" : "partial"
      );
      return;
    }

    const now = new Date().toISOString();
    const payload = relatedMembers.map((member) => ({
      tower_id: towerId,
      bundle_no: bundleNo.trim(),
      mark_no: member.mark_no.trim(),
      status,
      notes: getMemberCheck(member)?.notes || "",
      checked_by: "Site Check",
      checked_at: now,
    }));

    const { error } = await supabase.from("tower_material_member_checks").upsert(payload, {
      onConflict: "tower_id,bundle_no,mark_no",
    });

    if (error) {
      console.error("whole bundle check save error", error);
      alert("Failed to update whole bundle.");
      return;
    }

    setMemberChecks((prev) => {
      const next = prev.filter((row) => row.bundle_no.trim() !== bundleNo.trim());
      return [...next, ...payload];
    });

    await saveDerivedBundleStatus(bundleNo);
  }

  /* =========================================================
     IMPORTS
  ========================================================= */

  async function importBundlesCSV(file: File) {
    setBundleImporting(true);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res: ParseResult<CsvRow>) => {
        const rows = res.data
          .map((r): BundleImportRow | null => {
            const bundleNo =
              r.bundle_no ||
              r["Bundle No"] ||
              r["Bundle Number"] ||
              r.bundle ||
              r["Bundle Reference"];

            if (!bundleNo) return null;

            return {
              tower_id: towerId,
              bundle_no: String(bundleNo).trim(),
              section: normaliseSection(
                safeString(r.section || r["Section"] || r["Bundle Group"] || "General")
              ),
              qty_required: safeNumber(
                r.qty_required ||
                  r["Qty Required"] ||
                  r["Qty/Tower"] ||
                  r["Quantity of Bundles For Tower"] ||
                  r["NO."] ||
                  0,
                0
              ),
              total_weight: (() => {
                const n = Number(
                  r.total_weight || r["Total Weight"] || r["Bundle Mass"] || r["Bundle Weight"]
                );
                return Number.isFinite(n) ? n : null;
              })(),
            };
          })
          .filter((row): row is BundleImportRow => row !== null);

        if (!rows.length) {
          alert("No valid bundle rows found in CSV.");
          setBundleImporting(false);
          return;
        }

        const { error } = await supabase.from("tower_required_bundles").upsert(rows, {
          onConflict: "tower_id,bundle_no",
        });

        setBundleImporting(false);

        if (error) {
          console.error("bundle import error", error);
          alert("Bundle CSV import failed.");
          return;
        }

        await load();
        alert("Bundle CSV imported.");
      },
      error: (err) => {
        console.error("bundle parse error", err);
        setBundleImporting(false);
        alert("Failed to parse bundle CSV.");
      },
    });
  }

  async function importMembersCSV(file: File) {
    setMemberImporting(true);

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (res: ParseResult<CsvRow>) => {
        const rows = res.data
          .map((r): MemberImportRow | null => {
            const markNo = r.mark_no || r["Mark No"] || r.mark || r["Member Mark"];
            const bundleReference =
              r.bundle_reference || r["Bundle Reference"] || r.bundle_no || r["Bundle No"];

            if (!markNo || !bundleReference) return null;

            return {
              tower_id: towerId,
              bundle_reference: String(bundleReference).trim(),
              drawing_number: safeString(r.drawing_number || r["Drawing Number"]),
              mark_no: String(markNo).trim(),
              pn_final: safeString(r.pn_final || r["Standardised PN FINAL"] || r["PN"]),
              qty_per_tower: safeNumber(r.qty_per_tower || r["Qty/Tower"] || r["Qty"] || 0, 0),
              section: normaliseSection(safeString(r.section || r["Section"] || "General")),
            };
          })
          .filter((row): row is MemberImportRow => row !== null);

        if (!rows.length) {
          alert("No valid member rows found in CSV.");
          setMemberImporting(false);
          return;
        }

        const { error } = await supabase.from("tower_material_members").upsert(rows, {
          onConflict: "tower_id,bundle_reference,mark_no",
        });

        setMemberImporting(false);

        if (error) {
          console.error("member import error", error);
          alert("Member CSV import failed.");
          return;
        }

        await load();
        alert("Members CSV imported.");
      },
      error: (err) => {
        console.error("member parse error", err);
        setMemberImporting(false);
        alert("Failed to parse members CSV.");
      },
    });
  }

  /* =========================================================
     SAVE BUTTONS
  ========================================================= */

  async function saveBundlesNow() {
    await persistBundles(bundles);
    alert("Bundle register saved.");
    await load();
  }

  /* =========================================================
     FILTERED DATA
  ========================================================= */

  const filteredBundles = useMemo(() => {
    const q = normaliseSearch(search);

    return bundles.filter((bundle) => {
      if (sectionFilter !== "all" && bundle.section !== sectionFilter) return false;
      if (!bundleMatchesStatus(bundle.bundle_no, statusFilter)) return false;

      if (!q) return true;

      const text = matchesText(
        bundle.bundle_no,
        bundle.section,
        bundle.qty_required,
        bundle.total_weight,
        deliveredQty(bundle.bundle_no),
        ...((membersByBundle[bundle.bundle_no.trim()] || []).map((m) =>
          [m.mark_no, m.pn_final, m.drawing_number].join(" ")
        ) as string[])
      );

      return text.includes(q);
    });
  }, [bundles, search, sectionFilter, statusFilter, membersByBundle, deliveries]);

  const filteredMembers = useMemo(() => {
    const q = normaliseSearch(search);

    return members.filter((member) => {
      if (sectionFilter !== "all" && member.section !== sectionFilter) return false;
      if (!memberMatchesStatus(member, statusFilter)) return false;

      if (!q) return true;

      const text = matchesText(
        member.mark_no,
        member.pn_final,
        member.drawing_number,
        member.bundle_reference,
        member.section,
        member.qty_per_tower
      );

      return text.includes(q);
    });
  }, [members, search, sectionFilter, statusFilter, memberCheckMap]);

  const missingMemberRows = useMemo(() => {
    return members.filter((member) => !bundleMap[member.bundle_reference.trim()]);
  }, [members, bundleMap]);

  const bundlesWithoutMembers = useMemo(() => {
    return bundles.filter((bundle) => (membersByBundle[bundle.bundle_no.trim()] || []).length === 0);
  }, [bundles, membersByBundle]);

  const duplicateMemberMap = useMemo(() => {
    const countMap: Record<string, number> = {};
    members.forEach((member) => {
      const key = member.mark_no.trim();
      countMap[key] = (countMap[key] || 0) + 1;
    });
    return countMap;
  }, [members]);

  const duplicateMembers = useMemo(() => {
    return members.filter((member) => duplicateMemberMap[member.mark_no.trim()] > 1);
  }, [members, duplicateMemberMap]);

  const overallRequired = useMemo(
    () => bundles.reduce((sum, row) => sum + safeNumber(row.qty_required, 0), 0),
    [bundles]
  );

  const overallDelivered = useMemo(
    () => bundles.reduce((sum, row) => sum + deliveredQty(row.bundle_no), 0),
    [bundles, deliveries]
  );

  const overallRemaining = Math.max(overallRequired - overallDelivered, 0);
  const overallProgress = overallRequired > 0 ? (overallDelivered / overallRequired) * 100 : 0;

  const totalBundleWeight = useMemo(
    () => bundles.reduce((sum, row) => sum + safeNumber(row.total_weight, 0), 0),
    [bundles]
  );

  const bundleStatusCounts = useMemo(() => {
    return bundles.reduce(
      (acc, bundle) => {
        const status = deriveBundleStatus(bundle.bundle_no);
        acc[status] += 1;
        return acc;
      },
      {
        not_checked: 0,
        arrived: 0,
        partial: 0,
        missing: 0,
        issue: 0,
      } as Record<BundleCheckStatus, number>
    );
  }, [bundles, memberChecks, bundleChecks]);

  /* =========================================================
     EXPORT / PRINT
  ========================================================= */

  function exportCurrentViewCSV() {
    if (viewMode === "bundles") {
      const rows = [
        [
          "Bundle No",
          "Section",
          "Qty Required",
          "Delivered",
          "Remaining",
          "Total Weight",
          "Members Count",
          "Status",
        ],
        ...filteredBundles.map((bundle) => [
          bundle.bundle_no,
          bundle.section,
          bundle.qty_required,
          deliveredQty(bundle.bundle_no),
          remainingQty(bundle),
          bundle.total_weight ?? "",
          (membersByBundle[bundle.bundle_no.trim()] || []).length,
          statusLabel(deriveBundleStatus(bundle.bundle_no)),
        ]),
      ];

      const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
      downloadTextFile("materials_bundles.csv", csv, "text/csv;charset=utf-8;");
      return;
    }

    if (viewMode === "members") {
      const rows = [
        ["Mark No", "PN", "Drawing No", "Bundle Reference", "Qty", "Section", "Status"],
        ...filteredMembers.map((member) => [
          member.mark_no,
          member.pn_final,
          member.drawing_number,
          member.bundle_reference,
          member.qty_per_tower,
          member.section,
          statusLabel(getMemberCheck(member)?.status || "not_checked"),
        ]),
      ];

      const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
      downloadTextFile("materials_members.csv", csv, "text/csv;charset=utf-8;");
      return;
    }

    const rows = [
      ["Type", "Reference", "Detail", "Status"],
      ...missingMemberRows.map((row) => [
        "Missing Bundle Match",
        row.mark_no,
        row.bundle_reference,
        "Review",
      ]),
      ...bundlesWithoutMembers.map((row) => [
        "Bundle Without Members",
        row.bundle_no,
        row.section,
        "Review",
      ]),
      ...duplicateMembers.map((row) => [
        "Duplicate Member",
        row.mark_no,
        row.bundle_reference,
        "Review",
      ]),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadTextFile("materials_crosscheck.csv", csv, "text/csv;charset=utf-8;");
  }

  function printCurrentView() {
    let title = "Materials";
    let bodyHtml = "";

    if (viewMode === "bundles") {
      title = "Bundle List";
      bodyHtml = `
        <table>
          <thead>
            <tr>
              <th>Bundle No</th>
              <th>Section</th>
              <th>Qty Req.</th>
              <th>Delivered</th>
              <th>Remaining</th>
              <th>Weight</th>
              <th>Members</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredBundles
              .map(
                (bundle) => `
              <tr>
                <td>${bundle.bundle_no}</td>
                <td>${bundle.section}</td>
                <td>${bundle.qty_required}</td>
                <td>${deliveredQty(bundle.bundle_no)}</td>
                <td>${remainingQty(bundle)}</td>
                <td>${bundle.total_weight ?? ""}</td>
                <td>${(membersByBundle[bundle.bundle_no.trim()] || []).length}</td>
                <td>${statusLabel(deriveBundleStatus(bundle.bundle_no))}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else if (viewMode === "members") {
      title = "Member List";
      bodyHtml = `
        <table>
          <thead>
            <tr>
              <th>Mark No</th>
              <th>PN</th>
              <th>Drawing No</th>
              <th>Bundle Ref</th>
              <th>Qty</th>
              <th>Section</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredMembers
              .map(
                (member) => `
              <tr>
                <td>${member.mark_no}</td>
                <td>${member.pn_final}</td>
                <td>${member.drawing_number}</td>
                <td>${member.bundle_reference}</td>
                <td>${member.qty_per_tower}</td>
                <td>${member.section}</td>
                <td>${statusLabel(getMemberCheck(member)?.status || "not_checked")}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else {
      title = "Cross Check";
      bodyHtml = `
        <h3>Members with Missing Bundle Match</h3>
        <table>
          <thead><tr><th>Mark No</th><th>Bundle Ref</th><th>Section</th></tr></thead>
          <tbody>
            ${missingMemberRows
              .map(
                (row) => `
                <tr><td>${row.mark_no}</td><td>${row.bundle_reference}</td><td>${row.section}</td></tr>
              `
              )
              .join("")}
          </tbody>
        </table>

        <h3>Bundles Without Members</h3>
        <table>
          <thead><tr><th>Bundle No</th><th>Section</th></tr></thead>
          <tbody>
            ${bundlesWithoutMembers
              .map(
                (row) => `
                <tr><td>${row.bundle_no}</td><td>${row.section}</td></tr>
              `
              )
              .join("")}
          </tbody>
        </table>

        <h3>Duplicate Members</h3>
        <table>
          <thead><tr><th>Mark No</th><th>Bundle Ref</th><th>Section</th></tr></thead>
          <tbody>
            ${duplicateMembers
              .map(
                (row) => `
                <tr><td>${row.mark_no}</td><td>${row.bundle_reference}</td><td>${row.section}</td></tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    const html = `
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1, h3 { margin: 0 0 12px 0; }
            .meta { margin-bottom: 20px; color: #475569; font-size: 12px; }
            table { border-collapse: collapse; width: 100%; margin-bottom: 24px; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 12px; }
            th { background: #f1f5f9; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">Tower materials export • ${new Date().toLocaleString()}</div>
          ${bodyHtml}
        </body>
      </html>
    `;

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  /* =========================================================
     RENDER
  ========================================================= */

  if (loading) {
    return <div className="p-8">Loading materials register...</div>;
  }

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50 min-h-screen">
      {tower && <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />}

      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 border-b border-slate-200 sticky top-0 bg-white z-20">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Materials Register</h1>
                <p className="text-slate-500 mt-1">
                  Search bundles or members, cross-check site delivery, and print filtered lists for the steel chaser.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {saving && (
                  <div className="text-sm text-blue-600 font-medium px-3 py-2 bg-blue-50 rounded-xl border border-blue-100">
                    Saving…
                  </div>
                )}

                <button
                  onClick={printCurrentView}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                >
                  Print
                </button>

                <button
                  onClick={exportCurrentViewCSV}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                >
                  Export CSV
                </button>

                <button
                  onClick={() => setManageMode((prev) => !prev)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border ${
                    manageMode
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-300"
                  }`}
                >
                  {manageMode ? "Exit Manage Mode" : "Manage Data"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(280px,1fr)_auto_auto_auto_auto] gap-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bundle no, member mark, PN, drawing no..."
                className="w-full border border-slate-300 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="grid grid-cols-3 bg-slate-100 rounded-2xl p-1">
                <ModeButton
                  active={viewMode === "bundles"}
                  onClick={() => setViewMode("bundles")}
                  label="Bundles"
                />
                <ModeButton
                  active={viewMode === "members"}
                  onClick={() => setViewMode("members")}
                  label="Members"
                />
                <ModeButton
                  active={viewMode === "crosscheck"}
                  onClick={() => setViewMode("crosscheck")}
                  label="Cross Check"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="border border-slate-300 rounded-2xl px-4 py-3 text-sm bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="not_checked">Not Checked</option>
                <option value="arrived">Arrived</option>
                <option value="partial">Partially Here</option>
                <option value="missing">Missing</option>
                <option value="not_here">Not Here</option>
                <option value="issue">Issue / Review</option>
              </select>

              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="border border-slate-300 rounded-2xl px-4 py-3 text-sm bg-white"
              >
                <option value="all">All Sections</option>
                {allSections.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>

              <div className="flex gap-2 flex-wrap">
                <label className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-medium cursor-pointer">
                  {bundleImporting ? "Uploading Bundles..." : "Reupload Bundles"}
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importBundlesCSV(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>

                <label className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-medium cursor-pointer">
                  {memberImporting ? "Uploading Members..." : "Reupload Members"}
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void importMembersCSV(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
            </div>

            {manageMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div className="text-sm text-amber-800">
                  Manage mode is on. Add, edit, save, or delete rows without cluttering the normal site view.
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={addBundleRow}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium"
                  >
                    Add Bundle
                  </button>

                  <button
                    onClick={addMemberRow}
                    className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium"
                  >
                    Add Member
                  </button>

                  <button
                    onClick={saveBundlesNow}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium"
                  >
                    Save Bundles
                  </button>

                  <button
                    onClick={saveMembersNow}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium"
                  >
                    Save Members
                  </button>

                  <button
                    onClick={deleteSelectedBundles}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium"
                  >
                    Delete Selected Bundles
                  </button>

                  <button
                    onClick={deleteSelectedMembers}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium"
                  >
                    Delete Selected Members
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 md:p-6">
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-6">
            <StatCard label="Bundles" value={bundles.length} />
            <StatCard label="Members" value={members.length} />
            <StatCard label="Total Weight" value={totalBundleWeight.toFixed(2)} />
            <StatCard label="Delivered" value={overallDelivered} />
            <StatCard label="Remaining" value={overallRemaining} />
            <StatCard label="Progress" value={`${overallProgress.toFixed(1)}%`} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <StatusCard label="Not Checked" value={bundleStatusCounts.not_checked} tone="slate" />
            <StatusCard label="Arrived" value={bundleStatusCounts.arrived} tone="green" />
            <StatusCard label="Partial" value={bundleStatusCounts.partial} tone="amber" />
            <StatusCard label="Missing" value={bundleStatusCounts.missing} tone="red" />
            <StatusCard label="Issues" value={bundleStatusCounts.issue} tone="purple" />
          </div>

          {viewMode === "bundles" && (
            <div className="space-y-4">
              {filteredBundles.length === 0 ? (
                <EmptyState text="No bundles match the current filters." />
              ) : (
                filteredBundles.map((bundle) => {
                  const relatedMembers = membersByBundle[bundle.bundle_no.trim()] || [];
                  const status = deriveBundleStatus(bundle.bundle_no);
                  const expanded = !!expandedBundles[bundle.bundle_no];

                  return (
                    <div
                      key={bundle.ui_id}
                      className="border border-slate-200 rounded-3xl bg-white shadow-sm overflow-hidden"
                    >
                      <div className="p-4 md:p-5">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                            <div className="flex items-start gap-3">
                              {manageMode && (
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4"
                                  checked={!!selectedBundleRows[bundle.ui_id]}
                                  onChange={(e) =>
                                    setSelectedBundleRows((prev) => ({
                                      ...prev,
                                      [bundle.ui_id]: e.target.checked,
                                    }))
                                  }
                                />
                              )}

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h2 className="text-lg md:text-xl font-bold">{bundle.bundle_no}</h2>
                                  <span
                                    className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusClasses(
                                      status
                                    )}`}
                                  >
                                    {statusLabel(status)}
                                  </span>
                                </div>

                                <div className="text-sm text-slate-500 mt-1">
                                  {bundle.section} • Qty required {bundle.qty_required} • Delivered{" "}
                                  {deliveredQty(bundle.bundle_no)} • Remaining {remainingQty(bundle)} •
                                  Members {relatedMembers.length}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  setExpandedBundles((prev) => ({
                                    ...prev,
                                    [bundle.bundle_no]: !prev[bundle.bundle_no],
                                  }))
                                }
                                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium"
                              >
                                {expanded ? "Hide Check" : "Open Check"}
                              </button>

                              <button
                                onClick={() => void markWholeBundle(bundle.bundle_no, "arrived")}
                                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium"
                              >
                                Mark Whole Bundle Arrived
                              </button>

                              <button
                                onClick={() => void markWholeBundle(bundle.bundle_no, "missing")}
                                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium"
                              >
                                Mark Whole Bundle Missing
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <MiniStat label="Weight" value={bundle.total_weight ?? "—"} />
                            <MiniStat label="Section" value={bundle.section} />
                            <MiniStat label="Delivered" value={deliveredQty(bundle.bundle_no)} />
                            <MiniStat label="Remaining" value={remainingQty(bundle)} />
                            <MiniStat
                              label="Last Checked"
                              value={formatDateTime(bundleCheckMap[bundle.bundle_no]?.checked_at)}
                            />
                          </div>

                          {manageMode && (
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
                              <Field
                                label="Bundle No"
                                value={bundle.bundle_no}
                                onChange={(v) => updateBundleRow(bundle.ui_id, "bundle_no", v)}
                              />
                              <Field
                                label="Section"
                                value={bundle.section}
                                onChange={(v) => updateBundleRow(bundle.ui_id, "section", v)}
                              />
                              <Field
                                label="Qty Required"
                                value={bundle.qty_required}
                                onChange={(v) =>
                                  updateBundleRow(bundle.ui_id, "qty_required", safeNumber(v, 0))
                                }
                              />
                              <Field
                                label="Total Weight"
                                value={bundle.total_weight ?? ""}
                                onChange={(v) =>
                                  updateBundleRow(
                                    bundle.ui_id,
                                    "total_weight",
                                    v === "" ? null : safeNumber(v, 0)
                                  )
                                }
                              />
                            </div>
                          )}

                          {expanded && (
                            <div className="pt-2 border-t border-slate-200 space-y-3">
                              {relatedMembers.length === 0 ? (
                                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                                  No linked members found for this bundle. It can still be marked manually,
                                  but the cross-check is stronger once members are uploaded.
                                </div>
                              ) : (
                                relatedMembers.map((member) => {
                                  const memberStatus = getMemberCheck(member)?.status || "not_checked";
                                  return (
                                    <div
                                      key={member.ui_id}
                                      className="border border-slate-200 rounded-2xl p-4 bg-slate-50"
                                    >
                                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                        <div>
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <div className="font-semibold">{member.mark_no}</div>
                                            <span
                                              className={`px-2 py-1 rounded-full text-xs font-medium border ${statusClasses(
                                                memberStatus
                                              )}`}
                                            >
                                              {statusLabel(memberStatus)}
                                            </span>
                                          </div>
                                          <div className="text-sm text-slate-500 mt-1">
                                            PN {member.pn_final || "—"} • Drawing {member.drawing_number || "—"} •
                                            Qty {member.qty_per_tower} • {member.section}
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                          <button
                                            onClick={() => void updateMemberStatus(member, "arrived")}
                                            className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium"
                                          >
                                            Arrived
                                          </button>
                                          <button
                                            onClick={() => void updateMemberStatus(member, "not_here")}
                                            className="px-3 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium"
                                          >
                                            Not Here
                                          </button>
                                          <button
                                            onClick={() => void updateMemberStatus(member, "missing")}
                                            className="px-3 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium"
                                          >
                                            Missing
                                          </button>
                                          <button
                                            onClick={() => void updateMemberStatus(member, "issue")}
                                            className="px-3 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium"
                                          >
                                            Issue
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {viewMode === "members" && (
            <div className="space-y-3">
              {filteredMembers.length === 0 ? (
                <EmptyState text="No members match the current filters." />
              ) : (
                filteredMembers.map((member) => {
                  const status = getMemberCheck(member)?.status || "not_checked";
                  const linkedBundle = bundleMap[member.bundle_reference.trim()];

                  return (
                    <div
                      key={member.ui_id}
                      className="border border-slate-200 rounded-2xl bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                          <div className="flex items-start gap-3">
                            {manageMode && (
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4"
                                checked={!!selectedMemberRows[member.ui_id]}
                                onChange={(e) =>
                                  setSelectedMemberRows((prev) => ({
                                    ...prev,
                                    [member.ui_id]: e.target.checked,
                                  }))
                                }
                              />
                            )}

                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-lg">{member.mark_no}</h3>
                                <span
                                  className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusClasses(
                                    status
                                  )}`}
                                >
                                  {statusLabel(status)}
                                </span>
                              </div>

                              <div className="text-sm text-slate-500 mt-1">
                                Bundle {member.bundle_reference} • PN {member.pn_final || "—"} • Drawing{" "}
                                {member.drawing_number || "—"} • Qty {member.qty_per_tower} • {member.section}
                              </div>

                              {!linkedBundle && (
                                <div className="text-xs text-rose-600 mt-2 font-medium">
                                  No matching bundle found in bundle register.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <button
                              onClick={() => void updateMemberStatus(member, "arrived")}
                              className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium"
                            >
                              Arrived
                            </button>
                            <button
                              onClick={() => void updateMemberStatus(member, "not_here")}
                              className="px-3 py-2 rounded-xl bg-orange-500 text-white text-sm font-medium"
                            >
                              Not Here
                            </button>
                            <button
                              onClick={() => void updateMemberStatus(member, "missing")}
                              className="px-3 py-2 rounded-xl bg-rose-600 text-white text-sm font-medium"
                            >
                              Missing
                            </button>
                            <button
                              onClick={() => void updateMemberStatus(member, "issue")}
                              className="px-3 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium"
                            >
                              Issue
                            </button>
                          </div>
                        </div>

                        {manageMode && (
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-3 pt-2 border-t border-slate-200">
                            <Field
                              label="Bundle Ref"
                              value={member.bundle_reference}
                              onChange={(v) => updateMemberRow(member.ui_id, "bundle_reference", v)}
                            />
                            <Field
                              label="Mark No"
                              value={member.mark_no}
                              onChange={(v) => updateMemberRow(member.ui_id, "mark_no", v)}
                            />
                            <Field
                              label="PN"
                              value={member.pn_final}
                              onChange={(v) => updateMemberRow(member.ui_id, "pn_final", v)}
                            />
                            <Field
                              label="Drawing"
                              value={member.drawing_number}
                              onChange={(v) => updateMemberRow(member.ui_id, "drawing_number", v)}
                            />
                            <Field
                              label="Qty"
                              value={member.qty_per_tower}
                              onChange={(v) =>
                                updateMemberRow(member.ui_id, "qty_per_tower", safeNumber(v, 0))
                              }
                            />
                            <Field
                              label="Section"
                              value={member.section}
                              onChange={(v) => updateMemberRow(member.ui_id, "section", v)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {viewMode === "crosscheck" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <CrossCheckCard
                  title="Members With Missing Bundle Match"
                  count={missingMemberRows.length}
                  tone="red"
                  description="Members uploaded with a bundle reference that does not exist in the bundle register."
                />
                <CrossCheckCard
                  title="Bundles Without Members"
                  count={bundlesWithoutMembers.length}
                  tone="amber"
                  description="Bundle rows with no linked members uploaded."
                />
                <CrossCheckCard
                  title="Duplicate Member Marks"
                  count={duplicateMembers.length}
                  tone="purple"
                  description="Member marks that appear more than once and should be reviewed."
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <div className="border border-slate-200 rounded-3xl p-4 bg-white">
                  <h3 className="font-bold text-lg mb-3">Missing Bundle Match</h3>
                  <div className="space-y-2 max-h-[420px] overflow-auto">
                    {missingMemberRows.length === 0 ? (
                      <div className="text-sm text-slate-500">No issues found.</div>
                    ) : (
                      missingMemberRows.map((row) => (
                        <div key={row.ui_id} className="rounded-2xl bg-rose-50 border border-rose-200 p-3">
                          <div className="font-semibold">{row.mark_no}</div>
                          <div className="text-sm text-slate-600">
                            Bundle ref {row.bundle_reference} • {row.section}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-3xl p-4 bg-white">
                  <h3 className="font-bold text-lg mb-3">Bundles Without Members</h3>
                  <div className="space-y-2 max-h-[420px] overflow-auto">
                    {bundlesWithoutMembers.length === 0 ? (
                      <div className="text-sm text-slate-500">No issues found.</div>
                    ) : (
                      bundlesWithoutMembers.map((row) => (
                        <div key={row.ui_id} className="rounded-2xl bg-amber-50 border border-amber-200 p-3">
                          <div className="font-semibold">{row.bundle_no}</div>
                          <div className="text-sm text-slate-600">{row.section}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-3xl p-4 bg-white">
                  <h3 className="font-bold text-lg mb-3">Duplicate Members</h3>
                  <div className="space-y-2 max-h-[420px] overflow-auto">
                    {duplicateMembers.length === 0 ? (
                      <div className="text-sm text-slate-500">No issues found.</div>
                    ) : (
                      duplicateMembers.map((row) => (
                        <div key={row.ui_id} className="rounded-2xl bg-purple-50 border border-purple-200 p-3">
                          <div className="font-semibold">{row.mark_no}</div>
                          <div className="text-sm text-slate-600">
                            Bundle {row.bundle_reference} • {row.section}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-3xl p-5 bg-slate-50">
                <h3 className="font-bold text-lg mb-2">Cross-check usage</h3>
                <p className="text-sm text-slate-600">
                  Use this tab after reuploading bundle and member CSVs. It will show missing matches,
                  empty bundles, and duplicate member marks before the Leading Hand starts checking items on site.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SMALL UI
========================================================= */

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
        active ? "bg-white shadow text-slate-900" : "text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-slate-100 rounded-2xl px-4 py-4 min-w-[110px]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold text-lg mt-1">{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-slate-100 rounded-2xl px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-semibold mt-1 truncate">{value}</div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "slate" | "green" | "amber" | "red" | "purple";
}) {
  const toneMap: Record<string, string> = {
    slate: "bg-slate-100 text-slate-800",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
    purple: "bg-purple-100 text-purple-800",
  };

  return (
    <div className={`rounded-2xl px-4 py-4 ${toneMap[tone]}`}>
      <div className="text-xs opacity-80">{label}</div>
      <div className="font-bold text-lg mt-1">{value}</div>
    </div>
  );
}

function CrossCheckCard({
  title,
  count,
  description,
  tone,
}: {
  title: string;
  count: number;
  description: string;
  tone: "red" | "amber" | "purple";
}) {
  const toneMap: Record<string, string> = {
    red: "bg-rose-50 border-rose-200 text-rose-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    purple: "bg-purple-50 border-purple-200 text-purple-800",
  };

  return (
    <div className={`border rounded-3xl p-5 ${toneMap[tone]}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-3xl font-bold mt-2">{count}</div>
      <div className="text-sm mt-2 opacity-80">{description}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-slate-300 rounded-3xl p-10 text-center text-slate-500 bg-slate-50">
      {text}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input
        className="border border-slate-300 p-2.5 rounded-xl w-full text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
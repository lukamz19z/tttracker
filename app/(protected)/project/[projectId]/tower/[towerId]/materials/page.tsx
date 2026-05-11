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
  member_qty: number | null;
  total_weight: number | null;
};

type Bundle = {
  ui_id: string;
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string;
  qty_required: number;
  member_qty: number;
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

type BundleCheckStatus =
  | "not_checked"
  | "arrived"
  | "partial"
  | "missing"
  | "issue";

type MemberCheckStatus =
  | "not_checked"
  | "arrived"
  | "not_here"
  | "missing"
  | "issue";

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

type ViewMode = "bundles" | "members";

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
  member_qty: number;
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

function getTowerPrintLabel(tower: TowerRecord | null): string {
  if (!tower) return "Unknown Tower";

  const extra = tower.extra_data || {};

  return (
    safeString(tower.tower_number) ||
    safeString(tower.structure_number) ||
    safeString(tower.tower_no) ||
    safeString(tower.name) ||
    safeString(extra["Tower No"]) ||
    safeString(extra["Tower Number"]) ||
    safeString(extra["Structure Number"]) ||
    safeString(extra["Structure No"]) ||
    safeString(extra["Label"]) ||
    safeString(extra["label"]) ||
    "Unknown Tower"
  );
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
      return "Partial";
    case "missing":
      return "Missing";
    case "not_here":
      return "Not Here";
    case "issue":
      return "Issue";
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

function statusBorderClasses(status: BundleCheckStatus | MemberCheckStatus): string {
  switch (status) {
    case "arrived":
      return "border-l-emerald-500";
    case "partial":
      return "border-l-amber-500";
    case "missing":
      return "border-l-rose-500";
    case "not_here":
      return "border-l-orange-500";
    case "issue":
      return "border-l-purple-500";
    case "not_checked":
    default:
      return "border-l-slate-300";
  }
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
  return values
    .map((v) => (v === null || v === undefined ? "" : String(v)))
    .join(" ")
    .toLowerCase();
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min((part / total) * 100, 100);
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

  const [expandedBundleNo, setExpandedBundleNo] = useState<string | null>(null);
  const [showAdvancedActions, setShowAdvancedActions] = useState(false);
  const [showUnmatchedMembers, setShowUnmatchedMembers] = useState(false);
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
      member_qty: safeNumber(row.member_qty, 0),
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
      }),
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
      }),
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

  function memberLinesForBundle(bundleNo: string): number {
    return (membersByBundle[bundleNo.trim()] || []).length;
  }

  function memberQtyFromMemberList(bundleNo: string): number {
    return (membersByBundle[bundleNo.trim()] || []).reduce(
      (sum, member) => sum + safeNumber(member.qty_per_tower, 0),
      0,
    );
  }

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
     AUTO SAVE
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
        member_qty: safeNumber(row.member_qty, 0),
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

      if (error) console.error("bundle auto save error", error);
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

      if (error) console.error("member save error", error);
    }

    setSaving(false);
  }

  /* =========================================================
     MANAGE ACTIONS
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
        member_qty: 0,
        total_weight: null,
      },
    ]);

    setManageMode(true);
  }

  function updateBundleRow(ui_id: string, field: keyof Bundle, value: string | number | null) {
    setBundles((prev) => {
      const next = prev.map((row) => {
        if (row.ui_id !== ui_id) return row;
        return { ...row, [field]: value };
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

        if (error) console.error("delete bundle error", error);
      }
    }

    setSelectedBundleRows({});
    await load();
  }

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

    setManageMode(true);
    setViewMode("members");
  }

  function updateMemberRow(ui_id: string, field: keyof Member, value: string | number) {
    setMembers((prev) =>
      prev.map((row) => {
        if (row.ui_id !== ui_id) return row;
        return { ...row, [field]: value };
      }),
    );
  }

  async function saveBundlesNow() {
    await persistBundles(bundles);
    alert("Bundle register saved.");
    await load();
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

        if (error) console.error("delete member error", error);
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
      const next = prev.filter((row) => `${row.bundle_no.trim()}__${row.mark_no.trim()}` !== key);
      next.push(payload);
      return next;
    });

    await saveDerivedBundleStatus(payload.bundle_no);
  }

  async function clearMemberStatus(member: Member) {
    const { error } = await supabase
      .from("tower_material_member_checks")
      .delete()
      .eq("tower_id", towerId)
      .eq("bundle_no", member.bundle_reference.trim())
      .eq("mark_no", member.mark_no.trim());

    if (error) {
      console.error("clear member status error", error);
      alert("Failed to clear member status.");
      return;
    }

    setMemberChecks((prev) =>
      prev.filter(
        (row) =>
          !(
            row.bundle_no.trim() === member.bundle_reference.trim() &&
            row.mark_no.trim() === member.mark_no.trim()
          ),
      ),
    );

    await saveDerivedBundleStatus(member.bundle_reference.trim());
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

  async function clearBundleManualStatus(bundleNo: string) {
    const { error } = await supabase
      .from("tower_material_bundle_checks")
      .delete()
      .eq("tower_id", towerId)
      .eq("bundle_no", bundleNo.trim());

    if (error) {
      console.error("clear bundle status error", error);
      alert("Failed to clear bundle status.");
      return;
    }

    setBundleChecks((prev) => prev.filter((row) => row.bundle_no.trim() !== bundleNo.trim()));
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
        status === "arrived" ? "arrived" : status === "missing" ? "missing" : "partial",
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

  async function clearWholeBundleStatuses(bundleNo: string) {
    const { error: memberDeleteError } = await supabase
      .from("tower_material_member_checks")
      .delete()
      .eq("tower_id", towerId)
      .eq("bundle_no", bundleNo.trim());

    if (memberDeleteError) {
      console.error("clear whole bundle member statuses error", memberDeleteError);
      alert("Failed to clear bundle member statuses.");
      return;
    }

    setMemberChecks((prev) => prev.filter((row) => row.bundle_no.trim() !== bundleNo.trim()));
    await clearBundleManualStatus(bundleNo);
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
        const parsedRows = res.data
          .map((r): BundleImportRow | null => {
            const bundleNo =
              r.bundle_no ||
              r["Bundle No"] ||
              r["Bundle Number"] ||
              r.bundle ||
              r["Bundle Reference"];

            if (!bundleNo) return null;

            const cleanBundleNo = String(bundleNo).trim();
            const lowerBundleNo = cleanBundleNo.toLowerCase();

            if (
              cleanBundleNo === "" ||
              lowerBundleNo === "bundle no" ||
              lowerBundleNo === "bundle number" ||
              lowerBundleNo === "pcs." ||
              lowerBundleNo === "pcs" ||
              lowerBundleNo === "kg's" ||
              lowerBundleNo === "kgs" ||
              lowerBundleNo === "kg" ||
              lowerBundleNo === "basic body" ||
              lowerBundleNo === "body extension" ||
              lowerBundleNo === "common body" ||
              cleanBundleNo.length < 3
            ) {
              return null;
            }

            return {
              tower_id: towerId,
              bundle_no: cleanBundleNo,
              section: normaliseSection(
                safeString(r.section || r["Section"] || r["Bundle Group"] || "General"),
              ),
              qty_required: safeNumber(
                r.qty_required ||
                  r["Bundle Qty"] ||
                  r["Bundle Quantity"] ||
                  r["Qty Required"] ||
                  r["Qty/Tower"] ||
                  r["Quantity of Bundles For Tower"] ||
                  r["NO."] ||
                  0,
                0,
              ),
              member_qty: safeNumber(
                r.member_qty ||
                  r["Member Qty"] ||
                  r["Member Quantity"] ||
                  r["Members"] ||
                  r["No. Members"] ||
                  r["Member Count"] ||
                  0,
                0,
              ),
              total_weight: (() => {
                const n = Number(
                  r.total_weight || r["Total Weight"] || r["Bundle Mass"] || r["Bundle Weight"],
                );
                return Number.isFinite(n) ? n : null;
              })(),
            };
          })
          .filter((row): row is BundleImportRow => row !== null);

        const rowMap = new Map<string, BundleImportRow>();

        parsedRows.forEach((row) => {
          const key = `${row.tower_id}__${row.bundle_no}`;
          rowMap.set(key, row);
        });

        const rows = Array.from(rowMap.values());

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
          alert(`Bundle CSV import failed: ${error.message}`);
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
            const markNo = r.mark_no || r["Mark No"] || r["Mark No."] || r.mark || r["Member Mark"];
            const bundleReference =
              r.bundle_reference || r["Bundle Reference"] || r.bundle_no || r["Bundle No"];

            if (!markNo || !bundleReference) return null;

            return {
              tower_id: towerId,
              bundle_reference: String(bundleReference).trim(),
              drawing_number: safeString(r.drawing_number || r["Drawing Number"]),
              mark_no: String(markNo).trim(),
              pn_final: safeString(
                r.pn_final ||
                  r["Standardised PN FINAL"] ||
                  r["Standardised PN Final"] ||
                  r["PN"],
              ),
              qty_per_tower: safeNumber(
                r.qty_per_tower || r["Qty/Tower"] || r["QTY/tower"] || r["Qty"] || 0,
                0,
              ),
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
        bundle.member_qty,
        bundle.total_weight,
        deliveredQty(bundle.bundle_no),
        memberLinesForBundle(bundle.bundle_no),
        memberQtyFromMemberList(bundle.bundle_no),
        ...((membersByBundle[bundle.bundle_no.trim()] || []).map((m) =>
          [m.mark_no, m.pn_final, m.drawing_number, m.qty_per_tower].join(" "),
        ) as string[]),
      );

      return text.includes(q);
    });
  }, [bundles, search, sectionFilter, statusFilter, membersByBundle, deliveries]);

  const matchedMembers = useMemo(
    () => members.filter((member) => !!bundleMap[member.bundle_reference.trim()]),
    [members, bundleMap],
  );

  const unmatchedMembers = useMemo(
    () => members.filter((member) => !bundleMap[member.bundle_reference.trim()]),
    [members, bundleMap],
  );

  const filteredMatchedMembers = useMemo(() => {
    const q = normaliseSearch(search);

    return matchedMembers.filter((member) => {
      if (sectionFilter !== "all" && member.section !== sectionFilter) return false;
      if (!memberMatchesStatus(member, statusFilter)) return false;

      if (!q) return true;

      const text = matchesText(
        member.mark_no,
        member.pn_final,
        member.drawing_number,
        member.bundle_reference,
        member.section,
        member.qty_per_tower,
      );

      return text.includes(q);
    });
  }, [matchedMembers, search, sectionFilter, statusFilter, memberCheckMap]);

  const filteredUnmatchedMembers = useMemo(() => {
    const q = normaliseSearch(search);

    return unmatchedMembers.filter((member) => {
      if (sectionFilter !== "all" && member.section !== sectionFilter) return false;
      if (!memberMatchesStatus(member, statusFilter)) return false;

      if (!q) return true;

      const text = matchesText(
        member.mark_no,
        member.pn_final,
        member.drawing_number,
        member.bundle_reference,
        member.section,
        member.qty_per_tower,
      );

      return text.includes(q);
    });
  }, [unmatchedMembers, search, sectionFilter, statusFilter, memberCheckMap]);

  const overallRequired = useMemo(
    () => bundles.reduce((sum, row) => sum + safeNumber(row.qty_required, 0), 0),
    [bundles],
  );

  const overallDelivered = useMemo(
    () => bundles.reduce((sum, row) => sum + deliveredQty(row.bundle_no), 0),
    [bundles, deliveries],
  );

  const overallRemaining = Math.max(overallRequired - overallDelivered, 0);
  const overallProgress = overallRequired > 0 ? (overallDelivered / overallRequired) * 100 : 0;

  const totalBundleMemberQty = useMemo(
    () => bundles.reduce((sum, row) => sum + safeNumber(row.member_qty, 0), 0),
    [bundles],
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
      } as Record<BundleCheckStatus, number>,
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
          "Bundle Qty",
          "Delivered",
          "Remaining",
          "Bundle Member Qty",
          "Total Weight",
          "Status",
        ],
        ...filteredBundles.map((bundle) => [
          bundle.bundle_no,
          bundle.section,
          bundle.qty_required,
          deliveredQty(bundle.bundle_no),
          remainingQty(bundle),
          bundle.member_qty,
          bundle.total_weight ?? "",
          statusLabel(deriveBundleStatus(bundle.bundle_no)),
        ]),
      ];

      const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
      downloadTextFile("materials_bundles.csv", csv, "text/csv;charset=utf-8;");
      return;
    }

    const rows = [
      ["Mark No", "PN", "Drawing No", "Bundle Reference", "Qty", "Section", "Status"],
      ...filteredMatchedMembers.map((member) => [
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
  }

  function printCurrentView() {
    let title = "Materials";
    let bodyHtml = "";

    const towerLabel = getTowerPrintLabel(tower);
    const towerLine = safeString(tower?.line, "");

    if (viewMode === "bundles") {
      title = "Bundle List";
      bodyHtml = `
        <table>
          <thead>
            <tr>
              <th>Bundle No</th>
              <th>Section</th>
              <th>Bundle Qty</th>
              <th>Delivered</th>
              <th>Remaining</th>
              <th>Bundle Member Qty</th>
              <th>Weight</th>
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
                <td>${bundle.member_qty}</td>
                <td>${bundle.total_weight ?? ""}</td>
                <td>${statusLabel(deriveBundleStatus(bundle.bundle_no))}</td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      `;
    } else {
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
            ${filteredMatchedMembers
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
            `,
              )
              .join("")}
          </tbody>
        </table>
      `;
    }

    const html = `
<html>
<head>
<title>${title} - ${towerLabel}</title>
<style>
body{font-family:Arial,sans-serif;padding:24px;color:#0f172a;}
.print-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:18px;}
h1{margin:0;font-size:22px;}
.tower-label{font-size:18px;font-weight:700;}
.meta{font-size:12px;color:#64748b;margin-top:4px;}
table{border-collapse:collapse;width:100%;}
th,td{border:1px solid #cbd5e1;padding:8px;font-size:12px;text-align:left;}
th{background:#f1f5f9;}
.print-footer{margin-top:20px;padding-top:8px;border-top:1px solid #cbd5e1;font-size:11px;color:#64748b;display:flex;justify-content:space-between;}
</style>
</head>
<body>
<div class="print-header">
<div>
<h1>${title}</h1>
<div class="meta">Printed ${new Date().toLocaleString()}</div>
</div>
<div style="text-align:right">
<div class="tower-label">Tower: ${towerLabel}</div>
<div class="meta">${towerLine ? `Line: ${towerLine}` : ""}</div>
</div>
</div>
${bodyHtml}
<div class="print-footer">
<span>${title} - Tower ${towerLabel}</span>
<span>TTTracker</span>
</div>
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
    return <div className="p-4 md:p-8 text-sm text-slate-600">Loading materials register...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-2 md:p-6 space-y-3">
      {tower && <TowerHeader projectId={projectId} tower={tower} latestDate={latestDate} />}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
          <div className="p-3 md:p-4 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
                  Materials Register
                </h1>
                <p className="text-xs md:text-sm text-slate-500">
                  Site check bundles or members, update arrival status, import and export registers.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {saving && (
                  <span className="px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold">
                    Saving…
                  </span>
                )}

                <button onClick={printCurrentView} className="compact-secondary-btn">
                  Print
                </button>

                <button onClick={exportCurrentViewCSV} className="compact-secondary-btn">
                  Export
                </button>

                <button
                  onClick={() => setShowAdvancedActions((prev) => !prev)}
                  className="compact-secondary-btn"
                >
                  {showAdvancedActions ? "Hide Tools" : "Tools"}
                </button>

                <button
                  onClick={() => setManageMode((prev) => !prev)}
                  className={`px-3 py-2 rounded-xl text-xs md:text-sm font-semibold border ${
                    manageMode
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {manageMode ? "Exit Manage" : "Manage"}
                </button>
              </div>
            </div>

            <CompactSummary
              bundles={bundles.length}
              members={members.length}
              memberQty={totalBundleMemberQty}
              delivered={overallDelivered}
              required={overallRequired}
              remaining={overallRemaining}
              progress={overallProgress}
              notChecked={bundleStatusCounts.not_checked}
              arrived={bundleStatusCounts.arrived}
              partial={bundleStatusCounts.partial}
              missing={bundleStatusCounts.missing}
              issues={bundleStatusCounts.issue}
            />

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,1fr)_auto_auto_auto] gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bundle, mark, PN, drawing..."
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="grid grid-cols-2 bg-slate-100 rounded-xl p-1">
                <ModeButton active={viewMode === "bundles"} onClick={() => setViewMode("bundles")} label="Bundles" />
                <ModeButton active={viewMode === "members"} onClick={() => setViewMode("members")} label="Members" />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="not_checked">Not Checked</option>
                <option value="arrived">Arrived</option>
                <option value="partial">Partial</option>
                <option value="missing">Missing</option>
                <option value="not_here">Not Here</option>
                <option value="issue">Issue</option>
              </select>

              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white"
              >
                <option value="all">All Sections</option>
                {allSections.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </div>

            {showAdvancedActions && (
              <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                <label className="compact-secondary-btn cursor-pointer">
                  {bundleImporting ? "Uploading..." : "Reupload Bundles"}
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

                <label className="compact-secondary-btn cursor-pointer">
                  {memberImporting ? "Uploading..." : "Reupload Members"}
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
            )}

            {manageMode && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                <div className="text-xs md:text-sm text-amber-800 font-medium">
                  Manage mode on. Select rows to delete, or edit fields inline.
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={addBundleRow} className="compact-white-btn">
                    Add Bundle
                  </button>

                  <button onClick={addMemberRow} className="compact-white-btn">
                    Add Member
                  </button>

                  <button onClick={saveBundlesNow} className="compact-primary-btn">
                    Save Bundles
                  </button>

                  <button onClick={saveMembersNow} className="compact-primary-btn">
                    Save Members
                  </button>

                  <button onClick={deleteSelectedBundles} className="compact-danger-btn">
                    Delete Bundles
                  </button>

                  <button onClick={deleteSelectedMembers} className="compact-danger-btn">
                    Delete Members
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-2 md:p-4">
          {viewMode === "bundles" && (
            <div className="space-y-2">
              {filteredBundles.length === 0 ? (
                <EmptyState text="No bundles match the current filters." />
              ) : (
                filteredBundles.map((bundle) => {
                  const relatedMembers = membersByBundle[bundle.bundle_no.trim()] || [];
                  const status = deriveBundleStatus(bundle.bundle_no);
                  const expanded = expandedBundleNo === bundle.bundle_no;
                  const hasMemberStatuses = relatedMembers.some((member) => !!getMemberCheck(member));
                  const hasManualBundleStatus = !!bundleCheckMap[bundle.bundle_no.trim()];
                  const delivered = deliveredQty(bundle.bundle_no);
                  const remaining = remainingQty(bundle);
                  const deliveryProgress = percentage(delivered, bundle.qty_required);

                  return (
                    <div
                      key={bundle.ui_id}
                      className={`border border-l-4 ${statusBorderClasses(
                        status,
                      )} border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden`}
                    >
                      <div className="p-2.5 md:p-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0">
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

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h2 className="text-base md:text-lg font-bold truncate text-slate-900">
                                    {bundle.bundle_no || "New Bundle"}
                                  </h2>

                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusClasses(
                                      status,
                                    )}`}
                                  >
                                    {statusLabel(status)}
                                  </span>
                                </div>

                                <div className="text-xs md:text-sm text-slate-500 mt-1 leading-5">
                                  {bundle.section} • Qty {bundle.qty_required} • Members{" "}
                                  {bundle.member_qty} • Delivered {delivered} • Remaining {remaining}
                                  {bundle.total_weight !== null ? ` • ${bundle.total_weight} kg` : ""}
                                </div>

                                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-slate-900 rounded-full"
                                    style={{ width: `${deliveryProgress}%` }}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-1.5">
                              <button
                                onClick={() => void markWholeBundle(bundle.bundle_no, "arrived")}
                                className="site-action-btn bg-emerald-600 text-white"
                                title="Mark arrived"
                              >
                                ✓
                                <span className="hidden sm:inline ml-1">Arrived</span>
                              </button>

                              <button
                                onClick={() => void markWholeBundle(bundle.bundle_no, "missing")}
                                className="site-action-btn bg-rose-600 text-white"
                                title="Mark missing"
                              >
                                ✕
                                <span className="hidden sm:inline ml-1">Missing</span>
                              </button>

                              <button
                                onClick={() => void updateBundleManualStatus(bundle.bundle_no, "issue")}
                                className="site-action-btn bg-purple-600 text-white"
                                title="Mark issue"
                              >
                                !
                                <span className="hidden sm:inline ml-1">Issue</span>
                              </button>

                              <button
                                onClick={() =>
                                  setExpandedBundleNo((prev) =>
                                    prev === bundle.bundle_no ? null : bundle.bundle_no,
                                  )
                                }
                                className="site-action-btn bg-slate-100 text-slate-800 border border-slate-200"
                              >
                                {expanded ? "Hide" : "Open"}
                              </button>

                              {(hasMemberStatuses || hasManualBundleStatus) && (
                                <button
                                  onClick={() => void clearWholeBundleStatuses(bundle.bundle_no)}
                                  className="site-action-btn bg-slate-200 text-slate-800"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>

                          {manageMode && (
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 pt-2 border-t border-slate-200">
                              <Field label="Bundle No" value={bundle.bundle_no} onChange={(v) => updateBundleRow(bundle.ui_id, "bundle_no", v)} />
                              <Field label="Section" value={bundle.section} onChange={(v) => updateBundleRow(bundle.ui_id, "section", v)} />
                              <Field label="Bundle Qty" value={bundle.qty_required} onChange={(v) => updateBundleRow(bundle.ui_id, "qty_required", safeNumber(v, 0))} />
                              <Field label="Member Qty" value={bundle.member_qty} onChange={(v) => updateBundleRow(bundle.ui_id, "member_qty", safeNumber(v, 0))} />
                              <Field
                                label="Total Weight"
                                value={bundle.total_weight ?? ""}
                                onChange={(v) =>
                                  updateBundleRow(
                                    bundle.ui_id,
                                    "total_weight",
                                    v === "" ? null : safeNumber(v, 0),
                                  )
                                }
                              />
                            </div>
                          )}

                          {expanded && (
                            <div className="pt-2 border-t border-slate-200 space-y-2">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                <MiniInfo label="Member lines" value={relatedMembers.length} />
                                <MiniInfo label="Member qty from list" value={memberQtyFromMemberList(bundle.bundle_no)} />
                                <MiniInfo label="Required" value={bundle.qty_required} />
                                <MiniInfo label="Delivered" value={delivered} />
                              </div>

                              {relatedMembers.length === 0 ? (
                                <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                  No linked members found for this bundle. It can still be marked manually.
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  {relatedMembers.map((member) => {
                                    const memberStatus = getMemberCheck(member)?.status || "not_checked";
                                    const hasStatus = !!getMemberCheck(member);

                                    return (
                                      <div
                                        key={member.ui_id}
                                        className={`border border-l-4 ${statusBorderClasses(
                                          memberStatus,
                                        )} border-slate-200 rounded-xl p-2 bg-slate-50`}
                                      >
                                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                                          <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <div className="font-semibold text-sm text-slate-900">
                                                {member.mark_no}
                                              </div>

                                              <span
                                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusClasses(
                                                  memberStatus,
                                                )}`}
                                              >
                                                {statusLabel(memberStatus)}
                                              </span>
                                            </div>

                                            <div className="text-xs text-slate-500 mt-1">
                                              PN {member.pn_final || "—"} • Drawing{" "}
                                              {member.drawing_number || "—"} • Qty{" "}
                                              {member.qty_per_tower} • {member.section}
                                            </div>
                                          </div>

                                          <div className="grid grid-cols-5 gap-1.5">
                                            <button onClick={() => void updateMemberStatus(member, "arrived")} className="mini-action bg-emerald-600 text-white" title="Arrived">
                                              ✓
                                            </button>
                                            <button onClick={() => void updateMemberStatus(member, "not_here")} className="mini-action bg-orange-500 text-white" title="Not Here">
                                              —
                                            </button>
                                            <button onClick={() => void updateMemberStatus(member, "missing")} className="mini-action bg-rose-600 text-white" title="Missing">
                                              ✕
                                            </button>
                                            <button onClick={() => void updateMemberStatus(member, "issue")} className="mini-action bg-purple-600 text-white" title="Issue">
                                              !
                                            </button>
                                            {hasStatus ? (
                                              <button onClick={() => void clearMemberStatus(member)} className="mini-action bg-slate-200 text-slate-800" title="Clear">
                                                C
                                              </button>
                                            ) : (
                                              <div />
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
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
            <div className="space-y-2">
              {filteredMatchedMembers.length === 0 ? (
                <EmptyState text="No matched members match the current filters." />
              ) : (
                filteredMatchedMembers.map((member) => {
                  const status = getMemberCheck(member)?.status || "not_checked";
                  const matchingBundle = bundleMap[member.bundle_reference.trim()];

                  return (
                    <div
                      key={member.ui_id}
                      className={`border border-l-4 ${statusBorderClasses(
                        status,
                      )} border-slate-200 rounded-xl bg-white p-2.5 md:p-3 shadow-sm`}
                    >
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
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

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-bold text-base text-slate-900">
                                  {member.mark_no || "New Member"}
                                </h3>

                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusClasses(
                                    status,
                                  )}`}
                                >
                                  {statusLabel(status)}
                                </span>
                              </div>

                              <div className="text-xs md:text-sm text-slate-500 mt-1 leading-5">
                                Bundle {member.bundle_reference} • Bundle Member Qty{" "}
                                {matchingBundle?.member_qty ?? "—"} • PN {member.pn_final || "—"} •
                                Drawing {member.drawing_number || "—"} • Qty {member.qty_per_tower} •{" "}
                                {member.section}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-5 gap-1.5">
                            <button onClick={() => void updateMemberStatus(member, "arrived")} className="mini-action bg-emerald-600 text-white" title="Arrived">
                              ✓
                            </button>
                            <button onClick={() => void updateMemberStatus(member, "not_here")} className="mini-action bg-orange-500 text-white" title="Not Here">
                              —
                            </button>
                            <button onClick={() => void updateMemberStatus(member, "missing")} className="mini-action bg-rose-600 text-white" title="Missing">
                              ✕
                            </button>
                            <button onClick={() => void updateMemberStatus(member, "issue")} className="mini-action bg-purple-600 text-white" title="Issue">
                              !
                            </button>
                            {!!getMemberCheck(member) ? (
                              <button onClick={() => void clearMemberStatus(member)} className="mini-action bg-slate-200 text-slate-800" title="Clear">
                                C
                              </button>
                            ) : (
                              <div />
                            )}
                          </div>
                        </div>

                        {manageMode && (
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 pt-2 border-t border-slate-200">
                            <Field label="Bundle Ref" value={member.bundle_reference} onChange={(v) => updateMemberRow(member.ui_id, "bundle_reference", v)} />
                            <Field label="Mark No" value={member.mark_no} onChange={(v) => updateMemberRow(member.ui_id, "mark_no", v)} />
                            <Field label="PN" value={member.pn_final} onChange={(v) => updateMemberRow(member.ui_id, "pn_final", v)} />
                            <Field label="Drawing" value={member.drawing_number} onChange={(v) => updateMemberRow(member.ui_id, "drawing_number", v)} />
                            <Field label="Qty" value={member.qty_per_tower} onChange={(v) => updateMemberRow(member.ui_id, "qty_per_tower", safeNumber(v, 0))} />
                            <Field label="Section" value={member.section} onChange={(v) => updateMemberRow(member.ui_id, "section", v)} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowUnmatchedMembers((prev) => !prev)}
                  className="w-full px-3 py-2.5 text-left bg-slate-100 hover:bg-slate-200 flex items-center justify-between"
                >
                  <div>
                    <div className="font-semibold text-sm">Members not in bundle register</div>
                    <div className="text-xs text-slate-500">
                      {filteredUnmatchedMembers.length} filtered • {unmatchedMembers.length} total
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-slate-700">
                    {showUnmatchedMembers ? "Hide" : "Show"}
                  </div>
                </button>

                {showUnmatchedMembers && (
                  <div className="p-2 md:p-3 space-y-2">
                    {filteredUnmatchedMembers.length === 0 ? (
                      <EmptyState text="No unmatched members match the current filters." />
                    ) : (
                      filteredUnmatchedMembers.map((member) => {
                        const status = getMemberCheck(member)?.status || "not_checked";

                        return (
                          <div
                            key={member.ui_id}
                            className={`border border-l-4 ${statusBorderClasses(
                              status,
                            )} border-rose-200 rounded-xl bg-rose-50 p-2.5 md:p-3`}
                          >
                            <div className="flex flex-col gap-2">
                              <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2">
                                <div className="flex items-start gap-2 min-w-0">
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

                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h3 className="font-bold text-base text-slate-900">
                                        {member.mark_no}
                                      </h3>

                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusClasses(
                                          status,
                                        )}`}
                                      >
                                        {statusLabel(status)}
                                      </span>
                                    </div>

                                    <div className="text-xs md:text-sm text-slate-600 mt-1 leading-5">
                                      Bundle {member.bundle_reference} • PN {member.pn_final || "—"} •
                                      Drawing {member.drawing_number || "—"} • Qty{" "}
                                      {member.qty_per_tower} • {member.section}
                                    </div>

                                    <div className="text-xs text-rose-700 mt-1 font-medium">
                                      This member does not currently match any uploaded bundle number.
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-5 gap-1.5">
                                  <button onClick={() => void updateMemberStatus(member, "arrived")} className="mini-action bg-emerald-600 text-white" title="Arrived">
                                    ✓
                                  </button>
                                  <button onClick={() => void updateMemberStatus(member, "not_here")} className="mini-action bg-orange-500 text-white" title="Not Here">
                                    —
                                  </button>
                                  <button onClick={() => void updateMemberStatus(member, "missing")} className="mini-action bg-rose-600 text-white" title="Missing">
                                    ✕
                                  </button>
                                  <button onClick={() => void updateMemberStatus(member, "issue")} className="mini-action bg-purple-600 text-white" title="Issue">
                                    !
                                  </button>
                                  {!!getMemberCheck(member) ? (
                                    <button onClick={() => void clearMemberStatus(member)} className="mini-action bg-slate-200 text-slate-800" title="Clear">
                                      C
                                    </button>
                                  ) : (
                                    <div />
                                  )}
                                </div>
                              </div>

                              {manageMode && (
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 pt-2 border-t border-rose-200">
                                  <Field label="Bundle Ref" value={member.bundle_reference} onChange={(v) => updateMemberRow(member.ui_id, "bundle_reference", v)} />
                                  <Field label="Mark No" value={member.mark_no} onChange={(v) => updateMemberRow(member.ui_id, "mark_no", v)} />
                                  <Field label="PN" value={member.pn_final} onChange={(v) => updateMemberRow(member.ui_id, "pn_final", v)} />
                                  <Field label="Drawing" value={member.drawing_number} onChange={(v) => updateMemberRow(member.ui_id, "drawing_number", v)} />
                                  <Field label="Qty" value={member.qty_per_tower} onChange={(v) => updateMemberRow(member.ui_id, "qty_per_tower", safeNumber(v, 0))} />
                                  <Field label="Section" value={member.section} onChange={(v) => updateMemberRow(member.ui_id, "section", v)} />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .compact-secondary-btn {
          border-radius: 0.75rem;
          background: #f1f5f9;
          color: #334155;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          border: 1px solid #e2e8f0;
        }

        .compact-secondary-btn:hover {
          background: #e2e8f0;
        }

        .compact-white-btn {
          border-radius: 0.75rem;
          background: white;
          color: #334155;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          border: 1px solid #cbd5e1;
        }

        .compact-primary-btn {
          border-radius: 0.75rem;
          background: #2563eb;
          color: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .compact-danger-btn {
          border-radius: 0.75rem;
          background: #e11d48;
          color: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .site-action-btn {
          min-height: 2.25rem;
          border-radius: 0.75rem;
          padding: 0.45rem 0.65rem;
          font-size: 0.75rem;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          white-space: nowrap;
        }

        .mini-action {
          min-height: 2rem;
          min-width: 2rem;
          border-radius: 0.65rem;
          font-size: 0.75rem;
          font-weight: 900;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
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
      className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition ${
        active ? "bg-white shadow text-slate-900" : "text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function CompactSummary({
  bundles,
  members,
  memberQty,
  delivered,
  required,
  remaining,
  progress,
  notChecked,
  arrived,
  partial,
  missing,
  issues,
}: {
  bundles: number;
  members: number;
  memberQty: number;
  delivered: number;
  required: number;
  remaining: number;
  progress: number;
  notChecked: number;
  arrived: number;
  partial: number;
  missing: number;
  issues: number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <SummaryPill label="Bundles" value={bundles} />
        <SummaryPill label="Members" value={members} />
        <SummaryPill label="Member Qty" value={memberQty} />
        <SummaryPill label="Delivered" value={`${delivered}/${required}`} />
        <SummaryPill label="Remaining" value={remaining} />
        <SummaryPill label="Progress" value={`${progress.toFixed(1)}%`} strong />
        <SummaryPill label="Not Checked" value={notChecked} />
        <SummaryPill label="Arrived" value={arrived} tone="green" />
        <SummaryPill label="Partial" value={partial} tone="amber" />
        <SummaryPill label="Missing" value={missing} tone="red" />
        <SummaryPill label="Issues" value={issues} tone="purple" />
      </div>

      <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden border border-slate-200">
        <div className="h-full bg-slate-900 rounded-full" style={{ width: `${Math.min(progress, 100)}%` }} />
      </div>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  strong,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  strong?: boolean;
  tone?: "slate" | "green" | "amber" | "red" | "purple";
}) {
  const tones = {
    slate: "bg-white text-slate-700 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };

  return (
    <div className={`border rounded-full px-2.5 py-1 ${tones[tone]}`}>
      <span className="opacity-70">{label}: </span>
      <span className={strong ? "font-black" : "font-bold"}>{value}</span>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-100 px-2 py-1.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 truncate">{label}</div>
      <div className="text-sm font-bold text-slate-900 truncate">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center text-sm text-slate-500 bg-slate-50">
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
      <label className="block text-[11px] text-slate-500 mb-1 font-medium">{label}</label>
      <input
        className="border border-slate-300 p-2 rounded-lg w-full text-sm bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
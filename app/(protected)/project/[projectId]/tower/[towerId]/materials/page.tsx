"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Boxes,
  ChevronDown,
  ChevronUp,
  CirclePlus,
  ExternalLink,
  Minus,
  PackageCheck,
  PackageOpen,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Settings2,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";


type BundleCheckStatus = "not_checked" | "arrived" | "partial" | "missing" | "issue";
type MemberCheckStatus = "not_checked" | "arrived" | "not_here" | "missing" | "issue";
type MaterialEventType =
  | "missing"
  | "found_received"
  | "taken_from_another_tower"
  | "sent_to_another_tower"
  | "damaged_incorrect"
  | "excess"
  | string;

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

type Bundle = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string;
  qty_required: number;
  member_qty: number;
  total_weight: number | null;
};

type Member = {
  id?: string;
  tower_id: string;
  bundle_id: string | null;
  bundle_reference: string;
  drawing_number: string;
  mark_no: string;
  qty_per_tower: number | null;
  section: string;
  tower_segment: string;
};

type Bolt = {
  id?: string;
  tower_id: string;
  tower_segment: string;
  bolt_diameter: string;
  dn_sn: string;
  length: string;
  qty: number;
};

type BundleCheck = {
  id?: string;
  tower_id: string;
  bundle_id: string | null;
  bundle_no: string;
  status: BundleCheckStatus;
  notes: string;
  checked_by: string;
  checked_at: string | null;
  qty_received: number;
};

type MemberCheck = {
  id?: string;
  tower_id: string;
  bundle_id: string | null;
  bundle_no: string;
  mark_no: string;
  status: MemberCheckStatus;
  notes: string;
  checked_by: string;
  checked_at: string | null;
};

type DeliveryItem = {
  bundle_id: string | null;
  bundle_no: string;
  qty_delivered: number;
};

type Delivery = {
  tower_bundle_delivery_items: DeliveryItem[];
};

type MaterialEventItem = {
  id: string;
  event_id: string;
  source_table?: string | null;
  source_record_id?: string | null;
  material_type?: string | null;
  bolt_size?: string | null;
  item_reference?: string | null;
  item_description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
};

type MaterialEvent = {
  id: string;
  project_id?: string | null;
  docket_id: string | null;
  tower_id: string;
  event_type: MaterialEventType;
  source_tower_id?: string | null;
  destination_tower_id?: string | null;
  source_location?: string | null;
  destination_location?: string | null;
  occurred_at?: string | null;
  affected_work?: boolean | null;
  work_outcome?: string | null;
  affected_activity?: string | null;
  affected_section?: string | null;
  impact_started_at?: string | null;
  impact_finished_at?: string | null;
  impact_ongoing?: boolean | null;
  current_effect?: string | null;
  mitigation_actions?: string[] | null;
  commercial_impact_type?: string | null;
  notes?: string | null;
  items: MaterialEventItem[];
};

type DocketSummary = {
  id: string;
  docket_date: string | null;
  crew?: string | null;
  leading_hand?: string | null;
};

type MaterialsData = {
  tower: TowerRecord | null;
  latestDate: string | null;
  bundles: Bundle[];
  members: Member[];
  bolts: Bolt[];
  bundleChecks: BundleCheck[];
  memberChecks: MemberCheck[];
  materialEvents: MaterialEvent[];
  dockets: DocketSummary[];
  docketMap: Map<string, DocketSummary>;
  missingEvents: MaterialEvent[];
  excessEvents: MaterialEvent[];
  loading: boolean;
  saving: boolean;
  duplicateBundleRefs: Set<string>;
  deliveredQty: (bundle: Bundle) => number;
  receivedQty: (bundle: Bundle) => number;
  getMemberCheck: (member: Member) => MemberCheck | undefined;
  membersForBundle: (bundle: Bundle) => Member[];
  deriveBundleStatus: (bundle: Bundle) => BundleCheckStatus;
  saveBundleCheck: (bundle: Bundle, qtyReceived: number, forcedStatus?: BundleCheckStatus) => Promise<void>;
  clearBundleCheck: (bundle: Bundle) => Promise<void>;
  updateMemberStatus: (member: Member, status: MemberCheckStatus) => Promise<void>;
  clearMemberStatus: (member: Member) => Promise<void>;
  refresh: () => Promise<void>;
};


function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normaliseBundleKey(value: unknown): string {
  return safeString(value).trim().toUpperCase().replace(/\s+/g, "");
}

function normaliseSearch(value: string): string {
  return value.trim().toLowerCase();
}

function normaliseSegment(value: string): string {
  const raw = value.trim();
  if (!raw) return "General";
  const compact = raw.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const legMatch = compact.match(/^(\d+)\s*m?\s*leg(s)?$/i);
  if (legMatch) return `${legMatch[1]} Leg`;
  return compact
    .replace(/\blegs\b/g, "leg")
    .replace(/\bbody ext\b/g, "body extension")
    .replace(/\bcrossarms?\b/g, "crossarms")
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: BundleCheckStatus | MemberCheckStatus): string {
  switch (status) {
    case "arrived": return "Arrived";
    case "partial": return "Partial";
    case "missing": return "Missing";
    case "not_here": return "Not Here";
    case "issue": return "Issue";
    default: return "Not Checked";
  }
}

function statusClasses(status: BundleCheckStatus | MemberCheckStatus): string {
  switch (status) {
    case "arrived": return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "partial": return "border-amber-200 bg-amber-50 text-amber-700";
    case "missing": return "border-rose-200 bg-rose-50 text-rose-700";
    case "not_here": return "border-orange-200 bg-orange-50 text-orange-700";
    case "issue": return "border-violet-200 bg-violet-50 text-violet-700";
    default: return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function bundleUiKey(bundle: Bundle): string {
  return bundle.id || `${normaliseBundleKey(bundle.bundle_no)}::${normaliseSegment(bundle.section)}`;
}

function workOutcomeLabel(value: string | null | undefined): string {
  const labels: Record<string, string> = {
    stopped_work: "Couldn’t continue",
    slowed_down: "Slowed down",
    changed_sequence: "Resequenced",
    minor_impact: "Minor impact",
  };
  return value ? labels[value] || value : "—";
}

function useMaterialsData(towerId: string) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [tower, setTower] = useState<TowerRecord | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [bolts, setBolts] = useState<Bolt[]>([]);
  const [bundleChecks, setBundleChecks] = useState<BundleCheck[]>([]);
  const [memberChecks, setMemberChecks] = useState<MemberCheck[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [materialEvents, setMaterialEvents] = useState<MaterialEvent[]>([]);
  const [dockets, setDockets] = useState<DocketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAllMembers = useCallback(async () => {
    const pageSize = 1000;
    const rows: Record<string, unknown>[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("tower_material_members")
        .select("*")
        .eq("tower_id", towerId)
        .order("bundle_reference", { ascending: true })
        .order("mark_no", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }, [supabase, towerId]);

  const fetchAllMemberChecks = useCallback(async () => {
    const pageSize = 1000;
    const rows: Record<string, unknown>[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("tower_material_member_checks")
        .select("*")
        .eq("tower_id", towerId)
        .order("bundle_no", { ascending: true })
        .order("mark_no", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data || []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }, [supabase, towerId]);

  const load = useCallback(async () => {
    if (!towerId) return;
    setLoading(true);
    try {
      const [towerRes, bundleRes, memberRows, boltRes, deliveryRes, docketRes, bundleCheckRes, memberCheckRows, eventRes] = await Promise.all([
        supabase.from("towers").select("*").eq("id", towerId).single(),
        supabase.from("tower_required_bundles").select("*").eq("tower_id", towerId).order("section").order("bundle_no"),
        fetchAllMembers(),
        supabase.from("tower_material_bolts").select("*").eq("tower_id", towerId).order("tower_segment").order("bolt_diameter").order("length"),
        supabase.from("tower_bundle_deliveries").select("tower_bundle_delivery_items(*)").eq("tower_id", towerId),
        supabase.from("tower_daily_dockets").select("id,docket_date,crew,leading_hand").eq("tower_id", towerId).order("docket_date", { ascending: false }),
        supabase.from("tower_material_bundle_checks").select("*").eq("tower_id", towerId),
        fetchAllMemberChecks(),
        supabase
          .from("tower_material_events")
          .select(`
            id,
            project_id,
            docket_id,
            tower_id,
            event_type,
            source_tower_id,
            destination_tower_id,
            source_location,
            destination_location,
            occurred_at,
            affected_work,
            work_outcome,
            affected_activity,
            affected_section,
            impact_started_at,
            impact_finished_at,
            impact_ongoing,
            current_effect,
            mitigation_actions,
            commercial_impact_type,
            notes,
            items:tower_material_event_items(
              id,
              event_id,
              source_table,
              source_record_id,
              material_type,
              bolt_size,
              item_reference,
              item_description,
              quantity,
              unit,
              notes
            )
          `)
          .eq("tower_id", towerId)
          .order("occurred_at", { ascending: false }),
      ]);

      const errors = [towerRes.error, bundleRes.error, boltRes.error, deliveryRes.error, docketRes.error, bundleCheckRes.error, eventRes.error].filter(Boolean);
      if (errors.length) throw errors[0];

      setTower((towerRes.data as TowerRecord | null) || null);
      const loadedDockets = (docketRes.data || []) as DocketSummary[];
      setDockets(loadedDockets);
      setLatestDate(loadedDockets[0]?.docket_date || null);

      setBundles(((bundleRes.data || []) as Record<string, unknown>[]).map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: towerId,
        bundle_no: safeString(row.bundle_no),
        section: normaliseSegment(safeString(row.section, "General")),
        qty_required: Math.max(safeNumber(row.qty_required), 0),
        member_qty: Math.max(safeNumber(row.member_qty), 0),
        total_weight: row.total_weight == null ? null : safeNumber(row.total_weight),
      })));

      setMembers(memberRows.map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: towerId,
        bundle_id: safeString(row.bundle_id) || null,
        bundle_reference: safeString(row.bundle_reference),
        drawing_number: safeString(row.drawing_number),
        mark_no: safeString(row.mark_no),
        qty_per_tower: row.qty_per_tower == null ? null : Math.max(safeNumber(row.qty_per_tower), 0),
        section: safeString(row.section).trim(),
        tower_segment: safeString(row.tower_segment).trim() ? normaliseSegment(safeString(row.tower_segment)) : "",
      })));

      setBolts(((boltRes.data || []) as Record<string, unknown>[]).map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: towerId,
        tower_segment: normaliseSegment(safeString(row.tower_segment, "General")),
        bolt_diameter: safeString(row.bolt_diameter),
        dn_sn: safeString(row.dn_sn),
        length: safeString(row.length),
        qty: Math.max(safeNumber(row.qty), 0),
      })));

      setBundleChecks(((bundleCheckRes.data || []) as Record<string, unknown>[]).map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: safeString(row.tower_id, towerId),
        bundle_id: safeString(row.bundle_id) || null,
        bundle_no: safeString(row.bundle_no),
        status: (safeString(row.status, "not_checked") || "not_checked") as BundleCheckStatus,
        notes: safeString(row.notes),
        checked_by: safeString(row.checked_by),
        checked_at: safeString(row.checked_at) || null,
        qty_received: Math.max(safeNumber(row.qty_received), 0),
      })));

      setMemberChecks(memberCheckRows.map((row) => ({
        id: safeString(row.id) || undefined,
        tower_id: safeString(row.tower_id, towerId),
        bundle_id: safeString(row.bundle_id) || null,
        bundle_no: safeString(row.bundle_no),
        mark_no: safeString(row.mark_no),
        status: (safeString(row.status, "not_checked") || "not_checked") as MemberCheckStatus,
        notes: safeString(row.notes),
        checked_by: safeString(row.checked_by),
        checked_at: safeString(row.checked_at) || null,
      })));

      setDeliveries((deliveryRes.data || []) as Delivery[]);
      setMaterialEvents(((eventRes.data || []) as unknown as MaterialEvent[]).map((event) => ({ ...event, items: event.items || [] })));
    } catch (error) {
      console.error("materials load error", error);
    } finally {
      setLoading(false);
    }
  }, [fetchAllMemberChecks, fetchAllMembers, supabase, towerId]);

  useEffect(() => { void load(); }, [load]);

  const bundlesByReference = useMemo(() => {
    const map = new Map<string, Bundle[]>();
    bundles.forEach((bundle) => {
      const key = normaliseBundleKey(bundle.bundle_no);
      map.set(key, [...(map.get(key) || []), bundle]);
    });
    return map;
  }, [bundles]);

  const bundleById = useMemo(() => {
    const map = new Map<string, Bundle>();
    bundles.forEach((bundle) => {
      if (bundle.id) map.set(bundle.id, bundle);
    });
    return map;
  }, [bundles]);

  const resolveBundleForMember = useCallback((member: Member) => {
    if (member.bundle_id) {
      const linked = bundleById.get(member.bundle_id);
      if (linked) return linked;
    }

    const candidates = bundlesByReference.get(normaliseBundleKey(member.bundle_reference)) || [];
    if (candidates.length === 1) return candidates[0];

    const segment = member.tower_segment.trim()
      ? normaliseSegment(member.tower_segment)
      : "";

    if (segment) {
      const exact = candidates.filter(
        (bundle) => normaliseSegment(bundle.section) === segment,
      );
      if (exact.length === 1) return exact[0];
    }

    return undefined;
  }, [bundleById, bundlesByReference]);

  const duplicateBundleRefs = useMemo(() => {
    return new Set(
      Array.from(bundlesByReference.entries())
        .filter(([, rows]) => rows.length > 1)
        .map(([key]) => key),
    );
  }, [bundlesByReference]);

  const bundleCheckById = useMemo(() => {
    const map = new Map<string, BundleCheck>();

    bundleChecks.forEach((check) => {
      if (check.bundle_id) {
        map.set(check.bundle_id, check);
        return;
      }

      const candidates = bundlesByReference.get(normaliseBundleKey(check.bundle_no)) || [];
      if (candidates.length === 1 && candidates[0].id) {
        map.set(candidates[0].id!, check);
      }
    });

    return map;
  }, [bundleChecks, bundlesByReference]);

  const getBundleCheck = useCallback((bundle: Bundle) => {
    return bundle.id ? bundleCheckById.get(bundle.id) : undefined;
  }, [bundleCheckById]);

  const memberCheckMap = useMemo(() => {
    const map = new Map<string, MemberCheck>();

    memberChecks.forEach((check) => {
      let bundleId = check.bundle_id || "";

      if (!bundleId) {
        const candidates = bundlesByReference.get(normaliseBundleKey(check.bundle_no)) || [];
        if (candidates.length === 1 && candidates[0].id) {
          bundleId = candidates[0].id!;
        }
      }

      if (!bundleId) return;
      map.set(`${bundleId}__${check.mark_no.trim().toUpperCase()}`, check);
    });

    return map;
  }, [memberChecks, bundlesByReference]);

  const membersByBundleId = useMemo(() => {
    const map = new Map<string, Member[]>();

    members.forEach((member) => {
      const bundle = resolveBundleForMember(member);
      if (!bundle?.id) return;
      map.set(bundle.id, [...(map.get(bundle.id) || []), member]);
    });

    return map;
  }, [members, resolveBundleForMember]);

  const docketMap = useMemo(() => {
    const map = new Map<string, DocketSummary>();
    dockets.forEach((docket) => map.set(docket.id, docket));
    return map;
  }, [dockets]);

  const missingEvents = useMemo(() => materialEvents.filter((event) => event.event_type === "missing"), [materialEvents]);
  const excessEvents = useMemo(() => materialEvents.filter((event) => event.event_type === "excess"), [materialEvents]);

  const deliveredQty = useCallback((bundle: Bundle) => {
    let total = 0;
    const refCount = (bundlesByReference.get(normaliseBundleKey(bundle.bundle_no)) || []).length;

    deliveries.forEach((delivery) => {
      (delivery.tower_bundle_delivery_items || []).forEach((item) => {
        if (item.bundle_id && bundle.id && item.bundle_id === bundle.id) {
          total += Math.max(safeNumber(item.qty_delivered), 0);
          return;
        }

        // Old delivery rows only have bundle_no. Use those rows only if the
        // display reference is unique on this tower; never double-count a
        // legacy quantity across duplicate bundle references.
        if (
          !item.bundle_id &&
          refCount === 1 &&
          normaliseBundleKey(item.bundle_no) === normaliseBundleKey(bundle.bundle_no)
        ) {
          total += Math.max(safeNumber(item.qty_delivered), 0);
        }
      });
    });

    return total;
  }, [bundlesByReference, deliveries]);

  const receivedQty = useCallback((bundle: Bundle) => {
    return Math.max(getBundleCheck(bundle)?.qty_received || 0, 0);
  }, [getBundleCheck]);

  const getMemberCheck = useCallback((member: Member) => {
    const bundle = resolveBundleForMember(member);
    if (!bundle?.id) return undefined;
    return memberCheckMap.get(`${bundle.id}__${member.mark_no.trim().toUpperCase()}`);
  }, [memberCheckMap, resolveBundleForMember]);

  const membersForBundle = useCallback((bundle: Bundle) => {
    return bundle.id ? membersByBundleId.get(bundle.id) || [] : [];
  }, [membersByBundleId]);

  const deriveBundleStatus = useCallback((bundle: Bundle): BundleCheckStatus => {
    const manual = getBundleCheck(bundle);
    const received = Math.max(manual?.qty_received || 0, 0);

    if (manual?.status === "issue") return "issue";
    if (manual?.status === "missing" && received <= 0) return "missing";
    if (received >= Math.max(bundle.qty_required, 1)) return "arrived";
    if (received > 0) return "partial";

    const related = membersForBundle(bundle);
    if (!related.length) return manual?.status || "not_checked";

    const statuses = related.map((member) => getMemberCheck(member)?.status || "not_checked");
    if (statuses.some((status) => status === "issue")) return "issue";
    if (statuses.every((status) => status === "arrived")) return "arrived";
    if (statuses.every((status) => status === "missing")) return "missing";
    if (statuses.some((status) => status !== "not_checked")) return "partial";

    return manual?.status || "not_checked";
  }, [getBundleCheck, getMemberCheck, membersForBundle]);

  const saveBundleCheck = useCallback(async (
    bundle: Bundle,
    qtyReceived: number,
    forcedStatus?: BundleCheckStatus,
  ) => {
    if (!bundle.id) {
      alert("Save this bundle in Register & Imports before recording a site check.");
      return;
    }

    const cleanQty = Math.max(Math.round(qtyReceived), 0);
    const required = Math.max(bundle.qty_required, 1);
    const status: BundleCheckStatus =
      forcedStatus ||
      (cleanQty <= 0 ? "not_checked" : cleanQty < required ? "partial" : "arrived");

    const payload = {
      tower_id: towerId,
      bundle_id: bundle.id,
      bundle_no: bundle.bundle_no.trim(),
      status,
      notes: getBundleCheck(bundle)?.notes || "",
      checked_by: "Site Check",
      checked_at: new Date().toISOString(),
      qty_received: cleanQty,
    };

    setSaving(true);
    const { error } = await supabase
      .from("tower_material_bundle_checks")
      .upsert(payload, { onConflict: "bundle_id" });
    setSaving(false);

    if (error) {
      console.error("bundle check save error", error);
      alert("Failed to save bundle check.");
      return;
    }

    setBundleChecks((prev) => [
      ...prev.filter((row) => row.bundle_id !== bundle.id),
      payload,
    ]);
  }, [getBundleCheck, supabase, towerId]);

  const clearBundleCheck = useCallback(async (bundle: Bundle) => {
    if (!bundle.id) {
      alert("Save this bundle before clearing its checks.");
      return;
    }

    setSaving(true);
    const [bundleResult, memberResult] = await Promise.all([
      supabase.from("tower_material_bundle_checks").delete().eq("bundle_id", bundle.id),
      supabase.from("tower_material_member_checks").delete().eq("bundle_id", bundle.id),
    ]);
    setSaving(false);

    if (bundleResult.error || memberResult.error) {
      console.error("clear bundle checks error", bundleResult.error || memberResult.error);
      alert("Failed to clear bundle check.");
      return;
    }

    setBundleChecks((prev) => prev.filter((row) => row.bundle_id !== bundle.id));
    setMemberChecks((prev) => prev.filter((row) => row.bundle_id !== bundle.id));
  }, [supabase]);

  const updateMemberStatus = useCallback(async (member: Member, status: MemberCheckStatus) => {
    const bundle = resolveBundleForMember(member);

    if (!bundle?.id) {
      alert(
        `TTTracker cannot safely resolve the bundle for member ${member.mark_no}. ` +
          "Check the member's Tower Segment in Register & Imports.",
      );
      return;
    }

    const payload = {
      tower_id: towerId,
      bundle_id: bundle.id,
      bundle_no: bundle.bundle_no.trim(),
      mark_no: member.mark_no.trim(),
      status,
      notes: getMemberCheck(member)?.notes || "",
      checked_by: "Site Check",
      checked_at: new Date().toISOString(),
    };

    setSaving(true);
    const { error } = await supabase
      .from("tower_material_member_checks")
      .upsert(payload, { onConflict: "bundle_id,mark_no" });
    setSaving(false);

    if (error) {
      console.error("member status save error", error);
      alert("Failed to save member status.");
      return;
    }

    const key = `${bundle.id}__${payload.mark_no.toUpperCase()}`;
    setMemberChecks((prev) => [
      ...prev.filter(
        (row) => `${row.bundle_id || ""}__${row.mark_no.trim().toUpperCase()}` !== key,
      ),
      payload,
    ]);
  }, [getMemberCheck, resolveBundleForMember, supabase, towerId]);

  const clearMemberStatus = useCallback(async (member: Member) => {
    const bundle = resolveBundleForMember(member);

    if (!bundle?.id) {
      alert("TTTracker cannot safely resolve this member's bundle.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("tower_material_member_checks")
      .delete()
      .eq("bundle_id", bundle.id)
      .eq("mark_no", member.mark_no.trim());
    setSaving(false);

    if (error) {
      console.error("clear member status error", error);
      alert("Failed to clear member status.");
      return;
    }

    const key = `${bundle.id}__${member.mark_no.trim().toUpperCase()}`;
    setMemberChecks((prev) =>
      prev.filter(
        (row) => `${row.bundle_id || ""}__${row.mark_no.trim().toUpperCase()}` !== key,
      ),
    );
  }, [resolveBundleForMember, supabase]);

  return {
    tower,
    latestDate,
    bundles,
    members,
    bolts,
    bundleChecks,
    memberChecks,
    materialEvents,
    dockets,
    docketMap,
    missingEvents,
    excessEvents,
    loading,
    saving,
    duplicateBundleRefs,
    deliveredQty,
    receivedQty,
    getMemberCheck,
    membersForBundle,
    deriveBundleStatus,
    saveBundleCheck,
    clearBundleCheck,
    updateMemberStatus,
    clearMemberStatus,
    refresh: load,
  };
}

type SearchMode = "members" | "bundles";

function MaterialsSearch({ data }: { data: MaterialsData }) {
  const [mode, setMode] = useState<SearchMode>("members");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = normaliseSearch(query);

  const memberResults: Member[] = !q
    ? []
    : data.members.filter((member: Member) =>
        [member.mark_no, member.bundle_reference, member.drawing_number, member.section, member.tower_segment]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );

  const bundleResults: Bundle[] = !q
    ? []
    : data.bundles.filter((bundle: Bundle) => {
        const contents = data.membersForBundle(bundle);
        return [
          bundle.bundle_no,
          bundle.section,
          ...contents.map((member: Member) => `${member.mark_no} ${member.drawing_number} ${member.section} ${member.tower_segment}`),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
        <div className="grid grid-cols-2 gap-1">
          <button type="button" onClick={() => { setMode("members"); setQuery(""); setExpanded(null); }} className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${mode === "members" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Search Members</button>
          <button type="button" onClick={() => { setMode("bundles"); setQuery(""); setExpanded(null); }} className={`rounded-xl px-3 py-2.5 text-sm font-black transition ${mode === "bundles" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Search Bundles</button>
        </div>
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === "members" ? "Search member number, drawing, profile or segment…" : "Search bundle number, segment or a member inside the bundle…"}
          className="w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-10 text-sm outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100"
        />
        {query && <button type="button" onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800" title="Clear search"><X size={17} /></button>}
      </div>

      {!query ? (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">{mode === "members" ? <Search size={20} /> : <Boxes size={20} />}</div>
          <div className="mt-3 text-sm font-black text-slate-800">{mode === "members" ? "Search for a specific steel member" : "Search for a bundle or pack"}</div>
          <div className="mt-1 text-xs text-slate-500">Results appear as you type so the page stays clean on site.</div>
        </div>
      ) : mode === "members" ? (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-bold text-slate-400">{memberResults.length} result(s)</div>
          {memberResults.length === 0 ? <SearchEmpty text={`No members match “${query}”.`} /> : memberResults.map((member: Member) => (
            <div key={member.id || `${member.bundle_reference}-${member.mark_no}`} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div><div className="text-base font-black text-slate-950">{member.mark_no}</div><div className="mt-1 text-xs text-slate-500">Bundle <strong className="text-slate-800">{member.bundle_reference || "—"}</strong> · Drawing {member.drawing_number || "—"}</div></div>
                <div className="grid grid-cols-3 gap-2 text-xs md:min-w-97.5">
                  <SearchInfo label="Profile" value={member.section || "—"} />
                  <SearchInfo label="Qty / Tower" value={member.qty_per_tower ?? "—"} />
                  <SearchInfo label="Tower Segment" value={member.tower_segment || "—"} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-bold text-slate-400">{bundleResults.length} result(s)</div>
          {bundleResults.length === 0 ? <SearchEmpty text={`No bundles match “${query}”.`} /> : bundleResults.map((bundle: Bundle) => {
            const key = bundleUiKey(bundle);
            const open = expanded === key;
            const contents = data.membersForBundle(bundle);
            const duplicate = data.duplicateBundleRefs.has(normaliseBundleKey(bundle.bundle_no));
            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button type="button" onClick={() => setExpanded(open ? null : key)} className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50">
                  <div><div className="flex items-center gap-2"><div className="text-base font-black text-slate-950">{bundle.bundle_no}</div>{duplicate && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">DUPLICATE REF</span>}</div><div className="mt-1 text-xs text-slate-500">{bundle.section} · {contents.length} member line(s) · Required {bundle.qty_required}</div></div>
                  <div className="flex items-center gap-2 text-xs font-black text-slate-600"><PackageOpen size={16} /> {open ? "Hide contents" : "Open contents"}</div>
                </button>

                {open && <div className="border-t border-slate-200 bg-slate-50 p-2">{contents.length === 0 ? <div className="rounded-xl bg-white p-4 text-sm text-slate-500">No member records are linked to this bundle.</div> : <div className="space-y-1.5">{contents.map((member: Member) => <div key={member.id || `${member.mark_no}-${member.bundle_reference}`} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-2.5 md:grid-cols-[1.1fr_1fr_1.2fr_0.6fr_1.2fr]"><SearchInfo label="Member" value={member.mark_no} strong /><SearchInfo label="Profile" value={member.section || "—"} /><SearchInfo label="Drawing" value={member.drawing_number || "—"} /><SearchInfo label="Qty" value={member.qty_per_tower ?? "—"} /><SearchInfo label="Segment" value={member.tower_segment || "—"} /></div>)}</div>}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SearchInfo({ label, value, strong }: { label: string; value: string | number; strong?: boolean }) {
  return <div className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className={`truncate text-xs text-slate-800 ${strong ? "font-black" : "font-bold"}`}>{value}</div></div>;
}

function SearchEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>;
}

function BundleControl({ data }: { data: MaterialsData }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | BundleCheckStatus>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const q = normaliseSearch(query);

  const filtered = data.bundles.filter((bundle: Bundle) => {
    const status = data.deriveBundleStatus(bundle);
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (!q) return true;

    const contents = data.membersForBundle(bundle);
    const searchable = [
      bundle.bundle_no,
      bundle.section,
      ...contents.map((member) => `${member.mark_no} ${member.section} ${member.tower_segment}`),
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(q);
  });

  const completed = data.bundles.filter(
    (bundle: Bundle) => data.deriveBundleStatus(bundle) === "arrived",
  ).length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <BundleSummary label="Bundles" value={data.bundles.length} />
        <BundleSummary label="Complete" value={completed} />
        <BundleSummary label="Outstanding" value={Math.max(data.bundles.length - completed, 0)} />
      </div>

      {data.duplicateBundleRefs.size > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Duplicate bundle references detected:</strong>{" "}
          {Array.from(data.duplicateBundleRefs).join(", ")}. These are now handled as separate bundle UUID records; the section identifies the display pack while checks are saved against the UUID.
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_220px]">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter bundle number, segment or contained member…"
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-slate-100"
        />

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | BundleCheckStatus)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="not_checked">Not checked</option>
          <option value="partial">Partial</option>
          <option value="arrived">Arrived</option>
          <option value="missing">Missing</option>
          <option value="issue">Issue</option>
        </select>
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length === 0 ? (
          <BundleEmpty text="No bundles match the current filters." />
        ) : (
          filtered.map((bundle: Bundle) => {
            const key = bundleUiKey(bundle);
            const open = Boolean(expanded[key]);
            const status = data.deriveBundleStatus(bundle);
            const received = data.receivedQty(bundle);
            const delivered = data.deliveredQty(bundle);
            const remaining = Math.max(bundle.qty_required - received, 0);
            const excess = Math.max(received - bundle.qty_required, 0);
            const duplicate = data.duplicateBundleRefs.has(normaliseBundleKey(bundle.bundle_no));
            const contents = data.membersForBundle(bundle);

            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="p-3">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-black text-slate-950">{bundle.bundle_no}</div>
                        <Pill className={statusClasses(status)}>{statusLabel(status)}</Pill>
                        {duplicate && <Pill className="border-amber-200 bg-amber-50 text-amber-700">Duplicate ref</Pill>}
                        {excess > 0 && <Pill className="border-blue-200 bg-blue-50 text-blue-700">+{excess} excess</Pill>}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {bundle.section} · Required {bundle.qty_required} · Delivered {delivered} · Site received {received} · Remaining {remaining}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
                        <button
                          type="button"
                          
                          onClick={() => void data.saveBundleCheck(bundle, Math.max(received - 1, 0))}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-800 shadow-sm"
                          title="Reduce received quantity"
                        >
                          <Minus size={16} />
                        </button>

                        <div className="min-w-21 text-center">
                          <div className="text-base font-black text-slate-950">{received}/{bundle.qty_required}</div>
                          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">received</div>
                        </div>

                        <button
                          type="button"
                          
                          onClick={() => void data.saveBundleCheck(bundle, received + 1)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white"
                          title="Add received quantity"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      <button type="button"  onClick={() => void data.saveBundleCheck(bundle, bundle.qty_required, "arrived")} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Full</button>
                      <button type="button"  onClick={() => void data.saveBundleCheck(bundle, 0, "missing")} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Missing</button>
                      <button type="button"  onClick={() => void data.saveBundleCheck(bundle, received, "issue")} className="rounded-xl bg-violet-50 px-3 py-2 text-xs font-black text-violet-700">Issue</button>
                      <button type="button"  onClick={() => void data.clearBundleCheck(bundle)} className="flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"><RotateCcw size={13} /> Clear</button>
                      <button type="button" onClick={() => setExpanded((prev) => ({ ...prev, [key]: !open }))} className="flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {open ? "Hide Pack" : "Open Pack"}
                      </button>
                    </div>
                  </div>
                </div>

                {open && (
                  <div className="border-t border-slate-200 bg-slate-50 p-2 md:p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-400">Bundle contents</div>
                      <div className="text-xs font-bold text-slate-500">{contents.length} member line(s)</div>
                    </div>

                    {contents.length === 0 ? (
                      <div className="rounded-xl bg-white p-4 text-sm text-slate-500">No member records are linked to this bundle.</div>
                    ) : (
                      <div className="space-y-1.5">
                        {contents.map((member) => {
                          const memberStatus: MemberCheckStatus = data.getMemberCheck(member)?.status || "not_checked";

                          return (
                            <div key={member.id || `${member.mark_no}-${member.bundle_reference}`} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-2.5 md:grid-cols-[1fr_1fr_0.7fr_1fr_auto] md:items-center">
                              <BundleInfo label="Member" value={member.mark_no} />
                              <BundleInfo label="Profile" value={member.section || "—"} />
                              <BundleInfo label="Qty / Tower" value={member.qty_per_tower ?? "—"} />
                              <BundleInfo label="Segment" value={member.tower_segment || "—"} />
                              <Pill className={statusClasses(memberStatus)}>{statusLabel(memberStatus)}</Pill>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${className}`}>{children}</span>;
}

function BundleSummary({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"><div className="text-[9px] font-black uppercase text-slate-400">{label}</div><div className="text-lg font-black text-slate-950">{value}</div></div>;
}

function BundleInfo({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="truncate text-xs font-bold text-slate-800">{value}</div></div>;
}

function BundleEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>;
}

function MaterialIssues({
  mode,
  data,
  projectId,
  towerId,
}: {
  mode: "missing" | "excess";
  data: MaterialsData;
  projectId: string;
  towerId: string;
}) {
  const [query, setQuery] = useState("");
  const isMissing = mode === "missing";
  const events = isMissing ? data.missingEvents : data.excessEvents;
  const q = normaliseSearch(query);

  const filteredEvents = !q
    ? events
    : events.filter((event: MaterialEvent) =>
        [
          event.notes,
          event.affected_activity,
          event.affected_section,
          event.current_effect,
          event.work_outcome,
          ...event.items.flatMap((item) => [item.item_reference, item.item_description, item.material_type, item.bolt_size]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );

  const siteMissingMembers: Member[] = isMissing
    ? data.members.filter((member: Member) => data.getMemberCheck(member)?.status === "missing")
    : [];

  const siteMissingBundles: Bundle[] = isMissing
    ? data.bundles.filter((bundle: Bundle) => data.deriveBundleStatus(bundle) === "missing")
    : [];

  const overReceived = !isMissing
    ? data.bundles
        .map((bundle: Bundle) => {
          const received = data.receivedQty(bundle);
          return { bundle, received, excess: Math.max(received - bundle.qty_required, 0) };
        })
        .filter((row) => row.excess > 0)
    : [];

  const docketItemCount = events.reduce((sum: number, event: MaterialEvent) => sum + event.items.length, 0);
  const otherCount = isMissing ? siteMissingMembers.length + siteMissingBundles.length : overReceived.length;

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 md:max-w-lg">
        <IssueSummary label={isMissing ? "Docket Missing Items" : "Docket Excess Items"} value={docketItemCount} />
        <IssueSummary label={isMissing ? "Site Checks Missing" : "Bundle Overages"} value={otherCount} />
      </div>

      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${isMissing ? "missing" : "excess"} material records…`}
          className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-slate-100"
        />
      </div>

      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-wide text-slate-400">Daily Docket Records</div>
            <div className="mt-0.5 text-xs text-slate-500">These are read directly from the existing structured material events saved by Daily Dockets.</div>
          </div>
          <Link href={`/project/${projectId}/tower/${towerId}/dockets`} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-200"><ExternalLink size={12} /> Dockets</Link>
        </div>

        {filteredEvents.length === 0 ? (
          <IssueEmpty text={`No ${isMissing ? "missing" : "excess"} Daily Docket records match the current search.`} />
        ) : (
          <div className="space-y-2">
            {filteredEvents.map((event: MaterialEvent) => (
              <MaterialEventCard key={event.id} event={event} data={data} tone={isMissing ? "rose" : "blue"} />
            ))}
          </div>
        )}
      </section>

      {isMissing ? (
        <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section>
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Bundles Marked Missing</div>
            {siteMissingBundles.length === 0 ? <IssueEmpty text="No bundle checks are currently marked missing." /> : <div className="space-y-2">{siteMissingBundles.map((bundle: Bundle) => <div key={bundle.id || `${bundle.bundle_no}-${bundle.section}`} className="rounded-2xl border border-rose-200 bg-white p-3 shadow-sm"><div className="font-black text-slate-950">{bundle.bundle_no}</div><div className="mt-1 text-xs text-slate-500">{bundle.section} · Required {bundle.qty_required} · Site received {data.receivedQty(bundle)}</div></div>)}</div>}
          </section>

          <section>
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Members Marked Missing</div>
            {siteMissingMembers.length === 0 ? <IssueEmpty text="No member checks are currently marked missing." /> : <div className="space-y-2">{siteMissingMembers.map((member: Member) => <div key={member.id || `${member.bundle_reference}-${member.mark_no}`} className="rounded-2xl border border-rose-200 bg-white p-3 shadow-sm"><div className="font-black text-slate-950">{member.mark_no}</div><div className="mt-1 text-xs text-slate-500">Bundle {member.bundle_reference} · {member.section || "—"} · {member.tower_segment || "—"}</div></div>)}</div>}
          </section>
        </div>
      ) : (
        <section className="mt-6">
          <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Bundle Quantity Overages</div>
          {overReceived.length === 0 ? <IssueEmpty text="No bundle quantities are currently recorded above the tower requirement." /> : <div className="space-y-2">{overReceived.map(({ bundle, received, excess }) => (
            <div key={bundle.id || `${bundle.bundle_no}-${bundle.section}`} className="rounded-2xl border border-blue-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div><div className="font-black text-slate-950">{bundle.bundle_no}</div><div className="mt-1 text-xs text-slate-500">{bundle.section} · Required {bundle.qty_required} · Received {received}</div></div>
                <div className="rounded-xl bg-blue-50 px-3 py-2 text-center"><div className="text-[9px] font-black uppercase tracking-wide text-blue-500">Excess</div><div className="text-xl font-black text-blue-800">+{excess}</div></div>
              </div>
            </div>
          ))}</div>}
        </section>
      )}
    </div>
  );
}

function MaterialEventCard({ event, data, tone }: { event: MaterialEvent; data: MaterialsData; tone: "rose" | "blue" }) {
  const docket = event.docket_id ? data.docketMap.get(event.docket_id) : undefined;
  const toneClasses = tone === "rose" ? "border-rose-200 bg-rose-50/50" : "border-blue-200 bg-blue-50/50";

  return (
    <div className={`rounded-2xl border p-3 ${toneClasses}`}>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-black text-slate-950">{docket?.docket_date ? formatDate(docket.docket_date) : formatDate(event.occurred_at)}{docket?.crew ? ` · ${docket.crew}` : ""}</div>
          <div className="mt-1 text-xs text-slate-500">{event.affected_section || "No segment specified"}{event.affected_work ? ` · Work impact: ${workOutcomeLabel(event.work_outcome)}` : " · No work impact recorded"}</div>
        </div>
        {event.impact_ongoing && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black text-amber-700">ONGOING</span>}
      </div>

      <div className="mt-3 space-y-1.5">
        {event.items.length === 0 ? <div className="rounded-xl bg-white p-2.5 text-xs text-slate-500">No item rows were stored on this event.</div> : event.items.map((item) => (
          <div key={item.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="min-w-16 text-center"><div className="text-[9px] font-black uppercase text-slate-400">Qty</div><div className="font-black text-slate-950">{item.quantity ?? 1} {item.unit || "ea"}</div></div>
            <div className="min-w-0"><div className="font-black text-slate-950">{item.item_reference || item.bolt_size || "Unlisted material"}</div><div className="mt-0.5 text-xs text-slate-500">{item.item_description || item.material_type || "—"}</div></div>
          </div>
        ))}
      </div>

      {(event.notes || event.current_effect || event.affected_activity) && (
        <div className="mt-2 rounded-xl bg-white p-2.5 text-xs text-slate-600">
          {event.affected_activity && <div><strong>Activity:</strong> {event.affected_activity}</div>}
          {event.current_effect && <div className="mt-1"><strong>Current effect:</strong> {event.current_effect}</div>}
          {event.notes && <div className="mt-1"><strong>Notes:</strong> {event.notes}</div>}
        </div>
      )}
    </div>
  );
}

function IssueSummary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-xl font-black text-slate-950">{value}</div></div>;
}

function IssueEmpty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">{text}</div>;
}

function BoltRegister({ bolts }: { bolts: Bolt[] }) {
  const [query, setQuery] = useState("");
  const [segment, setSegment] = useState("all");

  const segments: string[] = Array.from(
    new Set<string>(
      bolts.map((bolt: Bolt) => bolt.tower_segment).filter((value): value is string => Boolean(value?.trim())),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const q = normaliseSearch(query);
  const filtered: Bolt[] = bolts.filter((bolt: Bolt) => {
    if (segment !== "all" && bolt.tower_segment !== segment) return false;
    if (!q) return true;
    return [bolt.tower_segment, bolt.bolt_diameter, bolt.dn_sn, bolt.length, bolt.qty]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const totalQty = filtered.reduce((sum: number, bolt: Bolt) => sum + Number(bolt.qty || 0), 0);

  return (
    <div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between print:hidden">
        <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_260px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search diameter, DN/SN, length or segment…" className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-4 focus:ring-slate-100" />
          </div>

          <select value={segment} onChange={(event) => setSegment(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">
            <option value="all">All tower segments</option>
            {segments.map((item: string) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-100 px-3 py-2.5 text-xs font-black text-slate-700"><Printer size={14} /> Print</button>
      </div>

      <div className="mt-3 grid max-w-md grid-cols-2 gap-2"><BoltSummary label="Rows" value={filtered.length} /><BoltSummary label="Bolt Qty" value={totalQty} /></div>

      <div className="mt-3">
        {filtered.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No bolts match the current filters.</div> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2 text-left">Tower Segment</th><th className="px-3 py-2 text-center">Diameter</th><th className="px-3 py-2 text-center">DN/SN</th><th className="px-3 py-2 text-center">Length</th><th className="px-3 py-2 text-center">Qty</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filtered.map((bolt: Bolt) => <tr key={bolt.id || `${bolt.tower_segment}-${bolt.bolt_diameter}-${bolt.dn_sn}-${bolt.length}`}><td className="px-3 py-2.5 font-bold text-slate-900">{bolt.tower_segment || "—"}</td><td className="px-3 py-2.5 text-center font-black text-slate-900">{bolt.bolt_diameter || "—"}</td><td className="px-3 py-2.5 text-center font-black uppercase text-slate-900">{bolt.dn_sn || "—"}</td><td className="px-3 py-2.5 text-center font-black text-slate-900">{bolt.length || "—"}</td><td className="px-3 py-2.5 text-center"><span className="inline-flex min-w-12 justify-center rounded-lg bg-slate-100 px-2 py-1 font-black text-slate-950">{bolt.qty}</span></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BoltSummary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="text-xl font-black text-slate-950">{value}</div></div>;
}

type Tab = "search" | "bundles" | "missing" | "excess" | "bolts";

const tabs: Array<{ id: Tab; label: string; icon: typeof Search }> = [
  { id: "search", label: "Search", icon: Search },
  { id: "bundles", label: "Bundle Control", icon: PackageCheck },
  { id: "missing", label: "Missing", icon: TriangleAlert },
  { id: "excess", label: "Excess", icon: CirclePlus },
  { id: "bolts", label: "Bolts", icon: Wrench },
];

export default function MaterialsControlPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;
  const data = useMaterialsData(towerId);
  const [activeTab, setActiveTab] = useState<Tab>("search");

  const bundleMissing = data.bundles.filter((bundle: Bundle) => data.deriveBundleStatus(bundle) === "missing").length;
  const memberMissing = data.members.filter((member: Member) => data.getMemberCheck(member)?.status === "missing").length;
  const docketMissingItems = data.missingEvents.reduce((sum: number, event) => sum + event.items.length, 0);
  const docketExcessItems = data.excessEvents.reduce((sum: number, event) => sum + event.items.length, 0);
  const overReceived = data.bundles.filter((bundle: Bundle) => data.receivedQty(bundle) > bundle.qty_required).length;
  const completed = data.bundles.filter((bundle: Bundle) => data.deriveBundleStatus(bundle) === "arrived").length;

  const stats = {
    completed,
    missing: docketMissingItems + bundleMissing + memberMissing,
    excess: docketExcessItems + overReceived,
  };

  if (data.loading) {
    return <div className="min-h-screen bg-slate-50 p-6 text-sm text-slate-500">Loading materials control…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-2 md:p-6">
      <div className="mx-auto max-w-7xl space-y-3">
        {data.tower && <TowerHeader projectId={projectId} tower={data.tower} latestDate={data.latestDate} />}

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4 md:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><Boxes size={19} /></div>
                <div><h1 className="text-xl font-black tracking-tight text-slate-950 md:text-2xl">Materials Control</h1><p className="mt-0.5 max-w-3xl text-sm text-slate-500">One workspace for material lookup, bundle receiving, Daily Docket missing/excess records and bolts.</p></div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {data.saving && <span className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Saving…</span>}
                <Link href={`/project/${projectId}/tower/${towerId}/materials/register`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-200"><Settings2 size={14} /> Register & Imports</Link>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
              <MainSummary label="Bundles" value={data.bundles.length} />
              <MainSummary label="Received" value={stats.completed} tone="green" />
              <MainSummary label="Members" value={data.members.length} />
              <MainSummary label="Missing" value={stats.missing} tone="red" />
              <MainSummary label="Excess" value={stats.excess} tone="blue" />
              <MainSummary label="Bolts" value={data.bolts.length} />
            </div>
          </div>

          <div className="border-b border-slate-200 bg-slate-50 px-2 py-2 md:px-4">
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                const count = tab.id === "missing" ? stats.missing : tab.id === "excess" ? stats.excess : null;
                return <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950"}`}><Icon size={15} />{tab.label}{count !== null && count > 0 && <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black ${active ? "bg-white/15 text-white" : tab.id === "missing" ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"}`}>{count}</span>}</button>;
              })}
            </div>
          </div>

          <div className="p-3 md:p-5">
            {activeTab === "search" && <MaterialsSearch data={data} />}
            {activeTab === "bundles" && <BundleControl data={data} />}
            {activeTab === "missing" && <MaterialIssues mode="missing" data={data} projectId={projectId} towerId={towerId} />}
            {activeTab === "excess" && <MaterialIssues mode="excess" data={data} projectId={projectId} towerId={towerId} />}
            {activeTab === "bolts" && <BoltRegister bolts={data.bolts} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function MainSummary({ label, value, tone = "slate" }: { label: string; value: string | number; tone?: "slate" | "green" | "red" | "blue" }) {
  const styles = {
    slate: "border-slate-200 bg-slate-50 text-slate-950",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-rose-200 bg-rose-50 text-rose-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
  };
  return <div className={`rounded-xl border px-3 py-2.5 ${styles[tone]}`}><div className="text-[9px] font-black uppercase tracking-wide opacity-50">{label}</div><div className="mt-0.5 text-xl font-black">{value}</div></div>;
}

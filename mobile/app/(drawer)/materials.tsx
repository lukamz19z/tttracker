import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

/* =========================================================
   TYPES
========================================================= */

type Tower = {
  id: string;
  project_id: string;
  name?: string | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  status?: string | null;
  extra_data?: Record<string, unknown> | null;
};

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
  id?: string;
  tower_id: string;
  bundle_reference: string;
  drawing_number: string;
  mark_no: string;
  pn_final: string;
  qty_per_tower: number;
  section: string;
};

type DbBoltRow = {
  id?: string;
  tower_id: string;
  tower_segment: string | null;
  bolt_diameter: string | null;
  dn_sn: string | null;
  length: string | null;
  qty: number | null;
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

type DeliveryItem = {
  bundle_no: string;
  qty_delivered: number | null;
};

type Delivery = {
  tower_bundle_delivery_items: DeliveryItem[] | null;
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
  status: BundleCheckStatus | null;
  notes: string | null;
  checked_by: string | null;
  checked_at: string | null;
  qty_received: number | null;
};

type BundleCheck = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  status: BundleCheckStatus;
  notes: string;
  checked_by: string;
  checked_at: string | null;
  qty_received: number;
};

type DbMemberCheckRow = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  mark_no: string;
  status: MemberCheckStatus | null;
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

type ViewMode = "bundles" | "members" | "bolts";

type SelectorOption = {
  id: string;
  label: string;
  subtitle?: string;
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normaliseSearch(value: string): string {
  return value.trim().toLowerCase();
}

function normaliseSection(value: string): string {
  const raw = value.trim();

  if (!raw) return "General";

  const compact = raw
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const legMatch = compact.match(/^(\d+)\s*m?\s*leg(s)?$/i);

  if (legMatch) {
    return `${legMatch[1]} Leg`;
  }

  return compact
    .replace(/\blegs\b/g, "leg")
    .replace(/\bbody ext\b/g, "body extension")
    .replace(/\bcommon body\b/g, "common body")
    .replace(/\bcrossarms?\b/g, "crossarms")
    .split(" ")
    .map((word) =>
      word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : word,
    )
    .join(" ");
}

function normaliseBoltDiameter(value: string): string {
  const trimmed = value.trim().toUpperCase();

  if (!trimmed) return "";

  return trimmed.startsWith("M") ? trimmed : `M${trimmed}`;
}

function matchesText(
  ...values: (string | number | null | undefined)[]
): string {
  return values
    .map((value) =>
      value === null || value === undefined ? "" : String(value),
    )
    .join(" ")
    .toLowerCase();
}

function getTowerLabel(tower: Tower): string {
  const extra = tower.extra_data ?? {};

  return (
    safeString(tower.tower_number) ||
    safeString(tower.structure_number) ||
    safeString(tower.tower_no) ||
    safeString(tower.name) ||
    safeString(extra["Tower No"]) ||
    safeString(extra["Tower Number"]) ||
    safeString(extra["Structure Number"]) ||
    safeString(extra["Structure No"]) ||
    "Unknown tower"
  );
}

function statusLabel(
  status: BundleCheckStatus | MemberCheckStatus,
): string {
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
    default:
      return "Not Checked";
  }
}

function getStatusStyle(
  status: BundleCheckStatus | MemberCheckStatus,
) {
  switch (status) {
    case "arrived":
      return {
        backgroundColor: "#DCFCE7",
        borderColor: "#86EFAC",
        color: "#166534",
      };

    case "partial":
      return {
        backgroundColor: "#FEF3C7",
        borderColor: "#FCD34D",
        color: "#92400E",
      };

    case "missing":
      return {
        backgroundColor: "#FFE4E6",
        borderColor: "#FDA4AF",
        color: "#BE123C",
      };

    case "not_here":
      return {
        backgroundColor: "#FFEDD5",
        borderColor: "#FDBA74",
        color: "#C2410C",
      };

    case "issue":
      return {
        backgroundColor: "#F3E8FF",
        borderColor: "#D8B4FE",
        color: "#7E22CE",
      };

    default:
      return {
        backgroundColor: "#F1F5F9",
        borderColor: "#CBD5E1",
        color: "#475569",
      };
  }
}

function getStatusAccent(
  status: BundleCheckStatus | MemberCheckStatus,
): string {
  switch (status) {
    case "arrived":
      return "#16A34A";
    case "partial":
      return "#D97706";
    case "missing":
      return "#E11D48";
    case "not_here":
      return "#EA580C";
    case "issue":
      return "#9333EA";
    default:
      return "#CBD5E1";
  }
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;

  return Math.min((part / total) * 100, 100);
}

/* =========================================================
   PAGE
========================================================= */

export default function MaterialsScreen() {
  // UI VERSION: MATERIALS-GLOBAL-PROJECT-2026-07-12
  const { profile } = useAuth();

  const selectedProjectId = profile?.projectId ?? "";

  const [towers, setTowers] = useState<Tower[]>([]);
  const [selectedTowerId, setSelectedTowerId] = useState("");

  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [bolts, setBolts] = useState<Bolt[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [bundleChecks, setBundleChecks] = useState<BundleCheck[]>([]);
  const [memberChecks, setMemberChecks] = useState<MemberCheck[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>("bundles");
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [showOutstandingOnly, setShowOutstandingOnly] = useState(true);
  const [showCompletedBundles, setShowCompletedBundles] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  const [expandedBundleNo, setExpandedBundleNo] = useState<string | null>(
    null,
  );

  const [loadingTowers, setLoadingTowers] = useState(false);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTitle, setSelectorTitle] = useState("");
  const [selectorOptions, setSelectorOptions] = useState<SelectorOption[]>(
    [],
  );
  const [selectorOnSelect, setSelectorOnSelect] = useState<
    ((option: SelectorOption) => void) | null
  >(null);

  /* =========================================================
     LOAD TOWERS
  ========================================================= */

  const loadTowers = useCallback(async (projectId: string) => {
    if (!projectId) {
      setTowers([]);
      setSelectedTowerId("");
      return;
    }

    setLoadingTowers(true);

    const { data, error } = await supabase
      .from("towers")
      .select("*")
      .eq("project_id", projectId)
      .order("name", { ascending: true });

    if (error) {
      console.error("Materials towers error:", error);
      Alert.alert("Could not load towers", error.message);
      setTowers([]);
      setSelectedTowerId("");
      setLoadingTowers(false);
      return;
    }

    const loadedTowers = (data ?? []) as Tower[];

    loadedTowers.sort((a, b) =>
      getTowerLabel(a).localeCompare(getTowerLabel(b), undefined, {
        numeric: true,
      }),
    );

    setTowers(loadedTowers);

    setSelectedTowerId((current) => {
      if (
        current &&
        loadedTowers.some((tower) => tower.id === current)
      ) {
        return current;
      }

      return loadedTowers[0]?.id ?? "";
    });

    setLoadingTowers(false);
  }, []);

  useEffect(() => {
    setSelectedTowerId("");
    setBundles([]);
    setMembers([]);
    setBolts([]);
    setDeliveries([]);
    setBundleChecks([]);
    setMemberChecks([]);
    setExpandedBundleNo(null);
    setSearch("");
    setSectionFilter("all");
    setShowOutstandingOnly(true);
    setShowCompletedBundles(false);

    void loadTowers(selectedProjectId);
  }, [selectedProjectId, loadTowers]);

  /* =========================================================
     LOAD MATERIALS
  ========================================================= */

  const loadMaterials = useCallback(
    async (towerId: string, silent = false) => {
      if (!towerId) {
        setBundles([]);
        setMembers([]);
        setBolts([]);
        setDeliveries([]);
        setBundleChecks([]);
        setMemberChecks([]);
        return;
      }

      if (!silent) {
        setLoadingMaterials(true);
      }

      const [
        bundlesResponse,
        membersResponse,
        boltsResponse,
        deliveriesResponse,
        bundleChecksResponse,
        memberChecksResponse,
      ] = await Promise.all([
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
          .from("tower_material_bolts")
          .select("*")
          .eq("tower_id", towerId)
          .order("tower_segment", { ascending: true })
          .order("bolt_diameter", { ascending: true })
          .order("length", { ascending: true }),

        supabase
          .from("tower_bundle_deliveries")
          .select("tower_bundle_delivery_items(*)")
          .eq("tower_id", towerId),

        supabase
          .from("tower_material_bundle_checks")
          .select("*")
          .eq("tower_id", towerId),

        supabase
          .from("tower_material_member_checks")
          .select("*")
          .eq("tower_id", towerId),
      ]);

      const firstError =
        bundlesResponse.error ||
        membersResponse.error ||
        boltsResponse.error ||
        deliveriesResponse.error ||
        bundleChecksResponse.error ||
        memberChecksResponse.error;

      if (firstError) {
        console.error("Materials load error:", firstError);
        Alert.alert("Could not load materials", firstError.message);

        if (!silent) {
          setLoadingMaterials(false);
        }

        return;
      }

      const loadedBundles: Bundle[] = (
        (bundlesResponse.data ?? []) as DbBundleRow[]
      ).map((row) => ({
        id: row.id,
        tower_id: row.tower_id,
        bundle_no: safeString(row.bundle_no),
        section: normaliseSection(
          safeString(row.section, "General"),
        ),
        qty_required: Math.max(safeNumber(row.qty_required, 0), 0),
        member_qty: Math.max(safeNumber(row.member_qty, 0), 0),
        total_weight:
          row.total_weight === null ||
          row.total_weight === undefined
            ? null
            : safeNumber(row.total_weight, 0),
      }));

      const loadedMembers: Member[] = (
        (membersResponse.data ?? []) as DbMemberRow[]
      ).map((row) => ({
        id: row.id,
        tower_id: row.tower_id,
        bundle_reference: safeString(row.bundle_reference),
        drawing_number: safeString(row.drawing_number),
        mark_no: safeString(row.mark_no),
        pn_final: safeString(row.pn_final),
        qty_per_tower: Math.max(
          safeNumber(row.qty_per_tower, 0),
          0,
        ),
        section: normaliseSection(
          safeString(row.section, "General"),
        ),
      }));

      const loadedBolts: Bolt[] = (
        (boltsResponse.data ?? []) as DbBoltRow[]
      ).map((row) => ({
        id: row.id,
        tower_id: row.tower_id,
        tower_segment: normaliseSection(
          safeString(row.tower_segment, "General"),
        ),
        bolt_diameter: normaliseBoltDiameter(
          safeString(row.bolt_diameter),
        ),
        dn_sn: safeString(row.dn_sn),
        length: safeString(row.length),
        qty: Math.max(safeNumber(row.qty, 0), 0),
      }));

      const loadedBundleChecks: BundleCheck[] = (
        (bundleChecksResponse.data ?? []) as DbBundleCheckRow[]
      ).map((row) => ({
        id: row.id,
        tower_id: row.tower_id,
        bundle_no: safeString(row.bundle_no),
        status: row.status ?? "not_checked",
        notes: safeString(row.notes),
        checked_by: safeString(row.checked_by),
        checked_at: row.checked_at,
        qty_received: Math.max(
          safeNumber(row.qty_received, 0),
          0,
        ),
      }));

      const loadedMemberChecks: MemberCheck[] = (
        (memberChecksResponse.data ?? []) as DbMemberCheckRow[]
      ).map((row) => ({
        id: row.id,
        tower_id: row.tower_id,
        bundle_no: safeString(row.bundle_no),
        mark_no: safeString(row.mark_no),
        status: row.status ?? "not_checked",
        notes: safeString(row.notes),
        checked_by: safeString(row.checked_by),
        checked_at: row.checked_at,
      }));

      setBundles(loadedBundles);
      setMembers(loadedMembers);
      setBolts(loadedBolts);
      setDeliveries(
        (deliveriesResponse.data ?? []) as Delivery[],
      );
      setBundleChecks(loadedBundleChecks);
      setMemberChecks(loadedMemberChecks);

      if (!silent) {
        setLoadingMaterials(false);
      }
    },
    [],
  );

  useEffect(() => {
    setExpandedBundleNo(null);
    setSearch("");
    setSectionFilter("all");
    setShowOutstandingOnly(true);
    setShowCompletedBundles(false);

    void loadMaterials(selectedTowerId);
  }, [selectedTowerId, loadMaterials]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadMaterials(selectedTowerId, true);
    setRefreshing(false);
  }, [loadMaterials, selectedTowerId]);

  /* =========================================================
     LOOKUP MAPS
  ========================================================= */

  const bundleMap = useMemo(() => {
    const map: Record<string, Bundle> = {};

    bundles.forEach((bundle) => {
      map[bundle.bundle_no.trim()] = bundle;
    });

    return map;
  }, [bundles]);

  const membersByBundle = useMemo(() => {
    const map: Record<string, Member[]> = {};

    members.forEach((member) => {
      const key = member.bundle_reference.trim();

      if (!map[key]) {
        map[key] = [];
      }

      map[key].push(member);
    });

    return map;
  }, [members]);

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
      const key = `${check.bundle_no.trim()}__${check.mark_no.trim()}`;
      map[key] = check;
    });

    return map;
  }, [memberChecks]);

  const deliveredQty = useCallback(
    (bundleNo: string): number => {
      let total = 0;

      deliveries.forEach((delivery) => {
        (delivery.tower_bundle_delivery_items ?? []).forEach((item) => {
          if (safeString(item.bundle_no).trim() === bundleNo.trim()) {
            total += Math.max(safeNumber(item.qty_delivered, 0), 0);
          }
        });
      });

      return total;
    },
    [deliveries],
  );

  const receivedQty = useCallback(
    (bundleNo: string): number =>
      Math.max(
        safeNumber(bundleCheckMap[bundleNo.trim()]?.qty_received, 0),
        0,
      ),
    [bundleCheckMap],
  );

  const getMemberCheck = useCallback(
    (member: Member): MemberCheck | undefined =>
      memberCheckMap[
        `${member.bundle_reference.trim()}__${member.mark_no.trim()}`
      ],
    [memberCheckMap],
  );

  const remainingReceiveQty = useCallback(
    (bundle: Bundle): number =>
      Math.max(bundle.qty_required - receivedQty(bundle.bundle_no), 0),
    [receivedQty],
  );

  const deriveStatusFromReceived = useCallback(
    (
      quantityReceived: number,
      quantityRequired: number,
    ): BundleCheckStatus => {
      if (quantityReceived <= 0) return "not_checked";
      if (quantityReceived < quantityRequired) return "partial";
      return "arrived";
    },
    [],
  );

  const deriveBundleStatus = useCallback(
    (bundleNo: string): BundleCheckStatus => {
      const bundle = bundleMap[bundleNo.trim()];
      const manualCheck = bundleCheckMap[bundleNo.trim()];
      const quantityReceived = Math.max(
        safeNumber(manualCheck?.qty_received, 0),
        0,
      );

      if (manualCheck?.status === "issue") return "issue";
      if (manualCheck?.status === "missing" && quantityReceived <= 0) {
        return "missing";
      }

      if (bundle) {
        return deriveStatusFromReceived(
          quantityReceived,
          Math.max(bundle.qty_required, 1),
        );
      }

      return manualCheck?.status ?? "not_checked";
    },
    [bundleCheckMap, bundleMap, deriveStatusFromReceived],
  );

  /* =========================================================
     SUMMARY
  ========================================================= */

  const requiredBundleQty = useMemo(
    () =>
      bundles.reduce(
        (total, bundle) => total + bundle.qty_required,
        0,
      ),
    [bundles],
  );

  const deliveredBundleQty = useMemo(
    () =>
      bundles.reduce(
        (total, bundle) =>
          total + deliveredQty(bundle.bundle_no),
        0,
      ),
    [bundles, deliveredQty],
  );

  const receivedBundleQty = useMemo(
    () =>
      bundles.reduce(
        (total, bundle) =>
          total + receivedQty(bundle.bundle_no),
        0,
      ),
    [bundles, receivedQty],
  );

  const outstandingBundleQty = Math.max(
    requiredBundleQty - receivedBundleQty,
    0,
  );

  const progress = percentage(
    receivedBundleQty,
    requiredBundleQty,
  );

  const outstandingBundleCount = useMemo(
    () =>
      bundles.filter(
        (bundle) =>
          remainingReceiveQty(bundle) > 0 ||
          deriveBundleStatus(bundle.bundle_no) !== "arrived",
      ).length,
    [bundles, deriveBundleStatus, remainingReceiveQty],
  );

  const allSections = useMemo(() => {
    const sections = new Set<string>();

    bundles.forEach((bundle) => sections.add(bundle.section));
    members.forEach((member) => sections.add(member.section));
    bolts.forEach((bolt) => sections.add(bolt.tower_segment));

    return Array.from(sections).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [bundles, members, bolts]);

  /* =========================================================
     FILTERED RESULTS
  ========================================================= */

  const searchedBundles = useMemo(() => {
    const query = normaliseSearch(search);

    return bundles.filter((bundle) => {
      if (
        sectionFilter !== "all" &&
        bundle.section !== sectionFilter
      ) {
        return false;
      }

      if (!query) return true;

      const relatedMembers =
        membersByBundle[bundle.bundle_no.trim()] ?? [];

      return matchesText(
        bundle.bundle_no,
        bundle.section,
        bundle.qty_required,
        bundle.member_qty,
        bundle.total_weight,
        deliveredQty(bundle.bundle_no),
        receivedQty(bundle.bundle_no),
        ...relatedMembers.map((member) =>
          matchesText(
            member.mark_no,
            member.pn_final,
            member.drawing_number,
            member.bundle_reference,
            member.section,
          ),
        ),
      ).includes(query);
    });
  }, [
    bundles,
    deliveredQty,
    membersByBundle,
    receivedQty,
    search,
    sectionFilter,
  ]);

  const outstandingBundles = useMemo(
    () =>
      searchedBundles.filter(
        (bundle) =>
          remainingReceiveQty(bundle) > 0 ||
          deriveBundleStatus(bundle.bundle_no) !== "arrived",
      ),
    [deriveBundleStatus, remainingReceiveQty, searchedBundles],
  );

  const completedBundles = useMemo(
    () =>
      searchedBundles.filter(
        (bundle) =>
          remainingReceiveQty(bundle) === 0 &&
          deriveBundleStatus(bundle.bundle_no) === "arrived",
      ),
    [deriveBundleStatus, remainingReceiveQty, searchedBundles],
  );

  const displayedBundles = useMemo(() => {
    if (search.trim()) return searchedBundles;
    if (showCompletedBundles) return [];
    if (showOutstandingOnly) return outstandingBundles;
    return outstandingBundles;
  }, [
    outstandingBundles,
    search,
    searchedBundles,
    showCompletedBundles,
    showOutstandingOnly,
  ]);

  const filteredMembers = useMemo(() => {
    const query = normaliseSearch(search);

    return members.filter((member) => {
      if (
        sectionFilter !== "all" &&
        member.section !== sectionFilter
      ) {
        return false;
      }

      if (showOutstandingOnly) {
        const status =
          getMemberCheck(member)?.status ?? "not_checked";

        if (status === "arrived") {
          return false;
        }
      }

      if (!query) return true;

      return matchesText(
        member.mark_no,
        member.pn_final,
        member.drawing_number,
        member.bundle_reference,
        member.section,
        member.qty_per_tower,
      ).includes(query);
    });
  }, [
    getMemberCheck,
    members,
    search,
    sectionFilter,
    showOutstandingOnly,
  ]);

  const filteredBolts = useMemo(() => {
    const query = normaliseSearch(search);

    return bolts.filter((bolt) => {
      if (
        sectionFilter !== "all" &&
        bolt.tower_segment !== sectionFilter
      ) {
        return false;
      }

      if (!query) return true;

      return matchesText(
        bolt.tower_segment,
        bolt.bolt_diameter,
        bolt.dn_sn,
        bolt.length,
        bolt.qty,
      ).includes(query);
    });
  }, [bolts, search, sectionFilter]);

  /* =========================================================
     SITE CHECK ACTIONS
  ========================================================= */

  async function saveBundleQuantity(
    bundle: Bundle,
    requestedQuantity: number,
    forcedStatus?: BundleCheckStatus,
  ) {
    const bundleKey = `bundle-${bundle.bundle_no}`;
    setSavingKey(bundleKey);

    const requiredQuantity = Math.max(bundle.qty_required, 1);

    const quantityReceived = Math.max(
      Math.min(Math.round(requestedQuantity), requiredQuantity),
      0,
    );

    const nextStatus =
      forcedStatus ??
      deriveStatusFromReceived(
        quantityReceived,
        requiredQuantity,
      );

    const existingCheck =
      bundleCheckMap[bundle.bundle_no.trim()];

    const payload = {
      tower_id: selectedTowerId,
      bundle_no: bundle.bundle_no.trim(),
      status: nextStatus,
      notes: existingCheck?.notes ?? "",
      checked_by: "Mobile Site Check",
      checked_at: new Date().toISOString(),
      qty_received: quantityReceived,
    };

    const { data, error } = await supabase
      .from("tower_material_bundle_checks")
      .upsert(payload, {
        onConflict: "tower_id,bundle_no",
      })
      .select()
      .single();

    if (error) {
      console.error("Bundle check error:", error);
      Alert.alert("Could not save bundle check", error.message);
      setSavingKey(null);
      return;
    }

    const savedRow = data as DbBundleCheckRow;

    const savedCheck: BundleCheck = {
      id: savedRow.id,
      tower_id: savedRow.tower_id,
      bundle_no: savedRow.bundle_no,
      status: savedRow.status ?? nextStatus,
      notes: safeString(savedRow.notes),
      checked_by: safeString(savedRow.checked_by),
      checked_at: savedRow.checked_at,
      qty_received: Math.max(
        safeNumber(savedRow.qty_received, quantityReceived),
        0,
      ),
    };

    setBundleChecks((current) => [
      ...current.filter(
        (check) =>
          check.bundle_no.trim() !==
          savedCheck.bundle_no.trim(),
      ),
      savedCheck,
    ]);

    setSavingKey(null);
  }

  async function changeBundleQuantity(
    bundle: Bundle,
    change: number,
  ) {
    const currentQuantity = receivedQty(bundle.bundle_no);
    const nextQuantity = Math.max(
      Math.min(currentQuantity + change, bundle.qty_required),
      0,
    );

    await saveBundleQuantity(bundle, nextQuantity);

    if (nextQuantity >= bundle.qty_required) {
      setExpandedBundleNo((current) =>
        current === bundle.bundle_no ? null : current,
      );
    }
  }

  async function markBundleFull(bundle: Bundle) {
    await saveBundleQuantity(
      bundle,
      bundle.qty_required,
      "arrived",
    );

    setExpandedBundleNo((current) =>
      current === bundle.bundle_no ? null : current,
    );
  }

  function confirmMarkBundleMissing(bundle: Bundle) {
    Alert.alert(
      "Mark bundle missing?",
      `${bundle.bundle_no} will be marked as missing and its site received quantity will be reset to zero.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Mark Missing",
          style: "destructive",
          onPress: () => {
            void saveBundleQuantity(bundle, 0, "missing");
          },
        },
      ],
    );
  }

  async function markBundleIssue(bundle: Bundle) {
    await saveBundleQuantity(
      bundle,
      receivedQty(bundle.bundle_no),
      "issue",
    );
  }

  async function clearBundleCheck(bundle: Bundle) {
    const bundleKey = `bundle-${bundle.bundle_no}`;
    setSavingKey(bundleKey);

    const { error: memberError } = await supabase
      .from("tower_material_member_checks")
      .delete()
      .eq("tower_id", selectedTowerId)
      .eq("bundle_no", bundle.bundle_no.trim());

    if (memberError) {
      console.error("Clear member checks error:", memberError);
      Alert.alert(
        "Could not clear bundle",
        memberError.message,
      );
      setSavingKey(null);
      return;
    }

    const { error: bundleError } = await supabase
      .from("tower_material_bundle_checks")
      .delete()
      .eq("tower_id", selectedTowerId)
      .eq("bundle_no", bundle.bundle_no.trim());

    if (bundleError) {
      console.error("Clear bundle check error:", bundleError);
      Alert.alert(
        "Could not clear bundle",
        bundleError.message,
      );
      setSavingKey(null);
      return;
    }

    setBundleChecks((current) =>
      current.filter(
        (check) =>
          check.bundle_no.trim() !==
          bundle.bundle_no.trim(),
      ),
    );

    setMemberChecks((current) =>
      current.filter(
        (check) =>
          check.bundle_no.trim() !==
          bundle.bundle_no.trim(),
      ),
    );

    setSavingKey(null);
  }

  async function saveMemberStatus(
    member: Member,
    status: MemberCheckStatus,
  ) {
    const memberKey = `member-${member.bundle_reference}-${member.mark_no}`;
    setSavingKey(memberKey);

    const existingCheck = getMemberCheck(member);

    const payload = {
      tower_id: selectedTowerId,
      bundle_no: member.bundle_reference.trim(),
      mark_no: member.mark_no.trim(),
      status,
      notes: existingCheck?.notes ?? "",
      checked_by: "Mobile Site Check",
      checked_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("tower_material_member_checks")
      .upsert(payload, {
        onConflict: "tower_id,bundle_no,mark_no",
      })
      .select()
      .single();

    if (error) {
      console.error("Member check error:", error);
      Alert.alert("Could not save member check", error.message);
      setSavingKey(null);
      return;
    }

    const savedRow = data as DbMemberCheckRow;

    const savedCheck: MemberCheck = {
      id: savedRow.id,
      tower_id: savedRow.tower_id,
      bundle_no: savedRow.bundle_no,
      mark_no: savedRow.mark_no,
      status: savedRow.status ?? status,
      notes: safeString(savedRow.notes),
      checked_by: safeString(savedRow.checked_by),
      checked_at: savedRow.checked_at,
    };

    const savedKey = `${savedCheck.bundle_no.trim()}__${savedCheck.mark_no.trim()}`;

    setMemberChecks((current) => [
      ...current.filter(
        (check) =>
          `${check.bundle_no.trim()}__${check.mark_no.trim()}` !==
          savedKey,
      ),
      savedCheck,
    ]);

    setSavingKey(null);
  }

  async function clearMemberCheck(member: Member) {
    const memberKey = `member-${member.bundle_reference}-${member.mark_no}`;
    setSavingKey(memberKey);

    const { error } = await supabase
      .from("tower_material_member_checks")
      .delete()
      .eq("tower_id", selectedTowerId)
      .eq("bundle_no", member.bundle_reference.trim())
      .eq("mark_no", member.mark_no.trim());

    if (error) {
      console.error("Clear member check error:", error);
      Alert.alert("Could not clear member", error.message);
      setSavingKey(null);
      return;
    }

    setMemberChecks((current) =>
      current.filter(
        (check) =>
          !(
            check.bundle_no.trim() ===
              member.bundle_reference.trim() &&
            check.mark_no.trim() === member.mark_no.trim()
          ),
      ),
    );

    setSavingKey(null);
  }

  /* =========================================================
     SELECTORS
  ========================================================= */

  function openSelector(
    title: string,
    options: SelectorOption[],
    onSelect: (option: SelectorOption) => void,
  ) {
    setSelectorTitle(title);
    setSelectorOptions(options);
    setSelectorOnSelect(() => onSelect);
    setSelectorVisible(true);
  }

  function openTowerSelector() {
    openSelector(
      "Select Tower",
      towers.map((tower) => ({
        id: tower.id,
        label: getTowerLabel(tower),
        subtitle: tower.status ?? undefined,
      })),
      (option) => {
        setSelectedTowerId(option.id);
      },
    );
  }

  function openSectionSelector() {
    openSelector(
      "Filter by Section",
      [
        {
          id: "all",
          label: "All Sections",
        },
        ...allSections.map((section) => ({
          id: section,
          label: section,
        })),
      ],
      (option) => {
        setSectionFilter(option.id);
      },
    );
  }

  const selectedTower = towers.find(
    (tower) => tower.id === selectedTowerId,
  );

  /* =========================================================
     RENDER HELPERS
  ========================================================= */

  function renderBundle({ item: bundle }: { item: Bundle }) {
    const status = deriveBundleStatus(bundle.bundle_no);
    const statusStyle = getStatusStyle(status);

    const delivered = deliveredQty(bundle.bundle_no);
    const received = receivedQty(bundle.bundle_no);
    const remaining = remainingReceiveQty(bundle);

    const relatedMembers =
      membersByBundle[bundle.bundle_no.trim()] ?? [];

    const expanded = expandedBundleNo === bundle.bundle_no;
    const bundleSaving =
      savingKey === `bundle-${bundle.bundle_no}`;
    const isCompleted = remaining === 0 && status === "arrived";

    if (isCompleted && !search.trim()) {
      return (
        <Pressable
          style={[
            styles.completedBundleCard,
            { borderLeftColor: getStatusAccent(status) },
          ]}
          onPress={() => {
            setShowCompletedBundles(true);
            setShowOutstandingOnly(false);
          }}
        >
          <View style={styles.completedBundleIcon}>
            <Ionicons name="checkmark" size={18} color="#15803D" />
          </View>

          <View style={styles.completedBundleText}>
            <Text style={styles.completedBundleTitle}>
              {bundle.bundle_no}
            </Text>
            <Text style={styles.completedBundleSubtitle}>
              {bundle.section} · {received}/{bundle.qty_required} received
            </Text>
          </View>

          <StatusBadge
            label="Arrived"
            backgroundColor="#DCFCE7"
            borderColor="#86EFAC"
            textColor="#166534"
          />
        </Pressable>
      );
    }

    return (
      <View
        style={[
          styles.card,
          {
            borderLeftColor: getStatusAccent(status),
          },
        ]}
      >
        <Pressable
          style={styles.cardHeader}
          onPress={() =>
            setExpandedBundleNo((current) =>
              current === bundle.bundle_no
                ? null
                : bundle.bundle_no,
            )
          }
        >
          <View style={styles.cardHeaderContent}>
            <View style={styles.bundleTitleRow}>
              <Text style={styles.bundleTitle}>
                {bundle.bundle_no}
              </Text>

              <StatusBadge
                label={statusLabel(status)}
                backgroundColor={statusStyle.backgroundColor}
                borderColor={statusStyle.borderColor}
                textColor={statusStyle.color}
              />
            </View>

            <Text style={styles.cardSubtitle}>
              {bundle.section}
            </Text>
          </View>

          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={21}
            color="#64748B"
          />
        </Pressable>

        <View style={styles.bundleNumbers}>
          <NumberTile label="Required" value={bundle.qty_required} />
          <NumberTile label="Delivered" value={delivered} />
          <NumberTile label="Received" value={received} strong />
          <NumberTile label="Remaining" value={remaining} warning />
        </View>

        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>
            Site delivery check
          </Text>

          <Text style={styles.progressValue}>
            {percentage(received, bundle.qty_required).toFixed(0)}%
          </Text>
        </View>

        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${percentage(
                  received,
                  bundle.qty_required,
                )}%`,
              },
            ]}
          />
        </View>

        <View style={styles.quantityControls}>
          <Pressable
            style={[
              styles.quantityButton,
              styles.quantityMinusButton,
            ]}
            disabled={bundleSaving || received <= 0}
            onPress={() =>
              void changeBundleQuantity(bundle, -1)
            }
          >
            <Ionicons
              name="remove"
              size={23}
              color={received <= 0 ? "#94A3B8" : "#0F172A"}
            />
          </Pressable>

          <View style={styles.quantityValueContainer}>
            {bundleSaving ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <>
                <Text style={styles.quantityValue}>
                  {received}/{bundle.qty_required}
                </Text>
                <Text style={styles.quantityLabel}>
                  bundles confirmed
                </Text>
              </>
            )}
          </View>

          <Pressable
            style={[
              styles.quantityButton,
              styles.quantityPlusButton,
            ]}
            disabled={
              bundleSaving ||
              received >= bundle.qty_required
            }
            onPress={() =>
              void changeBundleQuantity(bundle, 1)
            }
          >
            <Ionicons
              name="add"
              size={23}
              color="#FFFFFF"
            />
          </Pressable>
        </View>

        <View style={styles.bundleActions}>
          <SmallActionButton
            label="Full"
            icon="checkmark-done"
            tone="green"
            disabled={bundleSaving}
            onPress={() => void markBundleFull(bundle)}
          />

          <SmallActionButton
            label="Missing"
            icon="close-circle-outline"
            tone="red"
            disabled={bundleSaving}
            onPress={() => confirmMarkBundleMissing(bundle)}
          />

          <SmallActionButton
            label="Issue"
            icon="alert-circle-outline"
            tone="purple"
            disabled={bundleSaving}
            onPress={() => void markBundleIssue(bundle)}
          />

          <SmallActionButton
            label={expanded ? "Hide" : "Members"}
            icon={expanded ? "chevron-up" : "list-outline"}
            tone="slate"
            disabled={bundleSaving}
            onPress={() =>
              setExpandedBundleNo((current) =>
                current === bundle.bundle_no
                  ? null
                  : bundle.bundle_no,
              )
            }
          />
        </View>

        {expanded && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedHeader}>
              <View>
                <Text style={styles.expandedTitle}>
                  Bundle contents
                </Text>

                <Text style={styles.expandedSubtitle}>
                  {relatedMembers.length} member lines ·{" "}
                  {bundle.member_qty} total members
                </Text>
              </View>

              {(bundleCheckMap[bundle.bundle_no.trim()] ||
                relatedMembers.some((member) =>
                  Boolean(getMemberCheck(member)),
                )) && (
                <Pressable
                  style={styles.clearBundleButton}
                  disabled={bundleSaving}
                  onPress={() => {
                    Alert.alert(
                      "Clear bundle checks?",
                      `This will clear the quantity and member checks for ${bundle.bundle_no}.`,
                      [
                        {
                          text: "Cancel",
                          style: "cancel",
                        },
                        {
                          text: "Clear",
                          style: "destructive",
                          onPress: () => {
                            void clearBundleCheck(bundle);
                          },
                        },
                      ],
                    );
                  }}
                >
                  <Text style={styles.clearBundleButtonText}>
                    Clear
                  </Text>
                </Pressable>
              )}
            </View>

            {relatedMembers.length === 0 ? (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>
                  No individual members are linked to this
                  bundle.
                </Text>
              </View>
            ) : (
              relatedMembers.map((member) => (
                <MemberCheckRow
                  key={`${member.bundle_reference}-${member.mark_no}`}
                  member={member}
                  status={
                    getMemberCheck(member)?.status ??
                    "not_checked"
                  }
                  saving={
                    savingKey ===
                    `member-${member.bundle_reference}-${member.mark_no}`
                  }
                  onStatus={(nextStatus) =>
                    void saveMemberStatus(member, nextStatus)
                  }
                  onClear={() => void clearMemberCheck(member)}
                />
              ))
            )}
          </View>
        )}
      </View>
    );
  }

  function renderMember({ item: member }: { item: Member }) {
    const status =
      getMemberCheck(member)?.status ?? "not_checked";

    const statusStyle = getStatusStyle(status);

    return (
      <View
        style={[
          styles.card,
          {
            borderLeftColor: getStatusAccent(status),
          },
        ]}
      >
        <View style={styles.memberHeader}>
          <View style={styles.memberHeaderContent}>
            <View style={styles.bundleTitleRow}>
              <Text style={styles.memberTitle}>
                {member.mark_no}
              </Text>

              <StatusBadge
                label={statusLabel(status)}
                backgroundColor={statusStyle.backgroundColor}
                borderColor={statusStyle.borderColor}
                textColor={statusStyle.color}
              />
            </View>

            <Text style={styles.cardSubtitle}>
              Bundle {member.bundle_reference} ·{" "}
              {member.section}
            </Text>
          </View>

          {savingKey ===
          `member-${member.bundle_reference}-${member.mark_no}` ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : null}
        </View>

        <View style={styles.memberDetailGrid}>
          <DetailItem
            label="PN"
            value={member.pn_final || "—"}
          />

          <DetailItem
            label="Drawing"
            value={member.drawing_number || "—"}
          />

          <DetailItem
            label="Quantity"
            value={String(member.qty_per_tower)}
          />
        </View>

        <MemberStatusButtons
          currentStatus={status}
          disabled={
            savingKey ===
            `member-${member.bundle_reference}-${member.mark_no}`
          }
          onStatus={(nextStatus) =>
            void saveMemberStatus(member, nextStatus)
          }
          onClear={() => void clearMemberCheck(member)}
        />
      </View>
    );
  }

  function renderBolt({ item: bolt }: { item: Bolt }) {
    return (
      <View style={styles.boltCard}>
        <View style={styles.boltHeader}>
          <View style={styles.boltDiameter}>
            <Text style={styles.boltDiameterText}>
              {bolt.bolt_diameter || "—"}
            </Text>
          </View>

          <View style={styles.boltHeaderText}>
            <Text style={styles.boltSegment}>
              {bolt.tower_segment}
            </Text>

            <Text style={styles.boltMeta}>
              {bolt.dn_sn || "No DN/SN"} · Length{" "}
              {bolt.length || "—"}
            </Text>
          </View>

          <View style={styles.boltQty}>
            <Text style={styles.boltQtyValue}>{bolt.qty}</Text>
            <Text style={styles.boltQtyLabel}>Qty</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderFixedSearchBar() {
    return (
      <View style={styles.fixedSearchArea}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={20} color="#64748B" />

          <TextInput
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            placeholder={
              viewMode === "bundles"
                ? "Search bundle, mark, PN or drawing…"
                : viewMode === "members"
                  ? "Search mark, PN, drawing or bundle…"
                  : "Search diameter, DN/SN or length…"
            }
            placeholderTextColor="#94A3B8"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="search"
          />

          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons name="close-circle" size={20} color="#94A3B8" />
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  function renderSharedListHeader() {
    return (
      <View>
        <View style={styles.scrollTabs}>
          <TabButton
            label="Bundles"
            count={searchedBundles.length}
            active={viewMode === "bundles"}
            onPress={() => {
              setViewMode("bundles");
              setExpandedBundleNo(null);
            }}
          />

          <TabButton
            label="Members"
            count={filteredMembers.length}
            active={viewMode === "members"}
            onPress={() => {
              setViewMode("members");
              setExpandedBundleNo(null);
            }}
          />

          <TabButton
            label="Bolts"
            count={filteredBolts.length}
            active={viewMode === "bolts"}
            onPress={() => {
              setViewMode("bolts");
              setExpandedBundleNo(null);
            }}
          />
        </View>

        <Pressable
          style={styles.compactSummaryBar}
          onPress={() => setShowSummary((current) => !current)}
        >
          <View style={styles.compactSummaryLeft}>
            <View style={styles.compactSummaryIcon}>
              <Ionicons
                name={
                  outstandingBundleQty > 0
                    ? "alert-circle-outline"
                    : "checkmark-circle-outline"
                }
                size={20}
                color={outstandingBundleQty > 0 ? "#BE123C" : "#15803D"}
              />
            </View>

            <View style={styles.compactSummaryText}>
              <Text style={styles.compactSummaryTitle}>
                {receivedBundleQty}/{requiredBundleQty} bundles confirmed
              </Text>
              <Text style={styles.compactSummarySubtitle}>
                {outstandingBundleCount} outstanding · {progress.toFixed(0)}% complete
              </Text>
            </View>
          </View>

          <Ionicons
            name={showSummary ? "chevron-up" : "chevron-down"}
            size={20}
            color="#64748B"
          />
        </Pressable>

        {showSummary && (
          <View style={styles.summaryContainerInline}>
            <View style={styles.summaryTopRow}>
              <View>
                <Text style={styles.summaryEyebrow}>SITE RECEIVED</Text>
                <Text style={styles.summaryMainValue}>
                  {receivedBundleQty}/{requiredBundleQty}
                </Text>
              </View>

              <View style={styles.progressPercentBadge}>
                <Text style={styles.progressPercentText}>
                  {progress.toFixed(0)}%
                </Text>
              </View>
            </View>

            <View style={styles.summaryProgressTrack}>
              <View
                style={[
                  styles.summaryProgressFill,
                  { width: `${progress}%` },
                ]}
              />
            </View>

            <View style={styles.summaryStats}>
              <SummaryStat label="Delivered" value={deliveredBundleQty} />
              <SummaryStat
                label="Remaining"
                value={outstandingBundleQty}
                warning={outstandingBundleQty > 0}
              />
              <SummaryStat
                label="Outstanding"
                value={outstandingBundleCount}
                warning={outstandingBundleCount > 0}
              />
              <SummaryStat label="Members" value={members.length} />
            </View>
          </View>
        )}

        <Pressable
          style={styles.sectionFilterButtonFull}
          onPress={openSectionSelector}
        >
          <Ionicons name="filter-outline" size={17} color="#334155" />
          <Text numberOfLines={1} style={styles.sectionFilterText}>
            {sectionFilter === "all" ? "All Sections" : sectionFilter}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#64748B" />
        </Pressable>
      </View>
    );
  }

  /* =========================================================
     MAIN UI
  ========================================================= */

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.projectContextBar}>
          <View style={styles.projectContextText}>
            <Text style={styles.projectContextLabel}>
              CURRENT PROJECT
            </Text>

            <Text
              numberOfLines={1}
              style={styles.projectContextValue}
            >
              {profile?.projectNumber
                ? `${profile.projectNumber} — ${profile.projectName ?? ""}`
                : profile?.projectName ?? "No project selected"}
            </Text>
          </View>
        </View>

        <View style={styles.compactContextBar}>
          <SelectorButton
            label="Tower"
            value={
              selectedTower
                ? getTowerLabel(selectedTower)
                : loadingTowers
                  ? "Loading…"
                  : "Select tower"
            }
            loading={loadingTowers}
            disabled={!selectedProjectId || loadingTowers}
            onPress={openTowerSelector}
          />

          <Pressable
            style={styles.compactRefreshButton}
            disabled={!selectedTowerId || refreshing}
            onPress={() => void refresh()}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#334155" />
            ) : (
              <Ionicons name="refresh" size={20} color="#334155" />
            )}
          </Pressable>
        </View>

        {!selectedTowerId ? (
          <View style={styles.noTowerContainer}>
            <View style={styles.noTowerIcon}>
              <Ionicons
                name="business-outline"
                size={34}
                color="#64748B"
              />
            </View>

            <Text style={styles.noTowerTitle}>
              Select a tower
            </Text>

            <Text style={styles.noTowerText}>
              Choose a tower to search materials and
              tick off site deliveries for the selected project.
            </Text>
          </View>
        ) : loadingMaterials ? (
          <View style={styles.fullScreenLoading}>
            <ActivityIndicator size="large" color="#2563EB" />

            <Text style={styles.loadingText}>
              Loading tower materials…
            </Text>
          </View>
        ) : (
          <>
            {renderFixedSearchBar()}

            {viewMode === "bundles" && (
              <FlatList
                data={
                  search.trim()
                    ? displayedBundles
                    : showCompletedBundles
                      ? completedBundles
                      : displayedBundles
                }
                keyExtractor={(item) =>
                  item.id ?? `${item.tower_id}-${item.bundle_no}`
                }
                renderItem={renderBundle}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={7}
                removeClippedSubviews
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void refresh()}
                  />
                }
                ListHeaderComponent={
                  <View>
                    {renderSharedListHeader()}

                    {!search.trim() ? (
                      <View style={styles.deliverySections}>
                      <Pressable
                        style={[
                          styles.deliverySectionButton,
                          showOutstandingOnly &&
                            !showCompletedBundles &&
                            styles.deliverySectionButtonActive,
                        ]}
                        onPress={() => {
                          setShowOutstandingOnly(true);
                          setShowCompletedBundles(false);
                          setExpandedBundleNo(null);
                        }}
                      >
                        <View style={styles.deliverySectionText}>
                          <Text
                            style={[
                              styles.deliverySectionTitle,
                              showOutstandingOnly &&
                                !showCompletedBundles &&
                                styles.deliverySectionTitleActive,
                            ]}
                          >
                            Outstanding deliveries
                          </Text>
                          <Text
                            style={[
                              styles.deliverySectionSubtitle,
                              showOutstandingOnly &&
                                !showCompletedBundles &&
                                styles.deliverySectionSubtitleActive,
                            ]}
                          >
                            Bundles still requiring site confirmation
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.deliverySectionCount,
                            showOutstandingOnly &&
                              !showCompletedBundles &&
                              styles.deliverySectionCountActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.deliverySectionCountText,
                              showOutstandingOnly &&
                                !showCompletedBundles &&
                                styles.deliverySectionCountTextActive,
                            ]}
                          >
                            {outstandingBundles.length}
                          </Text>
                        </View>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.completedSectionHeader,
                          showCompletedBundles &&
                            styles.completedSectionHeaderActive,
                        ]}
                        onPress={() => {
                          setShowCompletedBundles((current) => !current);
                          setShowOutstandingOnly(false);
                          setExpandedBundleNo(null);
                        }}
                      >
                        <View style={styles.completedSectionLeft}>
                          <View style={styles.completedSectionIcon}>
                            <Ionicons
                              name="checkmark-done"
                              size={18}
                              color="#15803D"
                            />
                          </View>

                          <View>
                            <Text style={styles.completedSectionTitle}>
                              Completed deliveries
                            </Text>
                            <Text style={styles.completedSectionSubtitle}>
                              Fully confirmed bundles
                            </Text>
                          </View>
                        </View>

                        <View style={styles.completedSectionRight}>
                          <View style={styles.completedSectionCount}>
                            <Text style={styles.completedSectionCountText}>
                              {completedBundles.length}
                            </Text>
                          </View>
                          <Ionicons
                            name={
                              showCompletedBundles
                                ? "chevron-up"
                                : "chevron-down"
                            }
                            size={19}
                            color="#64748B"
                          />
                        </View>
                      </Pressable>

                      {!showCompletedBundles &&
                        outstandingBundles.length > 0 && (
                          <View style={styles.outstandingListHeading}>
                            <Text style={styles.outstandingListHeadingText}>
                              Items requiring action
                            </Text>
                            <Text style={styles.outstandingListHeadingCount}>
                              {outstandingBundles.length}
                            </Text>
                          </View>
                        )}
                      </View>
                    ) : null}
                  </View>
                }
                ListEmptyComponent={
                  <EmptyList
                    icon={
                      showCompletedBundles
                        ? "checkmark-circle-outline"
                        : "cube-outline"
                    }
                    title={
                      showCompletedBundles
                        ? "No completed bundles"
                        : "All deliveries confirmed"
                    }
                    text={
                      showCompletedBundles
                        ? "Completed bundles will appear here."
                        : "There are no outstanding bundles for this tower."
                    }
                  />
                }
              />
            )}

            {viewMode === "members" && (
              <FlatList
                data={filteredMembers}
                keyExtractor={(item) =>
                  item.id ??
                  `${item.bundle_reference}-${item.mark_no}`
                }
                renderItem={renderMember}
                ListHeaderComponent={renderSharedListHeader}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void refresh()}
                  />
                }
                ListEmptyComponent={
                  <EmptyList
                    icon="list-outline"
                    title="No members found"
                    text="Try searching by mark number, PN, drawing or bundle."
                  />
                }
              />
            )}

            {viewMode === "bolts" && (
              <FlatList
                data={filteredBolts}
                keyExtractor={(item, index) =>
                  item.id ??
                  `${item.tower_segment}-${item.bolt_diameter}-${item.dn_sn}-${item.length}-${index}`
                }
                renderItem={renderBolt}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => void refresh()}
                  />
                }
                ListHeaderComponent={
                  <View>
                    {renderSharedListHeader()}

                    <View style={styles.boltListHeader}>
                      <Text style={styles.boltListHeaderText}>
                        Bolt quantities are for reference and searching only.
                      </Text>
                    </View>
                  </View>
                }
                ListEmptyComponent={
                  <EmptyList
                    icon="construct-outline"
                    title="No bolts found"
                    text="Try searching by diameter, DN/SN, length or segment."
                  />
                }
              />
            )}
          </>
        )}

        <OptionSelectorModal
          visible={selectorVisible}
          title={selectorTitle}
          options={selectorOptions}
          onClose={() => setSelectorVisible(false)}
          onSelect={(option) => {
            selectorOnSelect?.(option);
            setSelectorVisible(false);
          }}
        />
      </View>
    </SafeAreaView>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SelectorButton({
  label,
  value,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  value: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectorButton,
        disabled && styles.selectorButtonDisabled,
        pressed && !disabled && styles.selectorButtonPressed,
      ]}
    >
      <View style={styles.selectorButtonContent}>
        <Text style={styles.selectorLabel}>{label}</Text>

        <Text numberOfLines={1} style={styles.selectorValue}>
          {value}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="small" color="#64748B" />
      ) : (
        <Ionicons
          name="chevron-down"
          size={18}
          color="#64748B"
        />
      )}
    </Pressable>
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[
        styles.tabButton,
        active && styles.tabButtonActive,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.tabButtonText,
          active && styles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>

      <View
        style={[
          styles.tabCount,
          active && styles.tabCountActive,
        ]}
      >
        <Text
          style={[
            styles.tabCountText,
            active && styles.tabCountTextActive,
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

function StatusBadge({
  label,
  backgroundColor,
  borderColor,
  textColor,
}: {
  label: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <View
      style={[
        styles.statusBadge,
        {
          backgroundColor,
          borderColor,
        },
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          {
            color: textColor,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function NumberTile({
  label,
  value,
  strong,
  warning,
}: {
  label: string;
  value: string | number;
  strong?: boolean;
  warning?: boolean;
}) {
  return (
    <View
      style={[
        styles.numberTile,
        warning && Number(value) > 0 && styles.numberTileWarning,
      ]}
    >
      <Text style={styles.numberTileLabel}>{label}</Text>

      <Text
        style={[
          styles.numberTileValue,
          strong && styles.numberTileValueStrong,
          warning &&
            Number(value) > 0 &&
            styles.numberTileValueWarning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function SummaryStat({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <View style={styles.summaryStat}>
      <Text
        style={[
          styles.summaryStatValue,
          warning && styles.summaryStatValueWarning,
        ]}
      >
        {value}
      </Text>

      <Text style={styles.summaryStatLabel}>{label}</Text>
    </View>
  );
}

function SmallActionButton({
  label,
  icon,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: "green" | "red" | "purple" | "slate";
  disabled?: boolean;
  onPress: () => void;
}) {
  const toneStyle = {
    green: {
      backgroundColor: "#DCFCE7",
      borderColor: "#86EFAC",
      color: "#166534",
    },
    red: {
      backgroundColor: "#FFE4E6",
      borderColor: "#FDA4AF",
      color: "#BE123C",
    },
    purple: {
      backgroundColor: "#F3E8FF",
      borderColor: "#D8B4FE",
      color: "#7E22CE",
    },
    slate: {
      backgroundColor: "#F1F5F9",
      borderColor: "#CBD5E1",
      color: "#334155",
    },
  }[tone];

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallActionButton,
        {
          backgroundColor: toneStyle.backgroundColor,
          borderColor: toneStyle.borderColor,
        },
        pressed && !disabled && styles.smallActionButtonPressed,
        disabled && styles.smallActionButtonDisabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={16}
        color={toneStyle.color}
      />

      <Text
        style={[
          styles.smallActionButtonText,
          {
            color: toneStyle.color,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.detailValue}>
        {value}
      </Text>
    </View>
  );
}

function MemberCheckRow({
  member,
  status,
  saving,
  onStatus,
  onClear,
}: {
  member: Member;
  status: MemberCheckStatus;
  saving: boolean;
  onStatus: (status: MemberCheckStatus) => void;
  onClear: () => void;
}) {
  const statusStyle = getStatusStyle(status);

  return (
    <View
      style={[
        styles.memberCheckRow,
        {
          borderLeftColor: getStatusAccent(status),
        },
      ]}
    >
      <View style={styles.memberCheckHeader}>
        <View style={styles.memberCheckTitleContainer}>
          <Text style={styles.memberCheckTitle}>
            {member.mark_no}
          </Text>

          <StatusBadge
            label={statusLabel(status)}
            backgroundColor={statusStyle.backgroundColor}
            borderColor={statusStyle.borderColor}
            textColor={statusStyle.color}
          />
        </View>

        {saving && (
          <ActivityIndicator size="small" color="#2563EB" />
        )}
      </View>

      <Text style={styles.memberCheckMeta}>
        PN {member.pn_final || "—"} · Drawing{" "}
        {member.drawing_number || "—"} · Qty{" "}
        {member.qty_per_tower}
      </Text>

      <MemberStatusButtons
        currentStatus={status}
        disabled={saving}
        onStatus={onStatus}
        onClear={onClear}
        compact
      />
    </View>
  );
}

function MemberStatusButtons({
  currentStatus,
  disabled,
  compact,
  onStatus,
  onClear,
}: {
  currentStatus: MemberCheckStatus;
  disabled?: boolean;
  compact?: boolean;
  onStatus: (status: MemberCheckStatus) => void;
  onClear: () => void;
}) {
  return (
    <View
      style={[
        styles.memberStatusButtons,
        compact && styles.memberStatusButtonsCompact,
      ]}
    >
      <MemberStatusButton
        label="Arrived"
        icon="checkmark"
        active={currentStatus === "arrived"}
        color="#15803D"
        backgroundColor="#DCFCE7"
        disabled={disabled}
        compact={compact}
        onPress={() => onStatus("arrived")}
      />

      <MemberStatusButton
        label="Not Here"
        icon="remove"
        active={currentStatus === "not_here"}
        color="#C2410C"
        backgroundColor="#FFEDD5"
        disabled={disabled}
        compact={compact}
        onPress={() => onStatus("not_here")}
      />

      <MemberStatusButton
        label="Missing"
        icon="close"
        active={currentStatus === "missing"}
        color="#BE123C"
        backgroundColor="#FFE4E6"
        disabled={disabled}
        compact={compact}
        onPress={() => onStatus("missing")}
      />

      <MemberStatusButton
        label="Issue"
        icon="alert"
        active={currentStatus === "issue"}
        color="#7E22CE"
        backgroundColor="#F3E8FF"
        disabled={disabled}
        compact={compact}
        onPress={() => onStatus("issue")}
      />

      {currentStatus !== "not_checked" && (
        <MemberStatusButton
          label="Clear"
          icon="refresh"
          active={false}
          color="#475569"
          backgroundColor="#F1F5F9"
          disabled={disabled}
          compact={compact}
          onPress={onClear}
        />
      )}
    </View>
  );
}

function MemberStatusButton({
  label,
  icon,
  active,
  color,
  backgroundColor,
  disabled,
  compact,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  color: string;
  backgroundColor: string;
  disabled?: boolean;
  compact?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.memberStatusButton,
        compact && styles.memberStatusButtonCompact,
        {
          backgroundColor,
          borderColor: active ? color : "#E2E8F0",
        },
        active && styles.memberStatusButtonActive,
        pressed && !disabled && styles.memberStatusButtonPressed,
        disabled && styles.memberStatusButtonDisabled,
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />

      {!compact && (
        <Text
          numberOfLines={1}
          style={[
            styles.memberStatusButtonText,
            {
              color,
            },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function EmptyList({
  icon,
  title,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}) {
  return (
    <View style={styles.emptyList}>
      <View style={styles.emptyListIcon}>
        <Ionicons name={icon} size={31} color="#64748B" />
      </View>

      <Text style={styles.emptyListTitle}>{title}</Text>
      <Text style={styles.emptyListText}>{text}</Text>
    </View>
  );
}

function OptionSelectorModal({
  visible,
  title,
  options,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: SelectorOption[];
  onClose: () => void;
  onSelect: (option: SelectorOption) => void;
}) {
  const [modalSearch, setModalSearch] = useState("");

  useEffect(() => {
    if (visible) {
      setModalSearch("");
    }
  }, [visible]);

  const filteredOptions = useMemo(() => {
    const query = normaliseSearch(modalSearch);

    if (!query) return options;

    return options.filter((option) =>
      matchesText(
        option.label,
        option.subtitle,
      ).includes(query),
    );
  }, [modalSearch, options]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={onClose}
        />

        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />

          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>

            <Pressable
              style={styles.modalCloseButton}
              onPress={onClose}
            >
              <Ionicons
                name="close"
                size={23}
                color="#334155"
              />
            </Pressable>
          </View>

          {options.length > 8 && (
            <View style={styles.modalSearch}>
              <Ionicons
                name="search"
                size={19}
                color="#64748B"
              />

              <TextInput
                value={modalSearch}
                onChangeText={setModalSearch}
                style={styles.modalSearchInput}
                placeholder="Search…"
                placeholderTextColor="#94A3B8"
                autoCorrect={false}
              />
            </View>
          )}

          <FlatList
            data={filteredOptions}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalList}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.modalOption,
                  pressed && styles.modalOptionPressed,
                ]}
                onPress={() => onSelect(item)}
              >
                <View style={styles.modalOptionContent}>
                  <Text style={styles.modalOptionLabel}>
                    {item.label}
                  </Text>

                  {item.subtitle ? (
                    <Text style={styles.modalOptionSubtitle}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={19}
                  color="#94A3B8"
                />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.modalEmptyText}>
                No options found.
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  projectContextBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 6,
  },

  projectContextText: {
    minWidth: 0,
  },

  projectContextLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.8,
  },

  projectContextValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },

  compactContextBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 7,
  },

  compactRefreshButton: {
    width: 42,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },

  fixedSearchArea: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 7,
    zIndex: 20,
  },

  scrollTabs: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    gap: 4,
    marginBottom: 8,
  },

  compactSummaryBar: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },

  compactSummaryLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },

  compactSummaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  compactSummaryText: {
    flex: 1,
  },

  compactSummaryTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },

  compactSummarySubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 2,
  },

  summaryContainerInline: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    padding: 14,
    marginBottom: 8,
  },

  sectionFilterButtonFull: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    marginBottom: 10,
  },

  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  screen: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },

  fullScreenLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },

  selectorButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },

  selectorButtonDisabled: {
    opacity: 0.55,
    backgroundColor: "#F8FAFC",
  },

  selectorButtonPressed: {
    backgroundColor: "#F1F5F9",
  },

  selectorButtonContent: {
    flex: 1,
    minWidth: 0,
  },

  selectorLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  selectorValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  noTowerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 38,
  },

  noTowerIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },

  noTowerTitle: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "800",
  },

  noTowerText: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 7,
  },

  summaryContainer: {
    marginHorizontal: 12,
    marginTop: 12,
    backgroundColor: "#0F172A",
    borderRadius: 17,
    padding: 15,
  },

  summaryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  summaryEyebrow: {
    color: "#94A3B8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },

  summaryMainValue: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    marginTop: 2,
  },

  progressPercentBadge: {
    borderRadius: 12,
    backgroundColor: "#1E293B",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  progressPercentText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  summaryProgressTrack: {
    height: 7,
    backgroundColor: "#334155",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 12,
  },

  summaryProgressFill: {
    height: "100%",
    backgroundColor: "#22C55E",
    borderRadius: 999,
  },

  summaryStats: {
    flexDirection: "row",
    marginTop: 14,
  },

  summaryStat: {
    flex: 1,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },

  summaryStatValue: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },

  summaryStatValueWarning: {
    color: "#FDA4AF",
  },

  summaryStatLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
  },

  searchBox: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
  },

  searchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 14,
    paddingVertical: 8,
    marginHorizontal: 9,
  },

  sectionFilterButton: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
  },

  sectionFilterText: {
    flex: 1,
    color: "#334155",
    fontSize: 12,
    fontWeight: "700",
    marginHorizontal: 7,
  },

  deliverySections: {
    marginBottom: 10,
  },

  deliverySectionButton: {
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDA4AF",
    backgroundColor: "#FFF1F2",
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 7,
  },

  deliverySectionButtonActive: {
    backgroundColor: "#BE123C",
    borderColor: "#BE123C",
  },

  deliverySectionText: {
    flex: 1,
    paddingRight: 10,
  },

  deliverySectionTitle: {
    color: "#BE123C",
    fontSize: 14,
    fontWeight: "900",
  },

  deliverySectionTitleActive: {
    color: "#FFFFFF",
  },

  deliverySectionSubtitle: {
    color: "#9F1239",
    fontSize: 10,
    marginTop: 2,
  },

  deliverySectionSubtitleActive: {
    color: "#FECDD3",
  },

  deliverySectionCount: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFE4E6",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  deliverySectionCountActive: {
    backgroundColor: "#FFFFFF",
  },

  deliverySectionCountText: {
    color: "#BE123C",
    fontSize: 13,
    fontWeight: "900",
  },

  deliverySectionCountTextActive: {
    color: "#BE123C",
  },

  completedSectionHeader: {
    minHeight: 60,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  completedSectionHeaderActive: {
    backgroundColor: "#DCFCE7",
    borderColor: "#86EFAC",
  },

  completedSectionLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  completedSectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },

  completedSectionTitle: {
    color: "#166534",
    fontSize: 13,
    fontWeight: "900",
  },

  completedSectionSubtitle: {
    color: "#15803D",
    fontSize: 10,
    marginTop: 2,
  },

  completedSectionRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  completedSectionCount: {
    minWidth: 31,
    height: 31,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },

  completedSectionCountText: {
    color: "#166534",
    fontSize: 12,
    fontWeight: "900",
  },

  completedBundleCard: {
    minHeight: 56,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 7,
    flexDirection: "row",
    alignItems: "center",
  },

  completedBundleIcon: {
    width: 33,
    height: 33,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
  },

  completedBundleText: {
    flex: 1,
    marginHorizontal: 9,
  },

  completedBundleTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },

  completedBundleSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 2,
  },

  outstandingListHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 3,
  },

  outstandingListHeadingText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  outstandingListHeadingCount: {
    color: "#BE123C",
    fontSize: 11,
    fontWeight: "900",
  },

  tabButton: {
    flex: 1,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    paddingHorizontal: 8,
  },

  tabButtonActive: {
    backgroundColor: "#E2E8F0",
  },

  tabButtonText: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },

  tabButtonTextActive: {
    color: "#0F172A",
    fontWeight: "800",
  },

  tabCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 6,
    paddingHorizontal: 5,
  },

  tabCountActive: {
    backgroundColor: "#0F172A",
  },

  tabCountText: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "800",
  },

  tabCountTextActive: {
    color: "#FFFFFF",
  },

  listContent: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 110,
  },

  card: {
    borderWidth: 1,
    borderLeftWidth: 5,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    borderRadius: 15,
    padding: 13,
    marginBottom: 9,
  },

  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  cardHeaderContent: {
    flex: 1,
    minWidth: 0,
  },

  bundleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },

  bundleTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },

  memberTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },

  cardSubtitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },

  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  bundleNumbers: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },

  numberTile: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },

  numberTileWarning: {
    backgroundColor: "#FFF1F2",
  },

  numberTileLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  numberTileValue: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
  },

  numberTileValueStrong: {
    color: "#15803D",
  },

  numberTileValueWarning: {
    color: "#BE123C",
  },

  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    marginBottom: 5,
  },

  progressLabel: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "700",
  },

  progressValue: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "800",
  },

  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#16A34A",
  },

  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 7,
    marginTop: 12,
  },

  quantityButton: {
    width: 46,
    height: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  quantityMinusButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },

  quantityPlusButton: {
    backgroundColor: "#16A34A",
  },

  quantityValueContainer: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
  },

  quantityValue: {
    color: "#0F172A",
    fontSize: 20,
    fontWeight: "900",
  },

  quantityLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "600",
  },

  bundleActions: {
    flexDirection: "row",
    gap: 5,
    marginTop: 8,
  },

  smallActionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },

  smallActionButtonPressed: {
    opacity: 0.72,
  },

  smallActionButtonDisabled: {
    opacity: 0.5,
  },

  smallActionButtonText: {
    fontSize: 10,
    fontWeight: "800",
    marginLeft: 4,
  },

  expandedSection: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    marginTop: 13,
    paddingTop: 12,
  },

  expandedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9,
  },

  expandedTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },

  expandedSubtitle: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 2,
  },

  clearBundleButton: {
    borderRadius: 9,
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  clearBundleButtonText: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
  },

  emptyInline: {
    borderRadius: 11,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 12,
  },

  emptyInlineText: {
    color: "#92400E",
    fontSize: 12,
    lineHeight: 18,
  },

  memberCheckRow: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    padding: 10,
    marginBottom: 7,
  },

  memberCheckHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  memberCheckTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },

  memberCheckTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },

  memberCheckMeta: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },

  memberHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  memberHeaderContent: {
    flex: 1,
  },

  memberDetailGrid: {
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },

  detailItem: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 9,
  },

  detailLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },

  detailValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },

  memberStatusButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 11,
  },

  memberStatusButtonsCompact: {
    marginTop: 8,
  },

  memberStatusButton: {
    flexGrow: 1,
    minWidth: "18%",
    minHeight: 41,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },

  memberStatusButtonCompact: {
    minWidth: 38,
    minHeight: 36,
    flexGrow: 0,
    paddingHorizontal: 10,
  },

  memberStatusButtonActive: {
    borderWidth: 2,
  },

  memberStatusButtonPressed: {
    opacity: 0.7,
  },

  memberStatusButtonDisabled: {
    opacity: 0.45,
  },

  memberStatusButtonText: {
    fontSize: 9,
    fontWeight: "800",
    marginLeft: 4,
  },

  boltCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    marginBottom: 8,
  },

  boltHeader: {
    flexDirection: "row",
    alignItems: "center",
  },

  boltDiameter: {
    minWidth: 62,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },

  boltDiameterText: {
    color: "#1E3A8A",
    fontSize: 16,
    fontWeight: "900",
  },

  boltHeaderText: {
    flex: 1,
    marginLeft: 11,
  },

  boltSegment: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },

  boltMeta: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
  },

  boltQty: {
    minWidth: 51,
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 11,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },

  boltQtyValue: {
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
  },

  boltQtyLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
  },

  boltListHeader: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 10,
    marginBottom: 9,
  },

  boltListHeaderText: {
    color: "#1E40AF",
    fontSize: 11,
    lineHeight: 17,
    fontWeight: "600",
  },

  emptyList: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 35,
    paddingVertical: 55,
  },

  emptyListIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },

  emptyListTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 14,
  },

  emptyListText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
  },

  modalSheet: {
    maxHeight: "78%",
    minHeight: 300,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 9,
  },

  modalHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 8,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 17,
    paddingVertical: 10,
  },

  modalTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 19,
    fontWeight: "800",
  },

  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },

  modalSearch: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
  },

  modalSearchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 14,
    marginLeft: 8,
    paddingVertical: 9,
  },

  modalList: {
    paddingHorizontal: 13,
    paddingBottom: 35,
  },

  modalOption: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 5,
  },

  modalOptionPressed: {
    backgroundColor: "#F8FAFC",
  },

  modalOptionContent: {
    flex: 1,
  },

  modalOptionLabel: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },

  modalOptionSubtitle: {
    color: "#64748B",
    fontSize: 11,
    marginTop: 3,
  },

  modalEmptyText: {
    color: "#64748B",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 35,
  },
});
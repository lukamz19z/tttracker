import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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

type Tower = {
  id: string;
  project_id: string;
  name?: string | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  line?: string | null;
  status?: string | null;
  extra_data?: Record<string, unknown> | null;
};

type DbBundle = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string | null;
  qty_required: number | null;
};

type Bundle = {
  id?: string;
  tower_id: string;
  bundle_no: string;
  section: string;
  qty_required: number;
};

type DeliveryItem = {
  id?: string;
  delivery_id?: string;
  bundle_no: string;
  qty_delivered: number | null;
};

type Delivery = {
  id: string;
  tower_id: string;
  delivered_by: string | null;
  vehicle: string | null;
  created_at: string;
  tower_bundle_delivery_items: DeliveryItem[] | null;
};

type BundleStatus = Bundle & {
  required: number;
  delivered: number;
  remaining: number;
  percent: number;
};

type SelectorOption = {
  id: string;
  label: string;
  subtitle?: string;
};

type MainView = "tower_status" | "history";

type TowerDeliverySummary = {
  tower: Tower;
  requiredQty: number;
  deliveredQty: number;
  remainingQty: number;
  progress: number;
  requiredBundles: number;
  completeBundles: number;
  partialBundles: number;
  outstandingBundles: BundleStatus[];
  deliveredBundles: BundleStatus[];
  docketCount: number;
  latestDelivery: string | null;
};

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTowerLabel(tower?: Tower | null): string {
  if (!tower) return "Unknown tower";
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

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function matchesText(
  ...values: (string | number | null | undefined)[]
): string {
  return values
    .map((value) => (value == null ? "" : String(value)))
    .join(" ")
    .toLowerCase();
}

function clampQty(value: unknown, max: number): number {
  return Math.min(
    Math.floor(Math.max(0, safeNumber(value, 0))),
    Math.max(0, Math.floor(max)),
  );
}

function percent(part: number, total: number): number {
  return total > 0 ? Math.min((part / total) * 100, 100) : 0;
}

export default function TruckDeliveryScreen() {
  const { profile } = useAuth();

  const projectId = profile?.projectId ?? "";

  const [towers, setTowers] = useState<Tower[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [projectBundles, setProjectBundles] = useState<Bundle[]>([]);

  const [search, setSearch] = useState("");
  const [mainView, setMainView] = useState<MainView>("tower_status");
  const [expandedTowerId, setExpandedTowerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorTitle, setSelectorTitle] = useState("");
  const [selectorOptions, setSelectorOptions] = useState<SelectorOption[]>([]);
  const [selectorAction, setSelectorAction] = useState<
    ((option: SelectorOption) => void) | null
  >(null);

  const [addVisible, setAddVisible] = useState(false);
  const [addTowerId, setAddTowerId] = useState("");
  const [addBundles, setAddBundles] = useState<Bundle[]>([]);
  const [towerDeliveries, setTowerDeliveries] = useState<Delivery[]>([]);
  const [deliveredBy, setDeliveredBy] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [addSearch, setAddSearch] = useState("");
  const [loadingTower, setLoadingTower] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editVisible, setEditVisible] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [editBundles, setEditBundles] = useState<Bundle[]>([]);
  const [editDeliveredBy, setEditDeliveredBy] = useState("");
  const [editVehicle, setEditVehicle] = useState("");
  const [editQtyMap, setEditQtyMap] = useState<Record<string, number>>({});
  const [editSearch, setEditSearch] = useState("");
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const loadProject = useCallback(
    async (selectedProjectId: string, silent = false) => {
      if (!selectedProjectId) {
        setTowers([]);
        setDeliveries([]);
        setProjectBundles([]);
        return;
      }

      if (!silent) setLoading(true);

      const { data: towerData, error: towerError } = await supabase
        .from("towers")
        .select("*")
        .eq("project_id", selectedProjectId);

      if (towerError) {
        Alert.alert("Could not load towers", towerError.message);
        setTowers([]);
        setDeliveries([]);
        setProjectBundles([]);
        if (!silent) setLoading(false);
        return;
      }

      const loadedTowers = ((towerData ?? []) as Tower[]).sort((a, b) =>
        getTowerLabel(a).localeCompare(getTowerLabel(b), undefined, {
          numeric: true,
        }),
      );

      setTowers(loadedTowers);
      const towerIds = loadedTowers.map((tower) => tower.id);

      if (!towerIds.length) {
        setDeliveries([]);
        setProjectBundles([]);
        if (!silent) setLoading(false);
        return;
      }

      const [bundleResponse, deliveryResponse] = await Promise.all([
        supabase
          .from("tower_required_bundles")
          .select("*")
          .in("tower_id", towerIds)
          .order("section")
          .order("bundle_no"),
        supabase
          .from("tower_bundle_deliveries")
          .select("*, tower_bundle_delivery_items(*)")
          .in("tower_id", towerIds)
          .order("created_at", { ascending: false })
          .limit(250),
      ]);

      const projectError = bundleResponse.error || deliveryResponse.error;

      if (projectError) {
        Alert.alert("Could not load delivery data", projectError.message);
        setDeliveries([]);
        setProjectBundles([]);
      } else {
        setProjectBundles(
          ((bundleResponse.data ?? []) as DbBundle[]).map((row) => ({
            id: row.id,
            tower_id: row.tower_id,
            bundle_no: safeString(row.bundle_no),
            section: safeString(row.section, "General"),
            qty_required: Math.max(safeNumber(row.qty_required, 0), 0),
          })),
        );
        setDeliveries((deliveryResponse.data ?? []) as Delivery[]);
      }

      if (!silent) setLoading(false);
    },
    [],
  );

  useEffect(() => {
    setSearch("");
    setMainView("tower_status");
    setExpandedTowerId(null);
    setAddVisible(false);
    setEditVisible(false);
    void loadProject(projectId);
  }, [loadProject, projectId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadProject(projectId, true);
    setRefreshing(false);
  }, [loadProject, projectId]);

  const towerMap = useMemo(() => {
    const map: Record<string, Tower> = {};
    towers.forEach((tower) => {
      map[tower.id] = tower;
    });
    return map;
  }, [towers]);

  const filteredDeliveries = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return deliveries;

    return deliveries.filter((delivery) => {
      const items = (delivery.tower_bundle_delivery_items ?? [])
        .map((item) => `${item.bundle_no} ${item.qty_delivered ?? 0}`)
        .join(" ");

      return matchesText(
        getTowerLabel(towerMap[delivery.tower_id]),
        delivery.delivered_by,
        delivery.vehicle,
        formatDateTime(delivery.created_at),
        items,
      ).includes(query);
    });
  }, [deliveries, search, towerMap]);

  const deliveryTotalsByTower = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};

    deliveries.forEach((delivery) => {
      const towerTotals = map[delivery.tower_id] ?? {};

      (delivery.tower_bundle_delivery_items ?? []).forEach((item) => {
        towerTotals[item.bundle_no] =
          (towerTotals[item.bundle_no] ?? 0) +
          Math.max(safeNumber(item.qty_delivered, 0), 0);
      });

      map[delivery.tower_id] = towerTotals;
    });

    return map;
  }, [deliveries]);

  const towerSummaries = useMemo<TowerDeliverySummary[]>(() => {
    return towers.map((tower) => {
      const towerBundles = projectBundles.filter(
        (bundle) => bundle.tower_id === tower.id,
      );
      const totals = deliveryTotalsByTower[tower.id] ?? {};

      const statuses: BundleStatus[] = towerBundles.map((bundle) => {
        const required = Math.max(bundle.qty_required, 0);
        const delivered = Math.max(totals[bundle.bundle_no] ?? 0, 0);
        const remaining = Math.max(required - delivered, 0);

        return {
          ...bundle,
          required,
          delivered,
          remaining,
          percent: percent(delivered, required),
        };
      });

      const towerDockets = deliveries.filter(
        (delivery) => delivery.tower_id === tower.id,
      );
      const requiredQty = statuses.reduce(
        (sum, bundle) => sum + bundle.required,
        0,
      );
      const deliveredQty = statuses.reduce(
        (sum, bundle) => sum + bundle.delivered,
        0,
      );

      return {
        tower,
        requiredQty,
        deliveredQty,
        remainingQty: Math.max(requiredQty - deliveredQty, 0),
        progress: percent(deliveredQty, requiredQty),
        requiredBundles: statuses.length,
        completeBundles: statuses.filter(
          (bundle) => bundle.required > 0 && bundle.remaining <= 0,
        ).length,
        partialBundles: statuses.filter(
          (bundle) => bundle.delivered > 0 && bundle.remaining > 0,
        ).length,
        outstandingBundles: statuses.filter(
          (bundle) => bundle.remaining > 0,
        ),
        deliveredBundles: statuses.filter(
          (bundle) => bundle.required > 0 && bundle.remaining <= 0,
        ),
        docketCount: towerDockets.length,
        latestDelivery: towerDockets[0]?.created_at ?? null,
      };
    });
  }, [deliveries, deliveryTotalsByTower, projectBundles, towers]);

  const filteredTowerSummaries = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return towerSummaries;

    return towerSummaries.filter((summary) => {
      const bundleText = [
        ...summary.outstandingBundles,
        ...summary.deliveredBundles,
      ]
        .map((bundle) => `${bundle.bundle_no} ${bundle.section}`)
        .join(" ");

      return matchesText(
        getTowerLabel(summary.tower),
        summary.tower.line,
        summary.requiredQty,
        summary.deliveredQty,
        summary.remainingQty,
        bundleText,
      ).includes(query);
    });
  }, [search, towerSummaries]);

  const projectSummary = useMemo(() => {
    const required = towerSummaries.reduce(
      (sum, summary) => sum + summary.requiredQty,
      0,
    );
    const delivered = towerSummaries.reduce(
      (sum, summary) => sum + summary.deliveredQty,
      0,
    );

    return {
      required,
      delivered,
      remaining: Math.max(required - delivered, 0),
      progress: percent(delivered, required),
      towersComplete: towerSummaries.filter(
        (summary) =>
          summary.requiredQty > 0 && summary.remainingQty <= 0,
      ).length,
      towersOutstanding: towerSummaries.filter(
        (summary) => summary.remainingQty > 0,
      ).length,
    };
  }, [towerSummaries]);

  function openSelector(
    title: string,
    options: SelectorOption[],
    onSelect: (option: SelectorOption) => void,
  ) {
    setSelectorTitle(title);
    setSelectorOptions(options);
    setSelectorAction(() => onSelect);
    setSelectorVisible(true);
  }

  function openTowerSelector() {
    openSelector(
      "Select Tower",
      towers.map((tower) => ({
        id: tower.id,
        label: getTowerLabel(tower),
        subtitle: tower.line ?? tower.status ?? undefined,
      })),
      (option) => void selectAddTower(option.id),
    );
  }

  async function selectAddTower(towerId: string) {
    setAddTowerId(towerId);
    setAddBundles([]);
    setTowerDeliveries([]);
    setQtyMap({});
    setAddSearch("");
    setLoadingTower(true);

    const [bundleRes, deliveryRes] = await Promise.all([
      supabase
        .from("tower_required_bundles")
        .select("*")
        .eq("tower_id", towerId)
        .order("section")
        .order("bundle_no"),
      supabase
        .from("tower_bundle_deliveries")
        .select("*, tower_bundle_delivery_items(*)")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    const error = bundleRes.error || deliveryRes.error;

    if (error) {
      Alert.alert("Could not load tower", error.message);
      setLoadingTower(false);
      return;
    }

    setAddBundles(
      ((bundleRes.data ?? []) as DbBundle[]).map((row) => ({
        id: row.id,
        tower_id: row.tower_id,
        bundle_no: safeString(row.bundle_no),
        section: safeString(row.section, "General"),
        qty_required: Math.max(safeNumber(row.qty_required, 0), 0),
      })),
    );
    setTowerDeliveries((deliveryRes.data ?? []) as Delivery[]);
    setLoadingTower(false);
  }

  const deliveredTotals = useMemo(() => {
    const map: Record<string, number> = {};

    towerDeliveries.forEach((delivery) => {
      (delivery.tower_bundle_delivery_items ?? []).forEach((item) => {
        map[item.bundle_no] =
          (map[item.bundle_no] ?? 0) +
          Math.max(safeNumber(item.qty_delivered, 0), 0);
      });
    });

    return map;
  }, [towerDeliveries]);

  const addStatuses = useMemo<BundleStatus[]>(
    () =>
      addBundles.map((bundle) => {
        const required = bundle.qty_required;
        const delivered = Math.max(
          deliveredTotals[bundle.bundle_no] ?? 0,
          0,
        );
        const remaining = Math.max(required - delivered, 0);

        return {
          ...bundle,
          required,
          delivered,
          remaining,
          percent: percent(delivered, required),
        };
      }),
    [addBundles, deliveredTotals],
  );

  const visibleAddBundles = useMemo(() => {
    const query = addSearch.trim().toLowerCase();

    return addStatuses.filter((bundle) => {
      if (bundle.remaining <= 0) return false;
      if (!query) return true;
      return matchesText(bundle.bundle_no, bundle.section).includes(query);
    });
  }, [addSearch, addStatuses]);

  const addSummary = useMemo(() => {
    const required = addStatuses.reduce(
      (sum, bundle) => sum + bundle.required,
      0,
    );
    const delivered = addStatuses.reduce(
      (sum, bundle) => sum + bundle.delivered,
      0,
    );

    return {
      required,
      delivered,
      remaining: Math.max(required - delivered, 0),
      progress: percent(delivered, required),
    };
  }, [addStatuses]);

  const selectedQty = useMemo(
    () =>
      Object.values(qtyMap).reduce(
        (sum, value) => sum + Math.max(safeNumber(value, 0), 0),
        0,
      ),
    [qtyMap],
  );

  const selectedLines = useMemo(
    () =>
      Object.values(qtyMap).filter((value) => safeNumber(value, 0) > 0)
        .length,
    [qtyMap],
  );

  function updateQty(bundleNo: string, raw: string) {
    const bundle = addStatuses.find((item) => item.bundle_no === bundleNo);
    const next = clampQty(raw === "" ? 0 : raw, bundle?.remaining ?? 0);

    setQtyMap((current) => {
      const copy = { ...current };
      if (next <= 0) delete copy[bundleNo];
      else copy[bundleNo] = next;
      return copy;
    });
  }

  function changeQty(bundleNo: string, amount: number) {
    updateQty(bundleNo, String((qtyMap[bundleNo] ?? 0) + amount));
  }

  function openAdd(preselectedTowerId?: string) {
    setAddVisible(true);
    setAddTowerId("");
    setAddBundles([]);
    setTowerDeliveries([]);
    setDeliveredBy("");
    setVehicle("");
    setQtyMap({});
    setAddSearch("");

    if (preselectedTowerId) {
      void selectAddTower(preselectedTowerId);
    }
  }

  function closeAdd() {
    if (saving) return;
    setAddVisible(false);
  }

  async function saveDelivery() {
    if (!addTowerId) {
      Alert.alert("Select a tower", "Choose the tower for this delivery.");
      return;
    }

    if (!deliveredBy.trim()) {
      Alert.alert("Driver required", "Enter the delivered-by name.");
      return;
    }

    const items = Object.entries(qtyMap)
      .filter(([, qty]) => safeNumber(qty, 0) > 0)
      .map(([bundle_no, qty]) => ({
        bundle_no,
        qty_delivered: safeNumber(qty, 0),
      }));

    if (!items.length) {
      Alert.alert("No quantities", "Enter at least one bundle quantity.");
      return;
    }

    for (const item of items) {
      const bundle = addStatuses.find(
        (candidate) => candidate.bundle_no === item.bundle_no,
      );

      if (!bundle || item.qty_delivered > bundle.remaining) {
        Alert.alert(
          "Quantity too high",
          `${item.bundle_no} only has ${bundle?.remaining ?? 0} remaining.`,
        );
        return;
      }
    }

    setSaving(true);

    const { data, error } = await supabase
      .from("tower_bundle_deliveries")
      .insert({
        tower_id: addTowerId,
        delivered_by: deliveredBy.trim(),
        vehicle: vehicle.trim(),
      })
      .select()
      .single();

    if (error || !data) {
      setSaving(false);
      Alert.alert(
        "Could not save delivery",
        error?.message ?? "Delivery creation failed.",
      );
      return;
    }

    const { error: itemError } = await supabase
      .from("tower_bundle_delivery_items")
      .insert(
        items.map((item) => ({
          delivery_id: data.id,
          bundle_no: item.bundle_no,
          qty_delivered: item.qty_delivered,
        })),
      );

    if (itemError) {
      await supabase
        .from("tower_bundle_deliveries")
        .delete()
        .eq("id", data.id);

      setSaving(false);
      Alert.alert("Could not save items", itemError.message);
      return;
    }

    setSaving(false);
    setAddVisible(false);
    await loadProject(projectId, true);
    Alert.alert("Delivery submitted", "The truck docket has been saved.");
  }

  async function openEdit(delivery: Delivery) {
    setEditingDelivery(delivery);
    setEditVisible(true);
    setEditDeliveredBy(delivery.delivered_by ?? "");
    setEditVehicle(delivery.vehicle ?? "");
    setEditSearch("");

    const map: Record<string, number> = {};
    (delivery.tower_bundle_delivery_items ?? []).forEach((item) => {
      map[item.bundle_no] =
        (map[item.bundle_no] ?? 0) +
        Math.max(safeNumber(item.qty_delivered, 0), 0);
    });
    setEditQtyMap(map);

    setLoadingEdit(true);

    const { data, error } = await supabase
      .from("tower_required_bundles")
      .select("*")
      .eq("tower_id", delivery.tower_id)
      .order("section")
      .order("bundle_no");

    if (error) {
      Alert.alert("Could not load bundles", error.message);
      setLoadingEdit(false);
      return;
    }

    setEditBundles(
      ((data ?? []) as DbBundle[]).map((row) => ({
        id: row.id,
        tower_id: row.tower_id,
        bundle_no: safeString(row.bundle_no),
        section: safeString(row.section, "General"),
        qty_required: Math.max(safeNumber(row.qty_required, 0), 0),
      })),
    );

    setLoadingEdit(false);
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditVisible(false);
    setEditingDelivery(null);
  }

  const otherDeliveryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    if (!editingDelivery) return map;

    deliveries
      .filter(
        (delivery) =>
          delivery.tower_id === editingDelivery.tower_id &&
          delivery.id !== editingDelivery.id,
      )
      .forEach((delivery) => {
        (delivery.tower_bundle_delivery_items ?? []).forEach((item) => {
          map[item.bundle_no] =
            (map[item.bundle_no] ?? 0) +
            Math.max(safeNumber(item.qty_delivered, 0), 0);
        });
      });

    return map;
  }, [deliveries, editingDelivery]);

  const editStatuses = useMemo<BundleStatus[]>(
    () =>
      editBundles.map((bundle) => {
        const required = bundle.qty_required;
        const delivered = Math.max(
          otherDeliveryTotals[bundle.bundle_no] ?? 0,
          0,
        );
        const remaining = Math.max(required - delivered, 0);

        return {
          ...bundle,
          required,
          delivered,
          remaining,
          percent: percent(delivered, required),
        };
      }),
    [editBundles, otherDeliveryTotals],
  );

  const visibleEditBundles = useMemo(() => {
    const query = editSearch.trim().toLowerCase();
    if (!query) return editStatuses;

    return editStatuses.filter((bundle) =>
      matchesText(bundle.bundle_no, bundle.section).includes(query),
    );
  }, [editSearch, editStatuses]);

  const editSelectedQty = useMemo(
    () =>
      Object.values(editQtyMap).reduce(
        (sum, value) => sum + Math.max(safeNumber(value, 0), 0),
        0,
      ),
    [editQtyMap],
  );

  function updateEditQty(bundleNo: string, raw: string) {
    const bundle = editStatuses.find((item) => item.bundle_no === bundleNo);
    const next = clampQty(raw === "" ? 0 : raw, bundle?.remaining ?? 0);

    setEditQtyMap((current) => {
      const copy = { ...current };
      if (next <= 0) delete copy[bundleNo];
      else copy[bundleNo] = next;
      return copy;
    });
  }

  function changeEditQty(bundleNo: string, amount: number) {
    updateEditQty(
      bundleNo,
      String((editQtyMap[bundleNo] ?? 0) + amount),
    );
  }

  async function saveEdit() {
    if (!editingDelivery) return;

    if (!editDeliveredBy.trim()) {
      Alert.alert("Driver required", "Enter the delivered-by name.");
      return;
    }

    const items = Object.entries(editQtyMap)
      .filter(([, qty]) => safeNumber(qty, 0) > 0)
      .map(([bundle_no, qty]) => ({
        delivery_id: editingDelivery.id,
        bundle_no,
        qty_delivered: safeNumber(qty, 0),
      }));

    if (!items.length) {
      Alert.alert(
        "No quantities",
        "Enter at least one quantity or delete the incorrect docket.",
      );
      return;
    }

    for (const item of items) {
      const bundle = editStatuses.find(
        (candidate) => candidate.bundle_no === item.bundle_no,
      );

      if (!bundle || item.qty_delivered > bundle.remaining) {
        Alert.alert(
          "Quantity too high",
          `${item.bundle_no} can have a maximum of ${
            bundle?.remaining ?? 0
          } on this docket.`,
        );
        return;
      }
    }

    setSavingEdit(true);

    const { error: updateError } = await supabase
      .from("tower_bundle_deliveries")
      .update({
        delivered_by: editDeliveredBy.trim(),
        vehicle: editVehicle.trim(),
      })
      .eq("id", editingDelivery.id);

    if (updateError) {
      setSavingEdit(false);
      Alert.alert("Could not update docket", updateError.message);
      return;
    }

    const { error: deleteError } = await supabase
      .from("tower_bundle_delivery_items")
      .delete()
      .eq("delivery_id", editingDelivery.id);

    if (deleteError) {
      setSavingEdit(false);
      Alert.alert("Could not update items", deleteError.message);
      return;
    }

    const { error: insertError } = await supabase
      .from("tower_bundle_delivery_items")
      .insert(items);

    if (insertError) {
      setSavingEdit(false);
      Alert.alert("Could not save corrected items", insertError.message);
      return;
    }

    setSavingEdit(false);
    setEditVisible(false);
    setEditingDelivery(null);
    await loadProject(projectId, true);
    Alert.alert("Delivery updated", "The corrected docket has been saved.");
  }

  function confirmDelete(delivery: Delivery) {
    Alert.alert(
      "Delete delivery?",
      `Delete the ${getTowerLabel(
        towerMap[delivery.tower_id],
      )} docket from ${formatDateTime(
        delivery.created_at,
      )}? Use this only for an incorrect or duplicate docket.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void deleteDelivery(delivery),
        },
      ],
    );
  }

  async function deleteDelivery(delivery: Delivery) {
    const { error } = await supabase
      .from("tower_bundle_deliveries")
      .delete()
      .eq("id", delivery.id);

    if (error) {
      Alert.alert("Could not delete delivery", error.message);
      return;
    }

    setEditVisible(false);
    setEditingDelivery(null);
    await loadProject(projectId, true);
  }

  function renderTowerSummary({
    item: summary,
  }: {
    item: TowerDeliverySummary;
  }) {
    const expanded = expandedTowerId === summary.tower.id;
    const isComplete =
      summary.requiredQty > 0 && summary.remainingQty <= 0;

    return (
      <View
        style={[
          styles.towerStatusCard,
          isComplete && styles.towerStatusCardComplete,
        ]}
      >
        <Pressable
          style={styles.towerStatusHeader}
          onPress={() =>
            setExpandedTowerId((current) =>
              current === summary.tower.id ? null : summary.tower.id,
            )
          }
        >
          <View
            style={[
              styles.towerStatusIcon,
              isComplete && styles.towerStatusIconComplete,
            ]}
          >
            <Ionicons
              name={
                isComplete
                  ? "checkmark-circle-outline"
                  : "business-outline"
              }
              size={21}
              color={isComplete ? "#15803D" : "#1E3A8A"}
            />
          </View>

          <View style={styles.towerStatusTitleWrap}>
            <Text style={styles.towerStatusTitle}>
              {getTowerLabel(summary.tower)}
            </Text>
            <Text style={styles.towerStatusSubtitle}>
              {summary.docketCount} docket
              {summary.docketCount === 1 ? "" : "s"}
              {summary.latestDelivery
                ? ` · Last ${formatDateTime(summary.latestDelivery)}`
                : " · No deliveries yet"}
            </Text>
          </View>

          <View
            style={[
              styles.towerProgressBadge,
              isComplete && styles.towerProgressBadgeComplete,
            ]}
          >
            <Text
              style={[
                styles.towerProgressBadgeText,
                isComplete && styles.towerProgressBadgeTextComplete,
              ]}
            >
              {summary.progress.toFixed(0)}%
            </Text>
          </View>

          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={19}
            color="#64748B"
          />
        </Pressable>

        <View style={styles.towerProgressTrack}>
          <View
            style={[
              styles.towerProgressFill,
              {
                width: `${summary.progress}%`,
                backgroundColor: isComplete ? "#16A34A" : "#2563EB",
              },
            ]}
          />
        </View>

        <View style={styles.towerMetricRow}>
          <TowerMetric label="Required" value={summary.requiredQty} />
          <TowerMetric
            label="Delivered"
            value={summary.deliveredQty}
            good
          />
          <TowerMetric
            label="Outstanding"
            value={summary.remainingQty}
            warning={summary.remainingQty > 0}
          />
        </View>

        <View style={styles.towerCountRow}>
          <View style={styles.towerCountChip}>
            <Text style={styles.towerCountChipValue}>
              {summary.completeBundles}
            </Text>
            <Text style={styles.towerCountChipLabel}>Complete</Text>
          </View>

          <View style={styles.towerCountChip}>
            <Text style={styles.towerCountChipValue}>
              {summary.partialBundles}
            </Text>
            <Text style={styles.towerCountChipLabel}>Partial</Text>
          </View>

          <View style={styles.towerCountChip}>
            <Text
              style={[
                styles.towerCountChipValue,
                summary.outstandingBundles.length > 0 &&
                  styles.towerCountChipWarning,
              ]}
            >
              {summary.outstandingBundles.length}
            </Text>
            <Text style={styles.towerCountChipLabel}>Outstanding</Text>
          </View>
        </View>

        <View style={styles.towerQuickActions}>
          <Pressable
            style={styles.towerAddButton}
            onPress={() => openAdd(summary.tower.id)}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.towerAddButtonText}>Add Delivery</Text>
          </Pressable>

          <Pressable
            style={styles.towerHistoryButton}
            onPress={() => {
              setSearch(getTowerLabel(summary.tower));
              setMainView("history");
            }}
          >
            <Ionicons name="time-outline" size={17} color="#475569" />
            <Text style={styles.towerHistoryButtonText}>
              View Dockets
            </Text>
          </Pressable>
        </View>

        {expanded && (
          <View style={styles.towerExpanded}>
            <BundleStatusSection
              title="Outstanding Bundles"
              count={summary.outstandingBundles.length}
              bundles={summary.outstandingBundles}
              emptyText="No outstanding bundles for this tower."
              outstanding
            />

            <BundleStatusSection
              title="Delivered Bundles"
              count={summary.deliveredBundles.length}
              bundles={summary.deliveredBundles}
              emptyText="No bundles are fully delivered yet."
            />
          </View>
        )}
      </View>
    );
  }

  function renderDelivery({ item }: { item: Delivery }) {
    const items = item.tower_bundle_delivery_items ?? [];
    const total = items.reduce(
      (sum, deliveryItem) =>
        sum + Math.max(safeNumber(deliveryItem.qty_delivered, 0), 0),
      0,
    );

    return (
      <View style={styles.deliveryCard}>
        <View style={styles.deliveryHeader}>
          <View style={styles.towerIcon}>
            <Ionicons
              name="business-outline"
              size={20}
              color="#1E3A8A"
            />
          </View>

          <View style={styles.deliveryTitleWrap}>
            <Text style={styles.deliveryTower}>
              {getTowerLabel(towerMap[item.tower_id])}
            </Text>
            <Text style={styles.deliveryDate}>
              {formatDateTime(item.created_at)}
            </Text>
          </View>

          <View style={styles.qtyBadge}>
            <Text style={styles.qtyBadgeValue}>{total}</Text>
            <Text style={styles.qtyBadgeLabel}>Qty</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <MetaBlock
            label="Delivered by"
            value={item.delivered_by || "—"}
          />
          <MetaBlock label="Truck" value={item.vehicle || "—"} />
        </View>

        <View style={styles.chipRow}>
          {items.map((deliveryItem, index) => (
            <View
              key={`${item.id}-${deliveryItem.bundle_no}-${index}`}
              style={styles.itemChip}
            >
              <Text style={styles.itemChipText}>
                {deliveryItem.bundle_no} ×{" "}
                {safeNumber(deliveryItem.qty_delivered, 0)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            style={styles.editButton}
            onPress={() => void openEdit(item)}
          >
            <Ionicons name="create-outline" size={17} color="#1D4ED8" />
            <Text style={styles.editButtonText}>Edit docket</Text>
          </Pressable>

          <Pressable
            style={styles.deleteButton}
            onPress={() => confirmDelete(item)}
          >
            <Ionicons name="trash-outline" size={17} color="#BE123C" />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerIcon}>
              <Ionicons name="car-outline" size={23} color="#FFFFFF" />
            </View>

            <View style={styles.headerText}>
              <Text style={styles.pageTitle}>Truck Deliveries</Text>
              <Text style={styles.pageSubtitle}>
                Enter and correct tower delivery dockets
              </Text>
            </View>

            <Pressable
              style={styles.refreshButton}
              onPress={() => void refresh()}
              disabled={refreshing || !projectId}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color="#334155" />
              ) : (
                <Ionicons name="refresh" size={20} color="#334155" />
              )}
            </Pressable>
          </View>

          <View style={styles.projectContext}>
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

        <View style={styles.toolbar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={19} color="#64748B" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              style={styles.searchInput}
              placeholder={
                mainView === "tower_status"
                  ? "Search tower or bundle…"
                  : "Search tower, driver, truck, bundle or date…"
              }
              placeholderTextColor="#94A3B8"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons
                  name="close-circle"
                  size={19}
                  color="#94A3B8"
                />
              </Pressable>
            )}
          </View>

          <Pressable
            style={[
              styles.addButton,
              !projectId && styles.disabledButton,
            ]}
            disabled={!projectId}
            onPress={() => openAdd()}
          >
            <Ionicons name="add" size={21} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add Delivery</Text>
          </Pressable>
        </View>

        <View style={styles.viewTabs}>
          <Pressable
            style={[
              styles.viewTab,
              mainView === "tower_status" && styles.viewTabActive,
            ]}
            onPress={() => {
              setMainView("tower_status");
              setSearch("");
            }}
          >
            <Ionicons
              name="business-outline"
              size={17}
              color={
                mainView === "tower_status" ? "#FFFFFF" : "#475569"
              }
            />
            <Text
              style={[
                styles.viewTabText,
                mainView === "tower_status" &&
                  styles.viewTabTextActive,
              ]}
            >
              Tower Status
            </Text>
            <View
              style={[
                styles.viewTabCount,
                mainView === "tower_status" &&
                  styles.viewTabCountActive,
              ]}
            >
              <Text
                style={[
                  styles.viewTabCountText,
                  mainView === "tower_status" &&
                    styles.viewTabCountTextActive,
                ]}
              >
                {filteredTowerSummaries.length}
              </Text>
            </View>
          </Pressable>

          <Pressable
            style={[
              styles.viewTab,
              mainView === "history" && styles.viewTabActive,
            ]}
            onPress={() => {
              setMainView("history");
              setSearch("");
            }}
          >
            <Ionicons
              name="time-outline"
              size={17}
              color={mainView === "history" ? "#FFFFFF" : "#475569"}
            />
            <Text
              style={[
                styles.viewTabText,
                mainView === "history" && styles.viewTabTextActive,
              ]}
            >
              Docket History
            </Text>
            <View
              style={[
                styles.viewTabCount,
                mainView === "history" && styles.viewTabCountActive,
              ]}
            >
              <Text
                style={[
                  styles.viewTabCountText,
                  mainView === "history" &&
                    styles.viewTabCountTextActive,
                ]}
              >
                {filteredDeliveries.length}
              </Text>
            </View>
          </Pressable>
        </View>

        {!projectId ? (
          <Empty
            title="No project selected"
            text="Return to Home and select a current project to view and record truck deliveries."
          />
        ) : loading ? (
          <Loading text="Loading project deliveries…" />
        ) : mainView === "tower_status" ? (
          <FlatList
            data={filteredTowerSummaries}
            keyExtractor={(item) => item.tower.id}
            renderItem={renderTowerSummary}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
              />
            }
            ListHeaderComponent={
              <View style={styles.projectOverviewCard}>
                <View style={styles.projectOverviewTop}>
                  <View>
                    <Text style={styles.projectOverviewEyebrow}>
                      PROJECT DELIVERY STATUS
                    </Text>
                    <Text style={styles.projectOverviewPercent}>
                      {projectSummary.progress.toFixed(0)}%
                    </Text>
                  </View>

                  <Text style={styles.projectOverviewFraction}>
                    {projectSummary.delivered}/{projectSummary.required}
                  </Text>
                </View>

                <View style={styles.projectOverviewTrack}>
                  <View
                    style={[
                      styles.projectOverviewFill,
                      { width: `${projectSummary.progress}%` },
                    ]}
                  />
                </View>

                <View style={styles.projectOverviewStats}>
                  <ProjectOverviewStat
                    label="Outstanding Qty"
                    value={projectSummary.remaining}
                    warning
                  />
                  <ProjectOverviewStat
                    label="Towers Outstanding"
                    value={projectSummary.towersOutstanding}
                    warning
                  />
                  <ProjectOverviewStat
                    label="Towers Complete"
                    value={projectSummary.towersComplete}
                  />
                </View>
              </View>
            }
            ListEmptyComponent={
              <Empty
                title="No tower delivery status found"
                text={
                  search.trim()
                    ? "Try changing the search."
                    : "No tower bundle registers are available for this project."
                }
              />
            }
          />
        ) : (
          <FlatList
            data={filteredDeliveries}
            keyExtractor={(item) => item.id}
            renderItem={renderDelivery}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
              />
            }
            ListHeaderComponent={
              <View style={styles.historyHeaderCard}>
                <View style={styles.historyHeaderIcon}>
                  <Ionicons
                    name="time-outline"
                    size={21}
                    color="#1D4ED8"
                  />
                </View>
                <View style={styles.historyHeaderText}>
                  <Text style={styles.historyHeaderTitle}>
                    Delivery Docket History
                  </Text>
                  <Text style={styles.historyHeaderSubtitle}>
                    Search by tower, driver, truck, bundle or date. Open a
                    docket only when it needs correcting.
                  </Text>
                </View>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>
                    {filteredDeliveries.length}
                  </Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <Empty
                title="No deliveries found"
                text={
                  search.trim()
                    ? "Try changing the search."
                    : "Tap Add Delivery to create the first truck docket."
                }
              />
            }
          />
        )}

        <OptionSelector
          visible={selectorVisible}
          title={selectorTitle}
          options={selectorOptions}
          onClose={() => setSelectorVisible(false)}
          onSelect={(option) => {
            selectorAction?.(option);
            setSelectorVisible(false);
          }}
        />

        <DocketModal
          visible={addVisible}
          title="Add Truck Delivery"
          onClose={closeAdd}
          footer={
            <ModalFooter
              label="Selected Qty"
              value={selectedQty}
              helper={`${selectedLines} bundle line${
                selectedLines === 1 ? "" : "s"
              }`}
              buttonLabel="Submit Docket"
              saving={saving}
              disabled={selectedQty <= 0}
              onPress={() => void saveDelivery()}
            />
          }
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalContent}
          >
            <Pressable
              style={styles.towerSelector}
              onPress={openTowerSelector}
            >
              <View style={styles.towerSelectorIcon}>
                <Ionicons
                  name="business-outline"
                  size={20}
                  color="#1E3A8A"
                />
              </View>
              <View style={styles.towerSelectorText}>
                <Text style={styles.selectorLabel}>Tower</Text>
                <Text style={styles.towerSelectorValue}>
                  {addTowerId
                    ? getTowerLabel(towerMap[addTowerId])
                    : "Select tower"}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color="#64748B" />
            </Pressable>

            {!addTowerId ? (
              <Empty
                compact
                title="Select a tower first"
                text="The required bundle register will load after the tower is selected."
              />
            ) : loadingTower ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>
                  Loading tower bundle register…
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.summaryCard}>
                  <View style={styles.summaryTop}>
                    <View>
                      <Text style={styles.summaryLabel}>
                        DELIVERY PROGRESS
                      </Text>
                      <Text style={styles.summaryPercent}>
                        {addSummary.progress.toFixed(0)}%
                      </Text>
                    </View>
                    <Text style={styles.summaryFraction}>
                      {addSummary.delivered}/{addSummary.required}
                    </Text>
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${addSummary.progress}%` },
                      ]}
                    />
                  </View>

                  <View style={styles.statRow}>
                    <Stat label="Required" value={addSummary.required} />
                    <Stat label="Delivered" value={addSummary.delivered} />
                    <Stat
                      label="Remaining"
                      value={addSummary.remaining}
                      warning
                    />
                  </View>
                </View>

                <Field
                  label="Delivered By *"
                  value={deliveredBy}
                  onChangeText={setDeliveredBy}
                  placeholder="Driver / name"
                />

                <Field
                  label="Vehicle / Truck"
                  value={vehicle}
                  onChangeText={setVehicle}
                  placeholder="Rego / truck"
                  capitals
                />

                <SearchField
                  value={addSearch}
                  onChangeText={setAddSearch}
                  placeholder="Search bundle number or section…"
                />

                {visibleAddBundles.length === 0 ? (
                  <Empty
                    compact
                    title="No outstanding bundles"
                    text="This tower has no remaining bundles matching the search."
                  />
                ) : (
                  visibleAddBundles.map((bundle) => (
                    <BundleQtyCard
                      key={bundle.bundle_no}
                      bundle={bundle}
                      value={qtyMap[bundle.bundle_no] ?? 0}
                      onMinus={() => changeQty(bundle.bundle_no, -1)}
                      onPlus={() => changeQty(bundle.bundle_no, 1)}
                      onChangeText={(value) =>
                        updateQty(bundle.bundle_no, value)
                      }
                    />
                  ))
                )}
              </>
            )}
          </ScrollView>
        </DocketModal>

        <DocketModal
          visible={editVisible}
          title={
            editingDelivery
              ? `Edit ${getTowerLabel(
                  towerMap[editingDelivery.tower_id],
                )}`
              : "Edit Delivery"
          }
          onClose={closeEdit}
          footer={
            <ModalFooter
              label="Corrected Qty"
              value={editSelectedQty}
              buttonLabel="Save Changes"
              saving={savingEdit}
              disabled={editSelectedQty <= 0}
              onPress={() => void saveEdit()}
              blue
            />
          }
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalContent}
          >
            <View style={styles.notice}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color="#1D4ED8"
              />
              <Text style={styles.noticeText}>
                Correct the driver, truck, or quantities. Other dockets stay
                protected from over-delivery.
              </Text>
            </View>

            <Field
              label="Delivered By *"
              value={editDeliveredBy}
              onChangeText={setEditDeliveredBy}
              placeholder="Driver / name"
            />

            <Field
              label="Vehicle / Truck"
              value={editVehicle}
              onChangeText={setEditVehicle}
              placeholder="Rego / truck"
              capitals
            />

            <SearchField
              value={editSearch}
              onChangeText={setEditSearch}
              placeholder="Search bundle number or section…"
            />

            {loadingEdit ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>
                  Loading editable bundle register…
                </Text>
              </View>
            ) : (
              visibleEditBundles.map((bundle) => (
                <BundleQtyCard
                  key={bundle.bundle_no}
                  bundle={bundle}
                  value={editQtyMap[bundle.bundle_no] ?? 0}
                  otherDockets
                  onMinus={() => changeEditQty(bundle.bundle_no, -1)}
                  onPlus={() => changeEditQty(bundle.bundle_no, 1)}
                  onChangeText={(value) =>
                    updateEditQty(bundle.bundle_no, value)
                  }
                />
              ))
            )}

            {editingDelivery && (
              <Pressable
                style={styles.modalDelete}
                onPress={() => confirmDelete(editingDelivery)}
              >
                <Ionicons name="trash-outline" size={18} color="#BE123C" />
                <Text style={styles.modalDeleteText}>
                  Delete this docket
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </DocketModal>
      </View>
    </SafeAreaView>
  );
}

function TowerMetric({
  label,
  value,
  good,
  warning,
}: {
  label: string;
  value: number;
  good?: boolean;
  warning?: boolean;
}) {
  return (
    <View style={styles.towerMetric}>
      <Text
        style={[
          styles.towerMetricValue,
          good && styles.towerMetricGood,
          warning && styles.towerMetricWarning,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.towerMetricLabel}>{label}</Text>
    </View>
  );
}

function ProjectOverviewStat({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <View style={styles.projectOverviewStat}>
      <Text
        style={[
          styles.projectOverviewStatValue,
          warning && value > 0 && styles.projectOverviewStatWarning,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.projectOverviewStatLabel}>{label}</Text>
    </View>
  );
}

function BundleStatusSection({
  title,
  count,
  bundles,
  emptyText,
  outstanding,
}: {
  title: string;
  count: number;
  bundles: BundleStatus[];
  emptyText: string;
  outstanding?: boolean;
}) {
  return (
    <View style={styles.bundleStatusSection}>
      <View style={styles.bundleStatusSectionHeader}>
        <Text style={styles.bundleStatusSectionTitle}>{title}</Text>
        <View
          style={[
            styles.bundleStatusCount,
            outstanding && styles.bundleStatusCountOutstanding,
          ]}
        >
          <Text
            style={[
              styles.bundleStatusCountText,
              outstanding && styles.bundleStatusCountTextOutstanding,
            ]}
          >
            {count}
          </Text>
        </View>
      </View>

      {bundles.length === 0 ? (
        <Text style={styles.bundleStatusEmpty}>{emptyText}</Text>
      ) : (
        bundles.map((bundle) => (
          <View
            key={`${title}-${bundle.bundle_no}`}
            style={styles.bundleStatusRow}
          >
            <View style={styles.bundleStatusText}>
              <Text style={styles.bundleStatusBundleNo}>
                {bundle.bundle_no}
              </Text>
              <Text style={styles.bundleStatusSectionText}>
                {bundle.section}
              </Text>
            </View>

            <View style={styles.bundleStatusNumbers}>
              <Text style={styles.bundleStatusDelivered}>
                {bundle.delivered}/{bundle.required}
              </Text>
              <Text
                style={[
                  styles.bundleStatusRemaining,
                  bundle.remaining <= 0 &&
                    styles.bundleStatusRemainingComplete,
                ]}
              >
                {bundle.remaining <= 0
                  ? "Complete"
                  : `${bundle.remaining} remaining`}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#2563EB" />
      <Text style={styles.loadingText}>{text}</Text>
    </View>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaBlock}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  capitals,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  capitals?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.fieldInput}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        autoCapitalize={capitals ? "characters" : "words"}
      />
    </View>
  );
}

function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.bundleSearch}>
      <Ionicons name="search" size={18} color="#64748B" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.bundleSearchInput}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText("")}>
          <Ionicons name="close-circle" size={18} color="#94A3B8" />
        </Pressable>
      )}
    </View>
  );
}

function BundleQtyCard({
  bundle,
  value,
  otherDockets,
  onMinus,
  onPlus,
  onChangeText,
}: {
  bundle: BundleStatus;
  value: number;
  otherDockets?: boolean;
  onMinus: () => void;
  onPlus: () => void;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={styles.bundleCard}>
      <View style={styles.bundleTop}>
        <View style={styles.bundleText}>
          <Text style={styles.bundleNo}>{bundle.bundle_no}</Text>
          <Text style={styles.bundleSection}>{bundle.section}</Text>
        </View>

        <View style={styles.remainingBadge}>
          <Text style={styles.remainingValue}>{bundle.remaining}</Text>
          <Text style={styles.remainingLabel}>
            {otherDockets ? "Max" : "Remaining"}
          </Text>
        </View>
      </View>

      <View style={styles.bundleStats}>
        <LightStat label="Required" value={bundle.required} />
        <LightStat
          label={otherDockets ? "Other dockets" : "Delivered"}
          value={bundle.delivered}
        />
        <LightStat label="Available" value={bundle.remaining} warning />
      </View>

      <View style={styles.quantityRow}>
        <Pressable
          style={styles.minusButton}
          disabled={value <= 0}
          onPress={onMinus}
        >
          <Ionicons
            name="remove"
            size={22}
            color={value <= 0 ? "#94A3B8" : "#0F172A"}
          />
        </Pressable>

        <TextInput
          value={value > 0 ? String(value) : ""}
          onChangeText={onChangeText}
          style={styles.quantityInput}
          placeholder="0"
          placeholderTextColor="#94A3B8"
          keyboardType="number-pad"
          textAlign="center"
        />

        <Pressable
          style={[
            styles.plusButton,
            value >= bundle.remaining && styles.plusDisabled,
          ]}
          disabled={value >= bundle.remaining}
          onPress={onPlus}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

function LightStat({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <View style={styles.lightStat}>
      <Text
        style={[
          styles.lightStatValue,
          warning && styles.warningText,
        ]}
      >
        {value}
      </Text>
      <Text style={styles.lightStatLabel}>{label}</Text>
    </View>
  );
}

function Stat({
  label,
  value,
  warning,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, warning && styles.warningText]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Empty({
  title,
  text,
  compact,
}: {
  title: string;
  text: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.empty, compact && styles.emptyCompact]}>
      <View style={styles.emptyIcon}>
        <Ionicons name="file-tray-outline" size={28} color="#64748B" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function ModalFooter({
  label,
  value,
  helper,
  buttonLabel,
  saving,
  disabled,
  onPress,
  blue,
}: {
  label: string;
  value: number;
  helper?: string;
  buttonLabel: string;
  saving: boolean;
  disabled: boolean;
  onPress: () => void;
  blue?: boolean;
}) {
  return (
    <View style={styles.modalFooter}>
      <View>
        <Text style={styles.footerLabel}>{label}</Text>
        <Text style={styles.footerValue}>{value}</Text>
        {helper ? <Text style={styles.footerHelper}>{helper}</Text> : null}
      </View>

      <Pressable
        style={[
          styles.submitButton,
          blue && styles.blueButton,
          (saving || disabled) && styles.disabledButton,
        ]}
        disabled={saving || disabled}
        onPress={onPress}
      >
        {saving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons
              name={blue ? "save-outline" : "checkmark-circle-outline"}
              size={19}
              color="#FFFFFF"
            />
            <Text style={styles.submitText}>{buttonLabel}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

function DocketModal({
  visible,
  title,
  onClose,
  footer,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalSafe}>
        <KeyboardAvoidingView
          style={styles.modalScreen}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalClose} onPress={onClose}>
              <Ionicons name="close" size={22} color="#334155" />
            </Pressable>
            <Text numberOfLines={1} style={styles.modalTitle}>
              {title}
            </Text>
            <View style={styles.modalSpacer} />
          </View>

          <View style={styles.modalBody}>{children}</View>
          {footer}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function OptionSelector({
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
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return options;

    return options.filter((option) =>
      matchesText(option.label, option.subtitle).includes(value),
    );
  }, [options, query]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable style={styles.sheetClose} onPress={onClose}>
              <Ionicons name="close" size={21} color="#334155" />
            </Pressable>
          </View>

          {options.length > 8 && (
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Search…"
            />
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.sheetList}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.sheetOption,
                  pressed && styles.sheetOptionPressed,
                ]}
                onPress={() => onSelect(item)}
              >
                <View style={styles.sheetOptionText}>
                  <Text style={styles.sheetOptionLabel}>{item.label}</Text>
                  {item.subtitle ? (
                    <Text style={styles.sheetOptionSubtitle}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="#94A3B8"
                />
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F8FAFC" },
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },
  header: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    padding: 12,
  },
  headerTop: { flexDirection: "row", alignItems: "center" },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, marginLeft: 10 },
  pageTitle: { color: "#0F172A", fontSize: 20, fontWeight: "900" },
  pageSubtitle: { color: "#64748B", fontSize: 11, marginTop: 2 },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  projectContext: {
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 11,
    paddingVertical: 8,
    marginTop: 9,
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
  selectorLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
  },

  toolbar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    padding: 10,
    gap: 7,
  },
  searchBox: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 11,
  },
  searchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  addButton: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    marginLeft: 6,
  },
  viewTabs: {
    flexDirection: "row",
    gap: 7,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 10,
    paddingBottom: 9,
  },
  viewTab: {
    flex: 1,
    minHeight: 43,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  viewTabActive: { backgroundColor: "#0F172A" },
  viewTabText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 5,
  },
  viewTabTextActive: { color: "#FFFFFF" },
  viewTabCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
    paddingHorizontal: 5,
  },
  viewTabCountActive: { backgroundColor: "#334155" },
  viewTabCountText: {
    color: "#475569",
    fontSize: 9,
    fontWeight: "900",
  },
  viewTabCountTextActive: { color: "#FFFFFF" },
  projectOverviewCard: {
    borderRadius: 17,
    backgroundColor: "#0F172A",
    padding: 14,
    marginBottom: 10,
  },
  projectOverviewTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  projectOverviewEyebrow: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  projectOverviewPercent: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "900",
    marginTop: 2,
  },
  projectOverviewFraction: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  projectOverviewTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#334155",
    overflow: "hidden",
    marginTop: 11,
  },
  projectOverviewFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },
  projectOverviewStats: {
    flexDirection: "row",
    marginTop: 12,
  },
  projectOverviewStat: {
    flex: 1,
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#334155",
  },
  projectOverviewStatValue: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  projectOverviewStatWarning: { color: "#FDA4AF" },
  projectOverviewStatLabel: {
    color: "#94A3B8",
    fontSize: 8,
    fontWeight: "700",
    textAlign: "center",
    textTransform: "uppercase",
    marginTop: 2,
  },
  towerStatusCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    marginBottom: 9,
  },
  towerStatusCardComplete: {
    borderColor: "#BBF7D0",
    backgroundColor: "#FCFFFD",
  },
  towerStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  towerStatusIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  towerStatusIconComplete: { backgroundColor: "#DCFCE7" },
  towerStatusTitleWrap: { flex: 1, marginLeft: 10 },
  towerStatusTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
  },
  towerStatusSubtitle: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 2,
  },
  towerProgressBadge: {
    minWidth: 48,
    borderRadius: 11,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 6,
    marginRight: 7,
  },
  towerProgressBadgeComplete: { backgroundColor: "#DCFCE7" },
  towerProgressBadgeText: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900",
  },
  towerProgressBadgeTextComplete: { color: "#15803D" },
  towerProgressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
    marginTop: 10,
  },
  towerProgressFill: { height: "100%", borderRadius: 999 },
  towerMetricRow: {
    flexDirection: "row",
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    paddingVertical: 9,
    marginTop: 9,
  },
  towerMetric: { flex: 1, alignItems: "center" },
  towerMetricValue: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "900",
  },
  towerMetricGood: { color: "#15803D" },
  towerMetricWarning: { color: "#BE123C" },
  towerMetricLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 2,
  },
  towerCountRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
  },
  towerCountChip: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    paddingVertical: 7,
  },
  towerCountChipValue: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "900",
  },
  towerCountChipWarning: { color: "#BE123C" },
  towerCountChipLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 1,
  },
  towerQuickActions: {
    flexDirection: "row",
    gap: 7,
    marginTop: 9,
  },
  towerAddButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  towerAddButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 5,
  },
  towerHistoryButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  towerHistoryButtonText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 5,
  },
  towerExpanded: {
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    marginTop: 11,
    paddingTop: 10,
  },
  bundleStatusSection: { marginBottom: 11 },
  bundleStatusSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  bundleStatusSectionTitle: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  bundleStatusCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  bundleStatusCountOutstanding: { backgroundColor: "#FFE4E6" },
  bundleStatusCountText: {
    color: "#15803D",
    fontSize: 10,
    fontWeight: "900",
  },
  bundleStatusCountTextOutstanding: { color: "#BE123C" },
  bundleStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 5,
  },
  bundleStatusText: { flex: 1 },
  bundleStatusBundleNo: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
  },
  bundleStatusSectionText: {
    color: "#64748B",
    fontSize: 9,
    marginTop: 1,
  },
  bundleStatusNumbers: { alignItems: "flex-end" },
  bundleStatusDelivered: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
  },
  bundleStatusRemaining: {
    color: "#BE123C",
    fontSize: 9,
    fontWeight: "800",
    marginTop: 2,
  },
  bundleStatusRemainingComplete: { color: "#15803D" },
  bundleStatusEmpty: {
    color: "#64748B",
    fontSize: 10,
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
  },
  historyHeaderCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 11,
    marginBottom: 9,
  },
  historyHeaderIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  historyHeaderText: { flex: 1, marginLeft: 9 },
  historyHeaderTitle: {
    color: "#1E3A8A",
    fontSize: 13,
    fontWeight: "900",
  },
  historyHeaderSubtitle: {
    color: "#1D4ED8",
    fontSize: 9,
    lineHeight: 14,
    marginTop: 2,
  },
  listContent: { padding: 12, paddingBottom: 100 },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 9,
  },
  listTitle: { color: "#0F172A", fontSize: 16, fontWeight: "900" },
  listSubtitle: { color: "#64748B", fontSize: 10, marginTop: 2 },
  countBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: "#334155", fontSize: 12, fontWeight: "900" },
  deliveryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 13,
    marginBottom: 9,
  },
  deliveryHeader: { flexDirection: "row", alignItems: "center" },
  towerIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryTitleWrap: { flex: 1, marginLeft: 10 },
  deliveryTower: { color: "#0F172A", fontSize: 16, fontWeight: "900" },
  deliveryDate: { color: "#64748B", fontSize: 10, marginTop: 2 },
  qtyBadge: {
    minWidth: 48,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    padding: 7,
  },
  qtyBadgeValue: { color: "#0F172A", fontSize: 16, fontWeight: "900" },
  qtyBadgeLabel: { color: "#64748B", fontSize: 9, fontWeight: "700" },
  metaRow: { flexDirection: "row", gap: 7, marginTop: 11 },
  metaBlock: {
    flex: 1,
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    padding: 9,
  },
  metaLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 10 },
  itemChip: {
    borderRadius: 999,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  itemChipText: { color: "#1E40AF", fontSize: 10, fontWeight: "800" },
  actionRow: { flexDirection: "row", gap: 7, marginTop: 12 },
  editButton: {
    flex: 1,
    minHeight: 41,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  editButtonText: {
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 5,
  },
  deleteButton: {
    minWidth: 92,
    minHeight: 41,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  deleteButtonText: {
    color: "#BE123C",
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 5,
  },
  modalSafe: { flex: 1, backgroundColor: "#F8FAFC" },
  modalScreen: { flex: 1, backgroundColor: "#F8FAFC" },
  modalHeader: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  modalClose: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
    marginHorizontal: 8,
  },
  modalSpacer: { width: 40 },
  modalBody: { flex: 1 },
  modalContent: { padding: 12, paddingBottom: 28 },
  modalFooter: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  footerLabel: {
    color: "#64748B",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  footerValue: { color: "#0F172A", fontSize: 22, fontWeight: "900" },
  footerHelper: { color: "#64748B", fontSize: 9 },
  submitButton: {
    minWidth: 155,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  blueButton: { backgroundColor: "#2563EB" },
  disabledButton: { opacity: 0.45 },
  submitText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 6,
  },
  towerSelector: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  towerSelectorIcon: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  towerSelectorText: { flex: 1, marginLeft: 10 },
  towerSelectorValue: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  summaryCard: {
    borderRadius: 16,
    backgroundColor: "#0F172A",
    padding: 14,
    marginBottom: 10,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryLabel: {
    color: "#94A3B8",
    fontSize: 9,
    fontWeight: "800",
  },
  summaryPercent: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    marginTop: 2,
  },
  summaryFraction: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    backgroundColor: "#334155",
    overflow: "hidden",
    marginTop: 11,
  },
  progressFill: { height: "100%", backgroundColor: "#22C55E" },
  statRow: { flexDirection: "row", marginTop: 12 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  statLabel: {
    color: "#94A3B8",
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 2,
  },
  field: { marginBottom: 9 },
  fieldLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 5,
  },
  fieldInput: {
    minHeight: 47,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    color: "#0F172A",
    fontSize: 13,
    paddingHorizontal: 12,
  },
  bundleSearch: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 11,
    marginBottom: 9,
  },
  bundleSearchInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 13,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  bundleCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    padding: 12,
    marginBottom: 8,
  },
  bundleTop: { flexDirection: "row", alignItems: "center" },
  bundleText: { flex: 1 },
  bundleNo: { color: "#0F172A", fontSize: 16, fontWeight: "900" },
  bundleSection: { color: "#64748B", fontSize: 10, marginTop: 2 },
  remainingBadge: {
    minWidth: 58,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
    alignItems: "center",
    padding: 7,
  },
  remainingValue: { color: "#92400E", fontSize: 16, fontWeight: "900" },
  remainingLabel: {
    color: "#92400E",
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  bundleStats: {
    flexDirection: "row",
    borderRadius: 11,
    backgroundColor: "#F8FAFC",
    paddingVertical: 8,
    marginTop: 9,
  },
  lightStat: { flex: 1, alignItems: "center" },
  lightStatValue: { color: "#0F172A", fontSize: 14, fontWeight: "900" },
  lightStatLabel: {
    color: "#64748B",
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 2,
  },
  warningText: { color: "#D97706" },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 13,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 6,
    marginTop: 9,
  },
  minusButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  quantityInput: {
    flex: 1,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
    paddingVertical: 8,
    marginHorizontal: 6,
  },
  plusButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
  plusDisabled: { backgroundColor: "#94A3B8" },
  notice: {
    flexDirection: "row",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 11,
    marginBottom: 10,
  },
  noticeText: {
    flex: 1,
    color: "#1E40AF",
    fontSize: 11,
    lineHeight: 17,
    marginLeft: 8,
  },
  modalDelete: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#FECDD3",
    backgroundColor: "#FFF1F2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  modalDeleteText: {
    color: "#BE123C",
    fontSize: 12,
    fontWeight: "900",
    marginLeft: 6,
  },
  modalLoading: { alignItems: "center", paddingVertical: 45 },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 52,
  },
  emptyCompact: { paddingVertical: 28 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
  },
  emptyText: {
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 5,
  },
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.48)",
  },
  sheet: {
    maxHeight: "80%",
    minHeight: 300,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 9,
  },
  sheetHandle: {
    width: 42,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    alignSelf: "center",
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  sheetTitle: {
    flex: 1,
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },
  sheetClose: {
    width: 39,
    height: 39,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetList: { paddingHorizontal: 13, paddingBottom: 35 },
  sheetOption: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 5,
  },
  sheetOptionPressed: { backgroundColor: "#F8FAFC" },
  sheetOptionText: { flex: 1 },
  sheetOptionLabel: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "800",
  },
  sheetOptionSubtitle: { color: "#64748B", fontSize: 10, marginTop: 3 },
});

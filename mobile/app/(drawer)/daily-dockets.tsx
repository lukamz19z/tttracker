import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PermissionScreen } from "@/components/common/PermissionScreen";
import { DailyDocketEditorFoundation } from "@/components/dockets/DailyDocketEditorFoundation";
import { useAuth } from "@/contexts/AuthContext";
import {
  getDailyDocketEditor,
  saveDailyDocket,
  submitDailyDocketForBc,
} from "@/lib/api/daily-dockets";
import {
  DAILY_DOCKET_STEPS,
  type DailyDocketStep,
} from "@/lib/dockets/constants";
import { formatDocketDate } from "@/lib/dockets/dates";
import {
  calculateLabourTotals,
  toNumber,
} from "@/lib/dockets/calculations";
import { supabase } from "@/lib/supabase";
import type {
  DailyDocketDraft,
  DailyDocketEditorPayload,
} from "@/types/daily-dockets";

type ProfileRecord = {
  projectId?: string | null;
  projectName?: string | null;
  projectNumber?: string | null;
  full_name?: string | null;
  email?: string | null;
};

type TowerRow = {
  id: string;
  project_id: string;
  name: string | null;
  line: string | null;
  status: string | null;
  progress: number | null;
  extra_data: Record<string, unknown> | null;
};

type DocketListRow = {
  id: string;
  project_id: string;
  tower_id: string;
  docket_date: string | null;
  crew: string | null;
  leading_hand: string | null;
  approval_status: string | null;
  approval_revision: number | null;
  assembly_percent: number | null;
  erection_percent: number | null;
  raw_manhours: number | null;
  production_manhours: number | null;
  incident_occurred: boolean | null;
  incident_type: string | null;
  created_at?: string | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function localDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function prettyDate(value: unknown) {
  return formatDocketDate(value) || "No date";
}

function towerName(tower: TowerRow) {
  const extra = tower.extra_data ?? {};

  return (
    clean(tower.name) ||
    clean(extra.tower_number) ||
    clean(extra.structure_number) ||
    clean(extra.tower_no) ||
    "Unnamed Tower"
  );
}

function naturalTowerSort(a: TowerRow, b: TowerRow) {
  return towerName(a).localeCompare(towerName(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function isLockedStatus(value: unknown) {
  return [
    "submitted_bc",
    "client_pending",
    "final",
    "legacy_final",
  ].includes(clean(value));
}

function approvalLabel(value: unknown) {
  switch (clean(value)) {
    case "submitted_bc":
      return "Pending BC Approval";
    case "client_pending":
      return "Pending Client Approval";
    case "bc_changes_requested":
    case "client_changes_requested":
      return "Changes Required";
    case "final":
    case "legacy_final":
      return "Approved";
    case "legacy":
      return "In Progress";
    case "draft":
    default:
      return "Draft";
  }
}

function statusTone(value: unknown) {
  switch (clean(value)) {
    case "final":
    case "legacy_final":
      return {
        background: "#dcfce7",
        text: "#166534",
      };
    case "submitted_bc":
    case "client_pending":
      return {
        background: "#dbeafe",
        text: "#1d4ed8",
      };
    case "bc_changes_requested":
    case "client_changes_requested":
      return {
        background: "#ffedd5",
        text: "#9a3412",
      };
    default:
      return {
        background: "#f1f5f9",
        text: "#475569",
      };
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return clean(error) || "Unknown error";
}

function validateDraft(
  draft: DailyDocketDraft,
  forSubmit: boolean,
) {
  if (!clean(draft.docketDate)) {
    return "Enter the Daily Docket date.";
  }

  if (!clean(draft.leadingHand)) {
    return "Enter the Leading Hand.";
  }

  const workerNames = draft.labourRows
    .map((row) => clean(row.worker_name).toLowerCase())
    .filter(Boolean);

  if (new Set(workerNames).size !== workerNames.length) {
    return "Each worker can only appear once on the Daily Docket.";
  }

  const revisionMh = draft.towerRevisionAllocations.reduce(
    (sum, row) =>
      sum + Math.max(0, num(row.hours)) * row.worker_names.length,
    0,
  );

  const productionMh = calculateLabourTotals(
    draft.labourRows,
    draft.delayRows,
    {
      enabled: draft.mobilisation.enabled,
      durationMinutes:
        Math.max(0, toNumber(draft.mobilisationHours)) * 60,
      workerNames: draft.mobilisation.worker_names,
    },
  ).productionManhours;

  if (revisionMh > productionMh + 0.0001) {
    return "Revision / rectification MH cannot exceed Production MH.";
  }

  const additional = draft.additionalTowerWork.filter(
    (row) => clean(row.target_tower_id),
  );

  const seenTowers = new Set<string>();
  let additionalPercent = 0;

  for (const row of additional) {
    const target = clean(row.target_tower_id);

    if (target === draft.towerId) {
      return "An additional tower cannot be the primary tower.";
    }

    if (seenTowers.has(target)) {
      return "The same additional tower cannot be entered twice.";
    }

    seenTowers.add(target);

    const share = num(row.allocation_percent);
    if (share <= 0) {
      return "Each additional tower needs a production allocation greater than 0%.";
    }

    additionalPercent += share;
  }

  if (additionalPercent > 100.01) {
    return "Additional tower production allocation cannot exceed 100%.";
  }

  for (const transfer of draft.bundleTransfers) {
    if (
      !clean(transfer.source_tower_id) ||
      !clean(transfer.source_bundle_id) ||
      !clean(transfer.destination_bundle_id) ||
      num(transfer.quantity) <= 0
    ) {
      return "Complete each bundle transfer before saving the Daily Docket.";
    }
  }

  if (forSubmit) {
    if (draft.labourRows.filter((row) => clean(row.worker_name)).length === 0) {
      return "Add at least one worker before submitting the Daily Docket.";
    }

    if (!clean(draft.bcRepName) || !clean(draft.bcRepUserId)) {
      return "The logged-in BC representative could not be identified.";
    }

    if (!clean(draft.bcSignatureDataUrl)) {
      return "Capture the BC representative signature before submitting.";
    }
  }

  return "";
}

export default function DailyDocketScreen() {
  const routeParams = useLocalSearchParams<{
    projectId?: string | string[];
    towerId?: string | string[];
    docketId?: string | string[];
    source?: string | string[];
  }>();

  const routeProjectId = clean(firstParam(routeParams.projectId));
  const routeTowerId = clean(firstParam(routeParams.towerId));
  const routeDocketId = clean(firstParam(routeParams.docketId));
  const routeSource = clean(firstParam(routeParams.source));

  const { profile } = useAuth();
  const userProfile = profile as unknown as ProfileRecord | null;

  const projectId =
    routeProjectId || clean(userProfile?.projectId);
  const projectName = clean(userProfile?.projectName);
  const projectNumber = clean(userProfile?.projectNumber);

  const [towers, setTowers] = useState<TowerRow[]>([]);
  const [dockets, setDockets] = useState<DocketListRow[]>([]);
  const [selectedTowerId, setSelectedTowerId] = useState(
    routeTowerId,
  );
  const [towerPickerOpen, setTowerPickerOpen] = useState(false);
  const [towerSearch, setTowerSearch] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copyingPrevious, setCopyingPrevious] = useState(false);

  const [editorPayload, setEditorPayload] =
    useState<DailyDocketEditorPayload | null>(null);
  const [draft, setDraft] = useState<DailyDocketDraft | null>(null);
  const [step, setStep] = useState<DailyDocketStep>("setup");

  const directRouteHandled = useRef(false);

  const loadList = useCallback(
    async (silent = false) => {
      if (!projectId) {
        setTowers([]);
        setDockets([]);
        if (!silent) setLoading(false);
        return;
      }

      if (!silent) setLoading(true);

      try {
        const [towerResult, docketResult] = await Promise.all([
          supabase
            .from("towers")
            .select(
              "id,project_id,name,line,status,progress,extra_data",
            )
            .eq("project_id", projectId),
          supabase
            .from("tower_daily_dockets")
            .select(
              "id,project_id,tower_id,docket_date,crew,leading_hand,approval_status,approval_revision,assembly_percent,erection_percent,raw_manhours,production_manhours,incident_occurred,incident_type,created_at",
            )
            .eq("project_id", projectId)
            .order("docket_date", { ascending: false }),
        ]);

        if (towerResult.error) throw towerResult.error;
        if (docketResult.error) throw docketResult.error;

        const nextTowers = ((towerResult.data ?? []) as TowerRow[]).sort(
          naturalTowerSort,
        );

        setTowers(nextTowers);
        setDockets((docketResult.data ?? []) as DocketListRow[]);

        setSelectedTowerId((current) => {
          if (
            current &&
            nextTowers.some((tower) => tower.id === current)
          ) {
            return current;
          }

          if (
            routeTowerId &&
            nextTowers.some((tower) => tower.id === routeTowerId)
          ) {
            return routeTowerId;
          }

          return nextTowers[0]?.id || "";
        });
      } catch (error) {
        Alert.alert("Could not load Daily Dockets", errorMessage(error));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [projectId, routeTowerId],
  );

  useEffect(() => {
    directRouteHandled.current = false;
    setSearch("");
    setEditorPayload(null);
    setDraft(null);
    void loadList();
  }, [loadList, projectId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadList(true);
    setRefreshing(false);
  }, [loadList]);

  const openEditor = useCallback(
    async (args: {
      towerId: string;
      docketId?: string;
      mode: "create" | "edit" | "view";
    }) => {
      if (!projectId || !args.towerId || editorLoading) return;

      setEditorLoading(true);

      try {
        const payload = await getDailyDocketEditor({
          projectId,
          towerId: args.towerId,
          docketId: args.docketId || null,
        });

        const nextDraft: DailyDocketDraft = {
          ...payload.draft,
          mode: args.mode,
          bcRepName:
            clean(payload.draft.bcRepName) || payload.identity.name,
          bcRepEmail:
            clean(payload.draft.bcRepEmail) || payload.identity.email,
          bcRepUserId:
            clean(payload.draft.bcRepUserId) || payload.identity.userId,
        };

        setEditorPayload(payload);
        setDraft(nextDraft);
        setStep("setup");
      } catch (error) {
        Alert.alert(
          "Daily Docket could not be opened",
          errorMessage(error),
        );
      } finally {
        setEditorLoading(false);
      }
    },
    [editorLoading, projectId],
  );

  useEffect(() => {
    if (
      directRouteHandled.current ||
      loading ||
      !projectId ||
      !routeTowerId ||
      !towers.some((tower) => tower.id === routeTowerId)
    ) {
      return;
    }

    directRouteHandled.current = true;
    setSelectedTowerId(routeTowerId);

    if (routeDocketId) {
      const row = dockets.find((item) => item.id === routeDocketId);
      const reviewLink = /review|approval/i.test(routeSource);
      const mode =
        reviewLink || isLockedStatus(row?.approval_status)
          ? "view"
          : "edit";

      void openEditor({
        towerId: routeTowerId,
        docketId: routeDocketId,
        mode,
      });
    } else if (/create|new/i.test(routeSource)) {
      void openEditor({
        towerId: routeTowerId,
        mode: "create",
      });
    }
  }, [
    dockets,
    loading,
    openEditor,
    projectId,
    routeDocketId,
    routeSource,
    routeTowerId,
    towers,
  ]);

  const selectedTower = towers.find(
    (tower) => tower.id === selectedTowerId,
  );

  const visibleDockets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return dockets.filter((docket) => {
      if (docket.tower_id !== selectedTowerId) return false;
      if (!query) return true;

      return [
        docket.docket_date,
        docket.leading_hand,
        docket.crew,
        approvalLabel(docket.approval_status),
      ]
        .map(clean)
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [dockets, search, selectedTowerId]);

  const towerDockets = useMemo(
    () => dockets.filter((docket) => docket.tower_id === selectedTowerId),
    [dockets, selectedTowerId],
  );

  const summary = useMemo(
    () => ({
      count: towerDockets.length,
      raw: towerDockets.reduce(
        (sum, docket) => sum + Math.max(0, num(docket.raw_manhours)),
        0,
      ),
      production: towerDockets.reduce(
        (sum, docket) =>
          sum + Math.max(0, num(docket.production_manhours)),
        0,
      ),
      pending: towerDockets.filter((docket) =>
        ["submitted_bc", "client_pending"].includes(
          clean(docket.approval_status),
        ),
      ).length,
    }),
    [towerDockets],
  );

  const filteredTowers = useMemo(() => {
    const query = towerSearch.trim().toLowerCase();
    if (!query) return towers;

    return towers.filter((tower) =>
      [towerName(tower), tower.line]
        .map(clean)
        .some((value) => value.toLowerCase().includes(query)),
    );
  }, [towerSearch, towers]);

  const copyPrevious = async () => {
    if (!draft || !projectId || copyingPrevious) return;

    setCopyingPrevious(true);

    try {
      const payload = await getDailyDocketEditor({
        projectId,
        towerId: draft.towerId,
        docketDate: draft.docketDate || localDate(),
        copyPrevious: true,
      });

      const nextDraft: DailyDocketDraft = {
        ...payload.draft,
        mode: "create",
        bcRepName: payload.identity.name,
        bcRepEmail: payload.identity.email,
        bcRepUserId: payload.identity.userId,
      };

      setEditorPayload(payload);
      setDraft(nextDraft);
      setStep("setup");

      Alert.alert(
        "Previous Daily Docket loaded",
        "Crew, production defaults, plant and tower progress were carried forward. Delays, site events, Defects and signatures were reset.",
      );
    } catch (error) {
      Alert.alert(
        "Could not copy previous Daily Docket",
        errorMessage(error),
      );
    } finally {
      setCopyingPrevious(false);
    }
  };

  const saveDraft = async (showAlert = true) => {
    if (!draft || !editorPayload || saving) return null;

    const validation = validateDraft(draft, false);
    if (validation) {
      Alert.alert("Check Daily Docket", validation);
      return null;
    }

    setSaving(true);

    try {
      const result = await saveDailyDocket({
        ...draft,
        bcRepName:
          clean(draft.bcRepName) || editorPayload.identity.name,
        bcRepEmail:
          clean(draft.bcRepEmail) || editorPayload.identity.email,
        bcRepUserId:
          clean(draft.bcRepUserId) || editorPayload.identity.userId,
      });

      // Saving a draft is treated as completing the current docket action.
      // Refresh the register and close the editor instead of immediately
      // reopening the saved docket in Edit mode.
      setSelectedTowerId(draft.towerId);
      await loadList(true);
      setEditorPayload(null);
      setDraft(null);
      setStep("setup");

      if (showAlert) {
        Alert.alert(
          "Draft saved",
          `Raw ${result.rawManhours.toFixed(2)} MH · Production ${result.productionManhours.toFixed(2)} MH`,
        );
      }

      return result.docketId;
    } catch (error) {
      Alert.alert("Daily Docket could not be saved", errorMessage(error));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!draft || !editorPayload || submitting || saving) return;

    const validation = validateDraft(draft, true);
    if (validation) {
      Alert.alert("Check Daily Docket", validation);
      return;
    }

    Alert.alert(
      "Submit Daily Docket?",
      "This submits the signed docket into the BC approval workflow. It will be locked from normal editing after submission.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Submit",
          onPress: () => {
            void (async () => {
              setSubmitting(true);

              try {
                const saveResult = await saveDailyDocket({
                  ...draft,
                  bcRepName: editorPayload.identity.name,
                  bcRepEmail: editorPayload.identity.email,
                  bcRepUserId: editorPayload.identity.userId,
                  bcSignedAt:
                    clean(draft.bcSignedAt) || new Date().toISOString(),
                });

                const submitted = await submitDailyDocketForBc(
                  saveResult.docketId,
                );

                await loadList(true);
                setEditorPayload(null);
                setDraft(null);
                setStep("setup");

                Alert.alert(
                  "Daily Docket submitted",
                  [
                    `Revision R${String(submitted.revision).padStart(2, "0")} submitted for BC approval.`,
                    submitted.reviewers
                      ? `${submitted.reviewers} reviewer${submitted.reviewers === 1 ? "" : "s"} notified.`
                      : "",
                    submitted.warning || "",
                  ]
                    .filter(Boolean)
                    .join("\n\n"),
                );
              } catch (error) {
                Alert.alert(
                  "Daily Docket could not be submitted",
                  errorMessage(error),
                );
              } finally {
                setSubmitting(false);
              }
            })();
          },
        },
      ],
    );
  };

  const closeEditor = () => {
    if (saving || submitting) return;

    setEditorPayload(null);
    setDraft(null);
    setStep("setup");
  };

  const editorLocked = Boolean(
    draft &&
      (draft.mode === "view" || isLockedStatus(draft.approvalStatus)),
  );

  if (loading) {
    return (
      <PermissionScreen permission="mobile.daily_dockets">
        <SafeAreaView style={styles.safe}>
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading Daily Dockets…</Text>
          </View>
        </SafeAreaView>
      </PermissionScreen>
    );
  }

  return (
    <PermissionScreen permission="mobile.daily_dockets">
      <SafeAreaView style={styles.safe}>
        <View style={styles.screen}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>OPERATIONS</Text>
              <Text style={styles.title}>Daily Dockets</Text>
              <Text style={styles.subtitle}>
                {projectNumber
                  ? `${projectNumber}${projectName ? ` · ${projectName}` : ""}`
                  : projectName || "No project selected"}
              </Text>
            </View>

            <Pressable
              disabled={!projectId || !selectedTowerId || editorLoading}
              onPress={() =>
                void openEditor({
                  towerId: selectedTowerId,
                  mode: "create",
                })
              }
              style={[
                styles.addButton,
                (!projectId || !selectedTowerId || editorLoading) &&
                  styles.disabled,
              ]}
            >
              {editorLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="add" size={22} color="#fff" />
              )}
            </Pressable>
          </View>

          {!projectId ? (
            <EmptyState
              icon="folder-open-outline"
              title="No project selected"
              body="Select a project from Home before opening Daily Dockets."
            />
          ) : (
            <FlatList
              data={visibleDockets}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const tone = statusTone(item.approval_status);
                const overall =
                  num(item.assembly_percent) * 0.5 +
                  num(item.erection_percent) * 0.5;
                const locked = isLockedStatus(item.approval_status);

                return (
                  <View style={styles.docketCard}>
                    <Pressable
                      onPress={() =>
                        void openEditor({
                          towerId: item.tower_id,
                          docketId: item.id,
                          mode: locked ? "view" : "edit",
                        })
                      }
                    >
                      <View style={styles.docketTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.docketDate}>
                            {prettyDate(item.docket_date)}
                          </Text>
                          <Text style={styles.docketMeta}>
                            {item.leading_hand || "No Leading Hand"}
                            {item.crew ? ` · ${item.crew}` : ""}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.status,
                            { backgroundColor: tone.background },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              { color: tone.text },
                            ]}
                          >
                            {approvalLabel(item.approval_status)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.progressBlock}>
                        <View style={styles.progressLabels}>
                          <Text style={styles.progressLabel}>Progress</Text>
                          <Text style={styles.progressValue}>
                            {overall.toFixed(1)}%
                          </Text>
                        </View>
                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${Math.max(
                                  0,
                                  Math.min(100, overall),
                                )}%`,
                              },
                            ]}
                          />
                        </View>
                      </View>

                      <View style={styles.cardMetrics}>
                        <MiniMetric
                          label="Raw MH"
                          value={num(item.raw_manhours).toFixed(1)}
                        />
                        <MiniMetric
                          label="Prod MH"
                          value={num(item.production_manhours).toFixed(1)}
                        />
                        <MiniMetric
                          label="Revision"
                          value={`R${String(
                            Math.max(0, num(item.approval_revision)),
                          ).padStart(2, "0")}`}
                        />
                        <MiniMetric
                          label="Safety"
                          value={item.incident_occurred ? "Yes" : "—"}
                        />
                      </View>
                    </Pressable>

                    <View style={styles.cardActions}>
                      <Pressable
                        onPress={() =>
                          void openEditor({
                            towerId: item.tower_id,
                            docketId: item.id,
                            mode: "view",
                          })
                        }
                        style={styles.secondaryAction}
                      >
                        <Ionicons
                          name="eye-outline"
                          size={17}
                          color="#334155"
                        />
                        <Text style={styles.secondaryActionText}>View</Text>
                      </Pressable>

                      {!locked ? (
                        <Pressable
                          onPress={() =>
                            void openEditor({
                              towerId: item.tower_id,
                              docketId: item.id,
                              mode: "edit",
                            })
                          }
                          style={styles.primaryAction}
                        >
                          <Ionicons
                            name="create-outline"
                            size={17}
                            color="#fff"
                          />
                          <Text style={styles.primaryActionText}>
                            Edit
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => void refresh()}
                />
              }
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <View style={styles.listHeader}>
                  <Pressable
                    onPress={() => setTowerPickerOpen(true)}
                    style={styles.towerSelector}
                  >
                    <View style={styles.towerIcon}>
                      <Ionicons
                        name="radio-outline"
                        size={20}
                        color="#1d4ed8"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.towerLabel}>Selected Tower</Text>
                      <Text style={styles.towerValue}>
                        {selectedTower
                          ? towerName(selectedTower)
                          : "Choose a tower"}
                      </Text>
                      {selectedTower?.line ? (
                        <Text style={styles.towerLine}>
                          {selectedTower.line}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name="chevron-down"
                      size={18}
                      color="#64748b"
                    />
                  </Pressable>

                  <View style={styles.summaryRow}>
                    <SummaryTile
                      label="Dockets"
                      value={String(summary.count)}
                    />
                    <SummaryTile
                      label="Raw MH"
                      value={summary.raw.toFixed(1)}
                    />
                    <SummaryTile
                      label="Prod MH"
                      value={summary.production.toFixed(1)}
                    />
                    <SummaryTile
                      label="Pending"
                      value={String(summary.pending)}
                    />
                  </View>

                  <View style={styles.searchBox}>
                    <Ionicons
                      name="search"
                      size={18}
                      color="#64748b"
                    />
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search date, crew, Leading Hand or status"
                      placeholderTextColor="#94a3b8"
                      style={styles.searchInput}
                    />
                    {search ? (
                      <Pressable onPress={() => setSearch("")}>
                        <Ionicons
                          name="close-circle"
                          size={18}
                          color="#94a3b8"
                        />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              }
              ListEmptyComponent={
                <EmptyState
                  icon="document-text-outline"
                  title="No Daily Dockets"
                  body="Tap + to create the first docket for this tower."
                />
              }
            />
          )}

          <Modal
            visible={Boolean(draft && editorPayload)}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={closeEditor}
          >
            <SafeAreaView style={styles.editorSafe}>
              <View style={styles.editorHeader}>
                <Pressable
                  disabled={saving || submitting}
                  onPress={closeEditor}
                  style={styles.closeEditor}
                >
                  <Ionicons name="close" size={22} color="#334155" />
                </Pressable>

                <View style={{ flex: 1 }}>
                  <Text style={styles.editorTitle}>
                    {draft?.mode === "create"
                      ? "New Daily Docket"
                      : draft?.mode === "view"
                        ? "Daily Docket"
                        : "Edit Daily Docket"}
                  </Text>
                  <Text style={styles.editorSub}>
                    {draft?.docketDate
                      ? prettyDate(draft.docketDate)
                      : ""}
                  </Text>
                </View>

                <View style={styles.stepCounter}>
                  <Text style={styles.stepCounterText}>
                    {Math.max(
                      1,
                      DAILY_DOCKET_STEPS.findIndex(
                        (item) => item.key === step,
                      ) + 1,
                    )}
                    /{DAILY_DOCKET_STEPS.length}
                  </Text>
                </View>
              </View>

              {draft && editorPayload ? (
                <DailyDocketEditorFoundation
                  payload={editorPayload}
                  draft={draft}
                  step={step}
                  onChange={setDraft}
                  onStepChange={setStep}
                  onCopyPrevious={copyPrevious}
                  copyingPrevious={copyingPrevious}
                  onSaveDraft={() => void saveDraft(true)}
                  onSubmit={() => void submit()}
                  saving={saving}
                  submitting={submitting}
                  disabled={editorLocked}
                />
              ) : null}
            </SafeAreaView>
          </Modal>

          <Modal
            visible={towerPickerOpen}
            transparent
            animationType="slide"
            onRequestClose={() => setTowerPickerOpen(false)}
          >
            <Pressable
              style={styles.backdrop}
              onPress={() => setTowerPickerOpen(false)}
            >
              <Pressable
                style={styles.towerSheet}
                onPress={() => undefined}
              >
                <View style={styles.sheetHandle} />
                <Text style={styles.sheetTitle}>Select Tower</Text>

                <View style={styles.searchBox}>
                  <Ionicons
                    name="search"
                    size={18}
                    color="#64748b"
                  />
                  <TextInput
                    value={towerSearch}
                    onChangeText={setTowerSearch}
                    placeholder="Search towers"
                    placeholderTextColor="#94a3b8"
                    style={styles.searchInput}
                  />
                </View>

                <ScrollView
                  style={{ maxHeight: 480 }}
                  contentContainerStyle={{ gap: 7, paddingTop: 10 }}
                >
                  {filteredTowers.map((tower) => {
                    const active = tower.id === selectedTowerId;

                    return (
                      <Pressable
                        key={tower.id}
                        onPress={() => {
                          setSelectedTowerId(tower.id);
                          setTowerPickerOpen(false);
                          setTowerSearch("");
                          setSearch("");
                        }}
                        style={[
                          styles.towerOption,
                          active && styles.towerOptionActive,
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.towerOptionTitle,
                              active && styles.towerOptionTitleActive,
                            ]}
                          >
                            {towerName(tower)}
                          </Text>
                          <Text style={styles.towerOptionSub}>
                            {[tower.line, tower.status]
                              .filter(Boolean)
                              .join(" · ") || "Tower"}
                          </Text>
                        </View>
                        {active ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={21}
                            color="#2563eb"
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Pressable
                  onPress={() => setTowerPickerOpen(false)}
                  style={styles.sheetClose}
                >
                  <Text style={styles.sheetCloseText}>Close</Text>
                </Pressable>
              </Pressable>
            </Pressable>
          </Modal>

          {editorLoading && !draft ? (
            <View style={styles.editorLoadingOverlay}>
              <View style={styles.editorLoadingCard}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>
                  Opening Daily Docket…
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </PermissionScreen>
  );
}

function SummaryTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryTile}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.miniMetricValue}>{value}</Text>
      <Text style={styles.miniMetricLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={31} color="#64748b" />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  screen: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  eyebrow: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    marginTop: 1,
    color: "#0f172a",
    fontSize: 26,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 11,
  },
  addButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#2563eb",
  },
  disabled: { opacity: 0.45 },
  listContent: {
    paddingHorizontal: 15,
    paddingBottom: 50,
    gap: 11,
  },
  listHeader: {
    paddingTop: 14,
    paddingBottom: 4,
    gap: 11,
  },
  towerSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
  },
  towerIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#dbeafe",
  },
  towerLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  towerValue: {
    marginTop: 2,
    color: "#172554",
    fontSize: 16,
    fontWeight: "900",
  },
  towerLine: {
    marginTop: 2,
    color: "#475569",
    fontSize: 10,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 7,
  },
  summaryTile: {
    flex: 1,
    minHeight: 68,
    justifyContent: "center",
    padding: 9,
    borderRadius: 13,
    backgroundColor: "#0f172a",
  },
  summaryValue: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  summaryLabel: {
    marginTop: 2,
    color: "#cbd5e1",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  searchBox: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    color: "#0f172a",
    fontSize: 13,
  },
  docketCard: {
    padding: 14,
    gap: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  docketTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  docketDate: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  docketMeta: {
    marginTop: 3,
    color: "#64748b",
    fontSize: 11,
  },
  status: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
  },
  progressBlock: { marginTop: 12 },
  progressLabels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "900",
  },
  progressValue: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "900",
  },
  progressTrack: {
    height: 7,
    marginTop: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#2563eb",
  },
  cardMetrics: {
    flexDirection: "row",
    gap: 7,
    marginTop: 12,
  },
  miniMetric: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 7,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  miniMetricValue: {
    color: "#0f172a",
    fontSize: 12,
    fontWeight: "900",
  },
  miniMetricLabel: {
    marginTop: 2,
    color: "#94a3b8",
    fontSize: 8,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e2e8f0",
  },
  secondaryAction: {
    flex: 1,
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
  },
  secondaryActionText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
  },
  primaryAction: {
    flex: 1,
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  primaryActionText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  empty: {
    marginTop: 32,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 28,
    paddingVertical: 34,
  },
  emptyTitle: {
    marginTop: 4,
    color: "#334155",
    fontSize: 15,
    fontWeight: "900",
  },
  emptyBody: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  towerSheet: {
    maxHeight: "82%",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#fff",
  },
  sheetHandle: {
    width: 44,
    height: 5,
    alignSelf: "center",
    marginBottom: 13,
    borderRadius: 999,
    backgroundColor: "#cbd5e1",
  },
  sheetTitle: {
    marginBottom: 11,
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
  },
  towerOption: {
    minHeight: 55,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  towerOptionActive: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },
  towerOptionTitle: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  towerOptionTitleActive: { color: "#1d4ed8" },
  towerOptionSub: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
  },
  sheetClose: {
    minHeight: 44,
    marginTop: 13,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#0f172a",
  },
  sheetCloseText: {
    color: "#fff",
    fontWeight: "900",
  },
  editorSafe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  editorHeader: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  closeEditor: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#f1f5f9",
  },
  editorTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  editorSub: {
    marginTop: 2,
    color: "#64748b",
    fontSize: 10,
  },
  stepCounter: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#eff6ff",
  },
  stepCounterText: {
    color: "#1d4ed8",
    fontSize: 10,
    fontWeight: "900",
  },
  editorLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(248,250,252,0.82)",
  },
  editorLoadingCard: {
    minWidth: 190,
    alignItems: "center",
    gap: 10,
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
});

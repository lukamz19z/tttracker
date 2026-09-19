
import { useLocalSearchParams, router } from "expo-router";
import { Image } from "expo-image";
import {
  Camera,
  ChevronDown,
  ExternalLink,
  Plus,
  Send,
  Wrench,
  X,
} from "lucide-react-native";
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
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import { RevisionMemberFields } from "@/components/quality/RevisionMemberFields";
import { QualitySelector } from "@/components/quality/QualitySelector";
import { QualityShell } from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import {
  cachedQualityMemberCatalog,
  cachedQualityRevisionDetail,
  downloadQualityFile,
  refreshQualityMemberCatalog,
  refreshQualityRevisionDetail,
  resolveQualityRevision,
  shareQualityFile,
  submitRevisionForReview,
  type QualityMemberCatalogRow,
} from "@/lib/api/quality";
import {
  enqueueRevisionItemCreate,
  enqueueRevisionItemUpdate,
} from "@/lib/offline/quality-sync";
import {
  clientMutationIdFromRouteKey,
  createPendingFinding,
  ensureServerRevisionWorkspace,
  isLocalRevisionRouteKey,
  listRevisionWorkspaces,
  removeRevisionWorkspace,
  saveRevisionWorkspace,
  touchWorkspace,
  type PendingRevisionUpdate,
  type RevisionWorkspace,
} from "@/lib/offline/revision-workspaces";
import type {
  LocalQualityPhoto,
  QualityRevisionItem,
} from "@/types/quality";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function prettyDate(value: unknown) {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw || "—";
  return `${match[3]}-${match[2]}-${match[1]}`;
}

type FindingForm = {
  issueTypeId: string | null;
  otherIssueText: string;
  memberNumber: string;
  drawingNumber: string;
  towerSegment: string;
  finding: string;
  rectificationComment: string;
  beforePhotos: LocalQualityPhoto[];
  afterPhotos: LocalQualityPhoto[];
};

const BLANK_FINDING: FindingForm = {
  issueTypeId: null,
  otherIssueText: "",
  memberNumber: "",
  drawingNumber: "",
  towerSegment: "",
  finding: "",
  rectificationComment: "",
  beforePhotos: [],
  afterPhotos: [],
};

type RectificationForm = {
  item: QualityRevisionItem;
  rectificationComment: string;
  afterPhotos: LocalQualityPhoto[];
};

export default function RevisionDetailScreen() {
  const params = useLocalSearchParams<{ revisionId: string }>();
  const routeRevisionId = clean(params.revisionId);

  const { data, loading: metadataLoading } = useQuality();
  const { profile } = useAuth();
  const { online, syncing } = useSync();

  const projectId =
    clean(data?.projectId) || clean(profile?.projectId);

  const [workspace, setWorkspace] =
    useState<RevisionWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] =
    useState(true);

  const [memberCatalog, setMemberCatalog] =
    useState<QualityMemberCatalogRow[]>([]);
  const [issuePickerOpen, setIssuePickerOpen] =
    useState(false);

  const [findingModalOpen, setFindingModalOpen] =
    useState(false);
  const [findingForm, setFindingForm] =
    useState<FindingForm>(BLANK_FINDING);
  const [findingSaving, setFindingSaving] =
    useState(false);

  const [rectification, setRectification] =
    useState<RectificationForm | null>(null);
  const [rectificationSaving, setRectificationSaving] =
    useState(false);

  const [submitBusy, setSubmitBusy] =
    useState(false);

  const [preview, setPreview] =
    useState<{ uri: string; name: string } | null>(null);
  const [openingId, setOpeningId] =
    useState<string | null>(null);
  const wasSyncingRef = useRef(false);

  const towers = useMemo(
    () => (Array.isArray(data?.towers) ? data.towers : []),
    [data?.towers],
  );

  const localClientMutationId =
    clientMutationIdFromRouteKey(routeRevisionId);

  const [detail, setDetail] = useState<
    Awaited<ReturnType<typeof refreshQualityRevisionDetail>> | null
  >(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const serverRevision = detail?.revision ?? null;

  const activeRevisionId =
    clean(serverRevision?.id) ||
    clean(workspace?.serverRevisionId);

  const towerId =
    clean(serverRevision?.tower_id) ||
    clean(workspace?.towerId);

  const availableMembers = useMemo(() => {
    const rows = new Map<string, QualityMemberCatalogRow>();

    for (const member of memberCatalog) {
      const key =
        clean(member.id) ||
        [
          clean(member.memberNumber),
          clean(member.towerSegment),
          clean(member.drawingNumber),
          clean(member.bundleReference),
        ].join("::");

      if (!rows.has(key)) {
        rows.set(key, member);
      }
    }

    return Array.from(rows.values());
  }, [memberCatalog]);

  const tower = towers.find(
    (row) => clean(row.id) === towerId,
  );

  const projectCode =
    clean(profile?.projectNumber) ||
    clean(profile?.projectName) ||
    "Project";

  const rectCode = serverRevision
    ? clean(serverRevision.revision_number) ||
      `RECT-${String(
        Number(serverRevision.sequence_no ?? 1),
      ).padStart(2, "0")}`
    : "RECT · Pending sync";

  const title = [
    projectCode,
    clean(tower?.name) || "Tower",
    rectCode,
  ]
    .filter(Boolean)
    .join(" ");

  const revisionItems = useMemo(
    () => detail?.items ?? [],
    [detail?.items],
  );

  const revisionFiles = useMemo(
    () => detail?.files ?? [],
    [detail?.files],
  );

  const issueOptions = useMemo(() => {
    const rows = (data?.issueTypes ?? [])
      .filter(
        (row) =>
          row.active !== false &&
          ["revision", "both"].includes(
            clean(row.applies_to),
          ),
      )
      .map((row) => ({
        id: row.id,
        label: row.name,
      }));

    return [
      ...rows,
      {
        id: "__other__",
        label: "Other",
        subtitle: "Enter a custom flagged issue",
      },
    ];
  }, [data?.issueTypes]);

  const selectedIssueLabel =
    issueOptions.find(
      (option) =>
        option.id ===
        (findingForm.issueTypeId ?? "__other__"),
    )?.label ?? "Select flagged issue";

  const canonicalRevisionId =
    isLocalRevisionRouteKey(routeRevisionId)
      ? clean(workspace?.serverRevisionId)
      : routeRevisionId;

  const reloadDetail = useCallback(
    async (_forceLive = false) => {
      if (!projectId || !canonicalRevisionId) {
        return;
      }

      setDetailLoading(true);
      setDetailError(null);
      let hadCache = false;

      try {
        const cached =
          await cachedQualityRevisionDetail(
            projectId,
            canonicalRevisionId,
          );

        if (cached?.value) {
          hadCache = true;
          setDetail(cached.value);
        }

        if (online) {
          const latest =
            await refreshQualityRevisionDetail(
              projectId,
              canonicalRevisionId,
            );
          setDetail(latest);
        }
      } catch (loadError) {
        if (!hadCache) {
          setDetailError(
            loadError instanceof Error
              ? loadError.message
              : "Revision could not be loaded.",
          );
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [
      canonicalRevisionId,
      online,
      projectId,
    ],
  );

  useEffect(() => {
    void reloadDetail(false);
  }, [reloadDetail]);

  useEffect(() => {
    const wasSyncing = wasSyncingRef.current;
    wasSyncingRef.current = syncing;

    if (
      wasSyncing &&
      !syncing &&
      online &&
      canonicalRevisionId
    ) {
      void reloadDetail(true);
    }
  }, [
    canonicalRevisionId,
    online,
    reloadDetail,
    syncing,
  ]);

  useEffect(() => {
    if (
      !online ||
      !projectId ||
      !workspace ||
      !localClientMutationId ||
      workspace.serverRevisionId
    ) {
      return;
    }

    let active = true;

    void resolveQualityRevision(
      projectId,
      localClientMutationId,
    )
      .then(async (result) => {
        const revisionId = clean(
          result.revision?.id,
        );
        if (!active || !revisionId) return;

        const next = touchWorkspace({
          ...workspace,
          serverRevisionId: revisionId,
        });

        await saveRevisionWorkspace(next);
        if (active) setWorkspace(next);
      })
      .catch(() => {
        // Parent may still be waiting in the offline queue.
      });

    return () => {
      active = false;
    };
  }, [
    localClientMutationId,
    online,
    projectId,
    workspace,
  ]);

  const loadWorkspace = useCallback(async () => {
    if (!projectId || !routeRevisionId) return;

    setWorkspaceLoading(true);

    try {
      const all = await listRevisionWorkspaces(projectId);

      let found =
        all.find(
          (row) => row.routeKey === routeRevisionId,
        ) ?? null;

      if (!found && serverRevision) {
        found = await ensureServerRevisionWorkspace({
          projectId,
          revisionId: serverRevision.id,
          towerId: serverRevision.tower_id,
          inspectionStage:
            serverRevision.inspection_stage,
          inspectionDate:
            serverRevision.inspection_date,
          clientInspector:
            serverRevision.client_inspector,
          clientCompany:
            serverRevision.client_company,
          clientReference:
            serverRevision.client_reference,
          notes: serverRevision.notes,
        });
      }

      if (
        found &&
        serverRevision &&
        found.serverRevisionId !== serverRevision.id
      ) {
        found = touchWorkspace({
          ...found,
          serverRevisionId: serverRevision.id,
        });
        await saveRevisionWorkspace(found);
      }

      setWorkspace(found);
    } finally {
      setWorkspaceLoading(false);
    }
  }, [
    projectId,
    routeRevisionId,
    serverRevision,
  ]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (!projectId || !towerId) {
      setMemberCatalog([]);
      return;
    }

    void (async () => {
      const cached =
        await cachedQualityMemberCatalog(
          projectId,
          towerId,
        );

      if (cached?.value?.length) {
        setMemberCatalog(cached.value);
      }

      if (online) {
        try {
          const latest =
            await refreshQualityMemberCatalog(
              projectId,
              towerId,
            );
          setMemberCatalog(latest);
        } catch {
          // Keep cached member register if live refresh fails.
        }
      }
    })();
  }, [online, projectId, towerId]);

  // Queue local FLIs as soon as their parent RECT has a real server ID.
  useEffect(() => {
    if (!workspace || !activeRevisionId) return;

    const existingMutationIds = new Set(
      revisionItems
        .map((item) =>
          clean(item.mobile_client_mutation_id),
        )
        .filter(Boolean),
    );

    const remainingFindings =
      workspace.findings.filter(
        (finding) =>
          !existingMutationIds.has(
            finding.clientMutationId,
          ),
      );

    const syncedSomething =
      remainingFindings.length !==
      workspace.findings.length;

    let nextWorkspace = syncedSomething
      ? touchWorkspace({
          ...workspace,
          findings: remainingFindings,
        })
      : workspace;

    const unqueued =
      nextWorkspace.findings.filter(
        (finding) => !finding.queuedAt,
      );

    if (!unqueued.length) {
      if (syncedSomething) {
        void saveRevisionWorkspace(nextWorkspace).then(
          () => setWorkspace(nextWorkspace),
        );
      }
      return;
    }

    void (async () => {
      for (const finding of unqueued) {
        await enqueueRevisionItemCreate({
          clientMutationId:
            finding.clientMutationId,
          revisionId: activeRevisionId,
          projectId: workspace.projectId,
          towerId: workspace.towerId,
          issueTypeId:
            finding.issueTypeId === "__other__"
              ? null
              : finding.issueTypeId,
          otherIssueText:
            finding.issueTypeId === "__other__"
              ? finding.otherIssueText
              : null,
          towerSegment: finding.towerSegment,
          memberNumber: finding.memberNumber,
          drawingNumber: finding.drawingNumber,
          finding: finding.finding,
          rectificationComment:
            finding.rectificationComment,
          status: finding.status,
          beforePhotos: finding.beforePhotos,
          afterPhotos: finding.afterPhotos,
        });

        nextWorkspace = touchWorkspace({
          ...nextWorkspace,
          findings: nextWorkspace.findings.map(
            (row) =>
              row.clientMutationId ===
              finding.clientMutationId
                ? {
                    ...row,
                    queuedAt:
                      new Date().toISOString(),
                  }
                : row,
          ),
        });

        await saveRevisionWorkspace(
          nextWorkspace,
        );
        setWorkspace(nextWorkspace);
      }
    })().catch((error) => {
      console.warn(
        "Could not queue pending Revision finding",
        error,
      );
    });
  }, [
    activeRevisionId,
    revisionItems,
    workspace,
  ]);

  // Clear pending rectification overlays after the server record catches up.
  useEffect(() => {
    if (!workspace?.pendingUpdates.length) return;

    const remaining =
      workspace.pendingUpdates.filter((update) => {
        const item = revisionItems.find(
          (row) => row.id === update.itemId,
        );

        if (!item) return true;

        return !(
          clean(item.status) === update.status &&
          clean(item.rectification_comment) ===
            clean(update.rectificationComment)
        );
      });

    if (
      remaining.length ===
      workspace.pendingUpdates.length
    ) {
      return;
    }

    const next = touchWorkspace({
      ...workspace,
      pendingUpdates: remaining,
    });

    void saveRevisionWorkspace(next).then(() =>
      setWorkspace(next),
    );
  }, [revisionItems, workspace]);

  // Once an offline parent is resolved and nothing local remains,
  // move the user onto the canonical server route.
  useEffect(() => {
    if (
      !workspace ||
      !serverRevision ||
      !isLocalRevisionRouteKey(routeRevisionId)
    ) {
      return;
    }

    if (
      workspace.findings.length === 0 &&
      workspace.pendingUpdates.length === 0
    ) {
      void removeRevisionWorkspace(
        projectId,
        workspace.routeKey,
      ).then(() => {
        router.replace(
          `/revisions/${encodeURIComponent(
            serverRevision.id,
          )}`,
        );
      });
    }
  }, [
    projectId,
    routeRevisionId,
    serverRevision,
    workspace,
  ]);


  function issueName(item: QualityRevisionItem) {
    return (
      (item.issue_type_id
        ? data?.issueTypes?.find(
            (row) => row.id === item.issue_type_id,
          )?.name
        : null) ||
      clean(item.other_issue_text) ||
      "Other"
    );
  }

  function openAddFinding() {
    setFindingForm(BLANK_FINDING);
    setFindingModalOpen(true);
  }

  async function saveFinding() {
    if (!workspace) {
      Alert.alert(
        "Revision not ready",
        "Wait for the Revision workspace to load.",
      );
      return;
    }

    if (!findingForm.issueTypeId) {
      Alert.alert(
        "Flagged issue required",
        "Select the flagged issue from the dropdown.",
      );
      return;
    }

    if (
      findingForm.issueTypeId === "__other__" &&
      !clean(findingForm.otherIssueText)
    ) {
      Alert.alert(
        "Issue details required",
        "Enter the Other flagged issue.",
      );
      return;
    }

    if (!findingForm.beforePhotos.length) {
      Alert.alert(
        "Before photo required",
        "Capture at least one Before photo for the FLI.",
      );
      return;
    }

    setFindingSaving(true);

    try {
      const pending = createPendingFinding({
        issueTypeId: findingForm.issueTypeId,
        otherIssueText:
          clean(findingForm.otherIssueText) || null,
        towerSegment:
          clean(findingForm.towerSegment) || null,
        memberNumber:
          clean(findingForm.memberNumber) || null,
        drawingNumber:
          clean(findingForm.drawingNumber) || null,
        finding:
          clean(findingForm.finding) ||
          clean(findingForm.otherIssueText) ||
          selectedIssueLabel,
        rectificationComment:
          clean(
            findingForm.rectificationComment,
          ) || null,
        status: findingForm.afterPhotos.length
          ? "Rectified"
          : "Open",
        beforePhotos: findingForm.beforePhotos,
        afterPhotos: findingForm.afterPhotos,
      });

      const next = touchWorkspace({
        ...workspace,
        findings: [...workspace.findings, pending],
      });

      await saveRevisionWorkspace(next);
      setWorkspace(next);

      setFindingModalOpen(false);
      setFindingForm(BLANK_FINDING);
  
      // The queuing effect above will immediately queue this
      // if the parent RECT already exists server-side.
    } catch (error) {
      Alert.alert(
        "Finding could not be saved",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setFindingSaving(false);
    }
  }

  async function saveRectification() {
    if (!workspace || !rectification) return;

    if (!rectification.afterPhotos.length) {
      Alert.alert(
        "After photo required",
        "Capture at least one After photo before marking this FLI Rectified.",
      );
      return;
    }

    setRectificationSaving(true);

    try {
      await enqueueRevisionItemUpdate({
        revisionId:
          rectification.item.revision_id,
        itemId: rectification.item.id,
        projectId: workspace.projectId,
        towerId: workspace.towerId,
        rectificationComment:
          clean(
            rectification.rectificationComment,
          ),
        status: "Rectified",
        afterPhotos:
          rectification.afterPhotos,
      });

      const update: PendingRevisionUpdate = {
        itemId: rectification.item.id,
        rectificationComment:
          clean(
            rectification.rectificationComment,
          ),
        status: "Rectified",
        afterPhotos:
          rectification.afterPhotos,
        queuedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const next = touchWorkspace({
        ...workspace,
        pendingUpdates: [
          ...workspace.pendingUpdates.filter(
            (row) =>
              row.itemId !==
              rectification.item.id,
          ),
          update,
        ],
      });

      await saveRevisionWorkspace(next);
      setWorkspace(next);
      setRectification(null);
    } catch (error) {
      Alert.alert(
        "Rectification could not be saved",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setRectificationSaving(false);
    }
  }

  async function openServerPhoto(file: {
    id: string;
    file_name: string;
  }) {
    setOpeningId(file.id);

    try {
      const uri = await downloadQualityFile(
        file.id,
        file.file_name,
      );

      setPreview({
        uri,
        name: file.file_name || "Evidence",
      });
    } catch (error) {
      Alert.alert(
        "Could not open photo",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setOpeningId(null);
    }
  }

  function openLocalPhoto(
    photo: LocalQualityPhoto,
  ) {
    setPreview({
      uri: photo.uri,
      name: photo.name,
    });
  }

  async function submit() {
    if (!serverRevision) {
      Alert.alert(
        "Revision still syncing",
        "The parent RECT must finish syncing before it can be submitted for review.",
      );
      return;
    }

    if (
      workspace?.findings.length ||
      workspace?.pendingUpdates.length
    ) {
      Alert.alert(
        "Pending Quality changes",
        "Wait for the pending findings / rectifications to sync before submitting for review.",
      );
      return;
    }

    setSubmitBusy(true);

    try {
      const result =
        await submitRevisionForReview(
          serverRevision.id,
        );

      const count = Number(
        result.notification?.recipients ?? 0,
      );

      Alert.alert(
        "Submitted for review",
        `${title} submitted. ${count} configured recipient${count === 1 ? "" : "s"} notified.${result.notification?.warning ? `\n\n${result.notification.warning}` : ""}`,
      );

      await reloadDetail(true);
    } catch (error) {
      Alert.alert(
        "Could not submit",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setSubmitBusy(false);
    }
  }

  if (
    workspaceLoading ||
    ((metadataLoading || detailLoading) && !serverRevision && !workspace)
  ) {
    return (
      <QualityShell
        permission="mobile.rectifications"
        title="Revision"
      >
        <ActivityIndicator />
      </QualityShell>
    );
  }

  if (!serverRevision && !workspace) {
    return (
      <QualityShell
        permission="mobile.rectifications"
        title="Revision"
      >
        <Text>
          {detailError || "Revision not found."}
        </Text>
      </QualityShell>
    );
  }

  const pendingFindingCount =
    workspace?.findings.length ?? 0;

  return (
    <QualityShell
      permission="mobile.rectifications"
      title={title}
      subtitle={`${revisionItems.length + pendingFindingCount} FLI${revisionItems.length + pendingFindingCount === 1 ? "" : "s"} · ${online ? "Online" : "Offline"}`}
    >
      <View style={styles.revisionCard}>
        <View style={styles.head}>
          <View style={styles.grow}>
            <Text style={styles.title}>
              {title}
            </Text>
            <Text style={styles.meta}>
              {prettyDate(
                serverRevision?.inspection_date ??
                  workspace?.inspectionDate,
              )}{" "}
              ·{" "}
              {clean(
                serverRevision?.inspection_stage ??
                  workspace?.inspectionStage,
              )}
            </Text>
          </View>

          <QualityStatusPill
            value={
              serverRevision?.status ??
              "Pending sync"
            }
          />
        </View>

        {clean(
          serverRevision?.notes ??
            workspace?.notes,
        ) ? (
          <Text style={styles.notes}>
            {clean(
              serverRevision?.notes ??
                workspace?.notes,
            )}
          </Text>
        ) : null}
      </View>

      <Pressable
        style={styles.addFinding}
        onPress={openAddFinding}
      >
        <Plus size={18} color="#fff" />
        <Text style={styles.addFindingText}>
          Add Finding / FLI
        </Text>
      </Pressable>

      {workspace?.findings.map(
        (finding, index) => (
          <View
            key={finding.clientMutationId}
            style={styles.card}
          >
            <View style={styles.head}>
              <View>
                <Text style={styles.fli}>
                  Pending FLI-
                  {String(
                    revisionItems.length +
                      index +
                      1,
                  ).padStart(3, "0")}
                </Text>
                <Text style={styles.pending}>
                  {finding.queuedAt
                    ? "Queued for sync"
                    : "Saved locally"}
                </Text>
              </View>
              <QualityStatusPill
                value={finding.status}
              />
            </View>

            <Text style={styles.issueName}>
              {issueOptions.find(
                (option) =>
                  option.id ===
                  finding.issueTypeId,
              )?.label ||
                finding.otherIssueText ||
                "Other"}
            </Text>

            <Text style={styles.meta}>
              {[
                finding.memberNumber
                  ? `Member ${finding.memberNumber}`
                  : "",
                finding.towerSegment,
                finding.drawingNumber
                  ? `Drawing ${finding.drawingNumber}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>

            {finding.finding ? (
              <Text style={styles.finding}>
                {finding.finding}
              </Text>
            ) : null}

            <View style={styles.evidenceRow}>
              {finding.beforePhotos.map(
                (photo, photoIndex) => (
                  <Pressable
                    key={photo.id}
                    style={styles.photoButton}
                    onPress={() =>
                      openLocalPhoto(photo)
                    }
                  >
                    <Camera
                      size={14}
                      color="#0f172a"
                    />
                    <Text style={styles.photoText}>
                      Before {photoIndex + 1}
                    </Text>
                  </Pressable>
                ),
              )}

              {finding.afterPhotos.map(
                (photo, photoIndex) => (
                  <Pressable
                    key={photo.id}
                    style={styles.photoButton}
                    onPress={() =>
                      openLocalPhoto(photo)
                    }
                  >
                    <Camera
                      size={14}
                      color="#0f172a"
                    />
                    <Text style={styles.photoText}>
                      After {photoIndex + 1}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>
          </View>
        ),
      )}

      {revisionItems.map((item, index) => {
        const fli =
          clean(item.fli_number) ||
          `FLI-${String(
            Number(
              item.item_number ?? index + 1,
            ),
          ).padStart(3, "0")}`;

        const evidence = revisionFiles.filter(
          (file) =>
            clean(file.revision_item_id) ===
            item.id &&
            ["before_photo", "after_photo"].includes(
              clean(file.file_role),
            ),
        );

        const pendingUpdate =
          workspace?.pendingUpdates.find(
            (row) => row.itemId === item.id,
          );

        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.head}>
              <View style={styles.grow}>
                <Text style={styles.fli}>
                  {fli}
                </Text>
                <Text style={styles.issueName}>
                  {issueName(item)}
                </Text>
              </View>

              <QualityStatusPill
                value={
                  pendingUpdate?.status ??
                  item.status
                }
              />
            </View>

            <Text style={styles.meta}>
              {[
                item.member_number
                  ? `Member ${item.member_number}`
                  : "",
                item.tower_segment,
                item.drawing_number
                  ? `Drawing ${item.drawing_number}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>

            {clean(item.finding) ? (
              <Text style={styles.finding}>
                {clean(item.finding)}
              </Text>
            ) : null}

            {clean(
              pendingUpdate?.rectificationComment ??
                item.rectification_comment,
            ) ? (
              <Text style={styles.rectificationText}>
                Rectification:{" "}
                {clean(
                  pendingUpdate?.rectificationComment ??
                    item.rectification_comment,
                )}
              </Text>
            ) : null}

            <View style={styles.evidenceRow}>
              {evidence.map((file) => (
                <View
                  key={file.id}
                  style={styles.evidenceActions}
                >
                  <Pressable
                    style={styles.photoButton}
                    onPress={() =>
                      void openServerPhoto({
                        id: file.id,
                        file_name:
                          file.file_name,
                      })
                    }
                  >
                    {openingId === file.id ? (
                      <ActivityIndicator
                        size="small"
                      />
                    ) : (
                      <Camera
                        size={14}
                        color="#0f172a"
                      />
                    )}

                    <Text
                      style={styles.photoText}
                    >
                      {file.file_role ===
                      "after_photo"
                        ? "After"
                        : "Before"}
                    </Text>
                  </Pressable>

                  <Pressable
                    style={styles.shareButton}
                    onPress={() =>
                      void shareQualityFile(
                        file.id,
                        file.file_name,
                      )
                    }
                  >
                    <ExternalLink
                      size={14}
                      color="#475569"
                    />
                  </Pressable>
                </View>
              ))}

              {pendingUpdate?.afterPhotos.map(
                (photo, photoIndex) => (
                  <Pressable
                    key={photo.id}
                    style={styles.photoButton}
                    onPress={() =>
                      openLocalPhoto(photo)
                    }
                  >
                    <Camera
                      size={14}
                      color="#0f172a"
                    />
                    <Text style={styles.photoText}>
                      Pending After{" "}
                      {photoIndex + 1}
                    </Text>
                  </Pressable>
                ),
              )}
            </View>

            {item.status !== "Verified" ? (
              <Pressable
                style={styles.rectifyButton}
                onPress={() =>
                  setRectification({
                    item,
                    rectificationComment:
                      clean(
                        item.rectification_comment,
                      ),
                    afterPhotos: [],
                  })
                }
              >
                <Wrench
                  size={15}
                  color="#334155"
                />
                <Text
                  style={styles.rectifyText}
                >
                  Add After Photos / Rectify
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {!revisionItems.length &&
      !pendingFindingCount ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            No findings yet
          </Text>
          <Text style={styles.emptyText}>
            Create the first FLI using Add Finding.
            Each FLI can be saved independently and
            revisited later.
          </Text>
        </View>
      ) : null}

      {serverRevision &&
      !["Ready for Review", "Closed"].includes(
        clean(serverRevision.status),
      ) ? (
        <Pressable
          style={[
            styles.submit,
            submitBusy && styles.disabled,
          ]}
          disabled={submitBusy}
          onPress={() => void submit()}
        >
          {submitBusy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Send size={18} color="#fff" />
          )}
          <Text style={styles.submitText}>
            Submit for Review
          </Text>
        </Pressable>
      ) : null}

      {!serverRevision ? (
        <View style={styles.syncNotice}>
          <Text style={styles.syncNoticeTitle}>
            Revision saved offline
          </Text>
          <Text style={styles.syncNoticeText}>
            You can keep adding findings and photos.
            The RECT will receive its final RECT-##
            number when the queued parent syncs.
          </Text>
        </View>
      ) : null}

      <Modal
        visible={findingModalOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() =>
          setFindingModalOpen(false)
        }
      >
        <SafeAreaView style={styles.formSafe}>
          <View style={styles.modalHeader}>
            <View style={styles.grow}>
              <Text style={styles.modalTitle}>
                Add Finding / FLI
              </Text>
              <Text style={styles.modalSub}>
                Saved independently against {rectCode}
              </Text>
            </View>
            <Pressable
              style={styles.closeLight}
              onPress={() =>
                setFindingModalOpen(false)
              }
            >
              <X size={20} color="#334155" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.label}>
              Flagged issue *
            </Text>
            <Pressable
              style={styles.selector}
              onPress={() =>
                setIssuePickerOpen(true)
              }
            >
              <Text style={styles.selectorTitle}>
                {selectedIssueLabel}
              </Text>
              <ChevronDown
                size={18}
                color="#64748b"
              />
            </Pressable>

            {findingForm.issueTypeId ===
            "__other__" ? (
              <>
                <Text style={styles.label}>
                  Other issue *
                </Text>
                <TextInput
                  value={
                    findingForm.otherIssueText
                  }
                  onChangeText={(value) =>
                    setFindingForm(
                      (current) => ({
                        ...current,
                        otherIssueText: value,
                      }),
                    )
                  }
                  style={styles.input}
                />
              </>
            ) : null}

            <RevisionMemberFields
              members={availableMembers}
              segment={findingForm.towerSegment}
              memberNumber={findingForm.memberNumber}
              drawingNumber={findingForm.drawingNumber}
              onSegmentChange={(
                towerSegment,
                keepCurrentMember,
              ) =>
                setFindingForm((current) => ({
                  ...current,
                  towerSegment,
                  memberNumber: keepCurrentMember
                    ? current.memberNumber
                    : "",
                  drawingNumber: keepCurrentMember
                    ? current.drawingNumber
                    : "",
                }))
              }
              onSelectMember={(member) =>
                setFindingForm((current) => ({
                  ...current,
                  memberNumber:
                    clean(member.memberNumber),
                  towerSegment:
                    clean(member.towerSegment) ||
                    current.towerSegment,
                  drawingNumber:
                    clean(member.drawingNumber),
                }))
              }
            />

            <Text style={styles.label}>
              Finding details
            </Text>
            <TextInput
              multiline
              value={findingForm.finding}
              onChangeText={(finding) =>
                setFindingForm((current) => ({
                  ...current,
                  finding,
                }))
              }
              placeholder="Describe what was flagged…"
              style={[styles.input, styles.multiline]}
            />

            <QualityPhotoPicker
              label="Before photos"
              photos={findingForm.beforePhotos}
              onChange={(beforePhotos) =>
                setFindingForm((current) => ({
                  ...current,
                  beforePhotos,
                }))
              }
              required
              prefix="revision-before"
            />

            <QualityPhotoPicker
              label="After photos"
              photos={findingForm.afterPhotos}
              onChange={(afterPhotos) =>
                setFindingForm((current) => ({
                  ...current,
                  afterPhotos,
                }))
              }
              prefix="revision-after"
            />

            {findingForm.afterPhotos.length ? (
              <>
                <Text style={styles.label}>
                  Rectification comment
                </Text>
                <TextInput
                  multiline
                  value={
                    findingForm.rectificationComment
                  }
                  onChangeText={(
                    rectificationComment,
                  ) =>
                    setFindingForm(
                      (current) => ({
                        ...current,
                        rectificationComment,
                      }),
                    )
                  }
                  style={[
                    styles.input,
                    styles.multiline,
                  ]}
                />
              </>
            ) : null}

            <Pressable
              style={[
                styles.submit,
                findingSaving &&
                  styles.disabled,
              ]}
              disabled={findingSaving}
              onPress={() =>
                void saveFinding()
              }
            >
              {findingSaving ? (
                <ActivityIndicator
                  color="#fff"
                />
              ) : (
                <Plus
                  size={18}
                  color="#fff"
                />
              )}
              <Text style={styles.submitText}>
                Save FLI
              </Text>
            </Pressable>
          </ScrollView>

          <QualitySelector
            visible={issuePickerOpen}
            title="Flagged Issue"
            options={issueOptions}
            onClose={() =>
              setIssuePickerOpen(false)
            }
            onSelect={(option) =>
              setFindingForm(
                (current) => ({
                  ...current,
                  issueTypeId: option.id,
                  otherIssueText:
                    option.id === "__other__"
                      ? current.otherIssueText
                      : "",
                }),
              )
            }
          />

        </SafeAreaView>
      </Modal>

      <Modal
        visible={Boolean(rectification)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setRectification(null)
        }
      >
        <SafeAreaView style={styles.formSafe}>
          <View style={styles.modalHeader}>
            <View style={styles.grow}>
              <Text style={styles.modalTitle}>
                Rectify FLI
              </Text>
              <Text style={styles.modalSub}>
                Add After evidence and the
                rectification comment.
              </Text>
            </View>
            <Pressable
              style={styles.closeLight}
              onPress={() =>
                setRectification(null)
              }
            >
              <X size={20} color="#334155" />
            </Pressable>
          </View>

          {rectification ? (
            <ScrollView
              contentContainerStyle={
                styles.formContent
              }
            >
              <Text style={styles.label}>
                Rectification comment
              </Text>
              <TextInput
                multiline
                value={
                  rectification.rectificationComment
                }
                onChangeText={(value) =>
                  setRectification(
                    (current) =>
                      current
                        ? {
                            ...current,
                            rectificationComment:
                              value,
                          }
                        : current,
                  )
                }
                style={[
                  styles.input,
                  styles.multiline,
                ]}
              />

              <QualityPhotoPicker
                label="After photos"
                photos={
                  rectification.afterPhotos
                }
                onChange={(afterPhotos) =>
                  setRectification(
                    (current) =>
                      current
                        ? {
                            ...current,
                            afterPhotos,
                          }
                        : current,
                  )
                }
                required
                prefix="revision-after"
              />

              <Pressable
                style={[
                  styles.submit,
                  rectificationSaving &&
                    styles.disabled,
                ]}
                disabled={
                  rectificationSaving
                }
                onPress={() =>
                  void saveRectification()
                }
              >
                {rectificationSaving ? (
                  <ActivityIndicator
                    color="#fff"
                  />
                ) : (
                  <Wrench
                    size={18}
                    color="#fff"
                  />
                )}
                <Text
                  style={styles.submitText}
                >
                  Save Rectification
                </Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={Boolean(preview)}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setPreview(null)
        }
      >
        <View style={styles.previewModal}>
          <Pressable
            style={styles.previewClose}
            onPress={() =>
              setPreview(null)
            }
          >
            <X size={25} color="#fff" />
          </Pressable>

          {preview ? (
            <Image
              source={{ uri: preview.uri }}
              style={styles.previewImage}
              contentFit="contain"
            />
          ) : null}

          <Text style={styles.previewName}>
            {preview?.name}
          </Text>
        </View>
      </Modal>
    </QualityShell>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  revisionCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 15,
    gap: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 15,
    gap: 9,
  },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 16,
  },
  fli: {
    color: "#2563eb",
    fontWeight: "900",
    fontSize: 15,
  },
  pending: {
    color: "#b45309",
    fontWeight: "800",
    fontSize: 10,
    marginTop: 2,
  },
  issueName: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 13,
  },
  meta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  notes: {
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
  },
  finding: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 19,
  },
  rectificationText: {
    color: "#047857",
    backgroundColor: "#ecfdf5",
    padding: 10,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: "700",
  },
  addFinding: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  addFindingText: {
    color: "#fff",
    fontWeight: "900",
  },
  evidenceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  evidenceActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  photoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  photoText: {
    color: "#0f172a",
    fontSize: 11,
    fontWeight: "800",
  },
  shareButton: {
    marginLeft: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 8,
  },
  rectifyButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "#f1f5f9",
    borderRadius: 11,
    padding: 10,
  },
  rectifyText: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "900",
  },
  empty: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: {
    color: "#334155",
    fontWeight: "900",
  },
  emptyText: {
    color: "#64748b",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  submit: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  submitText: {
    color: "#fff",
    fontWeight: "900",
  },
  disabled: { opacity: 0.5 },
  syncNotice: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 14,
    padding: 13,
  },
  syncNoticeTitle: {
    color: "#92400e",
    fontWeight: "900",
  },
  syncNoticeText: {
    color: "#92400e",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  formSafe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  modalTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 18,
  },
  modalSub: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 2,
  },
  closeLight: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  formContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 44,
  },
  label: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
  },
  selector: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
  },
  selectorTitle: {
    flex: 1,
    color: "#0f172a",
    fontWeight: "800",
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    color: "#0f172a",
  },
  multiline: {
    minHeight: 90,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  previewModal: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.95)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  previewClose: {
    position: "absolute",
    top: 48,
    right: 18,
    zIndex: 10,
    padding: 10,
  },
  previewImage: {
    width: "100%",
    height: "82%",
  },
  previewName: {
    color: "#fff",
    fontSize: 12,
    marginTop: 12,
  },
});

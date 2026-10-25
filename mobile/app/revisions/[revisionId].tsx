import { annotateQualityPhoto, evidencePreviewUri } from "@/lib/quality-evidence";
import { deleteQualityFinding, deleteQualityRevision } from "@/lib/offline/quality-deletion";
import { useAccess } from "@/lib/access";
import { qualityTowerDisplay } from "../../../lib/quality/tower-label";
import { SafeAreaView } from "react-native-safe-area-context";
import { QualityLegField } from "@/components/quality/QualityLegField";
import { nextFindingLocation, savedFindingLocation } from "@/lib/offline/revision-location";
import { enqueue, queueRows,getCache } from "@/lib/offline/db";

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
} from "@/lib/offline/quality-sync";
import {
  clientMutationIdFromRouteKey,
  createPendingFinding,
  ensureServerRevisionWorkspace,
  isLocalRevisionRouteKey,
  listRevisionWorkspaces,
  reconcileRevisionDetail,
  saveRevisionWorkspace,
  touchWorkspace,
  type PendingRevisionUpdate,
  type RevisionWorkspace,
} from "@/lib/offline/revision-workspaces";
import type {
  LocalQualityPhoto,
  QualityRevision,
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
  leg: string | null; assignedFlag: string;
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
  leg: null, assignedFlag: "",
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
  const {can}=useAccess();
  const [deleteOpen,setDeleteOpen]=useState(false);
  const [deleteConfirmation,setDeleteConfirmation]=useState("");
  const [deleting,setDeleting]=useState(false);
  const { profile } = useAuth();
  const { online, syncing, failedCount, syncNow, refresh: refreshSync } = useSync();

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
    ? clean(serverRevision.revision_number) || clean(serverRevision.fli_number) ||
      `RECT-${String(
        Number(serverRevision.sequence_no ?? 1),
      ).padStart(2, "0")}`
    : clean(workspace?.serverRevisionNumber) || "RECT · Pending sync";

  const title = [
    projectCode,
    qualityTowerDisplay(tower?.name,workspace?.towerLabel,detail?.towerLabel),
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
          serverRevisionNumber: result.revision?.revision_number,
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
          (row) => row.routeKey === routeRevisionId || row.serverRevisionId===routeRevisionId || row.legacyRouteKeys?.includes(routeRevisionId) || row.clientMutationId===clientMutationIdFromRouteKey(routeRevisionId),
        ) ?? null;
      if(!found && isLocalRevisionRouteKey(routeRevisionId)) {
        const mutation=clientMutationIdFromRouteKey(routeRevisionId);
        let mapping=(await getCache<Partial<QualityRevision> & {id:string}>(`quality:parent-mapping:${projectId}:${mutation}`))?.value;
        if(!mapping && online && mutation) mapping=(await resolveQualityRevision(projectId,mutation)).revision || undefined;
        if(mapping) {
          if(mapping.tower_id && mapping.inspection_stage && mapping.inspection_date) {
            const base=await ensureServerRevisionWorkspace({projectId,revisionId:mapping.id,revisionNumber:mapping.revision_number,towerId:mapping.tower_id,inspectionStage:mapping.inspection_stage,inspectionDate:mapping.inspection_date,notes:mapping.notes,clientInspector:mapping.client_inspector,clientCompany:mapping.client_company,clientReference:mapping.client_reference});
            found=await saveRevisionWorkspace({...base,clientMutationId:mutation,legacyRouteKeys:[...(base.legacyRouteKeys || []),routeRevisionId]});
            setWorkspace(found);
          }
          const cached=await cachedQualityRevisionDetail(projectId,mapping.id);
          const readable=cached?.value || (online?await refreshQualityRevisionDetail(projectId,mapping.id):null);
          if(readable) {found=await reconcileRevisionDetail(projectId,readable,routeRevisionId);setDetail(readable);}
        }
      }
      if(found?.cachedDetail && !serverRevision) setDetail(found.cachedDetail);

      if (!found && serverRevision) {
        found = await ensureServerRevisionWorkspace({
          projectId,
          revisionId: serverRevision.id,
          revisionNumber: serverRevision.revision_number,
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
        (found.serverRevisionId !== serverRevision.id || found.serverRevisionNumber !== serverRevision.revision_number)
      ) {
        found = touchWorkspace({
          ...found,
          serverRevisionId: serverRevision.id,
          serverRevisionNumber: serverRevision.revision_number,
        });
        await saveRevisionWorkspace(found);
      }

      setWorkspace(found);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Cached Rectification could not be refreshed.");
    } finally {
      setWorkspaceLoading(false);
    }
  }, [
    projectId,
    routeRevisionId,
    serverRevision,
    online,
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

    // Queue success, not the existence of an item row, confirms its photos synced.
    const syncedSomething = false;
    let nextWorkspace = workspace;

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
          leg: finding.leg, assignedFlag: finding.assignedFlag,
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
    if (syncing || !projectId) return;
    let active = true;
    void listRevisionWorkspaces(projectId).then(rows => {
      if (!active) return;
      const saved = rows.find(row => row.routeKey === routeRevisionId || row.serverRevisionId === routeRevisionId);
      if (saved) setWorkspace(saved);
    });
    return () => { active = false; };
  }, [syncing, projectId, routeRevisionId]);

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
      if(!workspace.cachedDetail || workspace.cachedDetail.revision.id!==serverRevision.id) return;
      void reconcileRevisionDetail(projectId,workspace.cachedDetail).then(() => {
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
    setFindingForm({...BLANK_FINDING,...nextFindingLocation(workspace?.workingLocation)});
    setFindingModalOpen(true);
  }

  async function keepLocation(field:"keepSegment"|"keepLeg",enabled:boolean) {
    if(!workspace)return;
    const location=savedFindingLocation({...workspace.workingLocation,keepSegment:workspace.workingLocation?.keepSegment ?? false,keepLeg:workspace.workingLocation?.keepLeg ?? false,segment:"",leg:null,[field]:enabled},findingForm.towerSegment,findingForm.leg);
    try {setWorkspace(await saveRevisionWorkspace(touchWorkspace({...workspace,workingLocation:location})));}
    catch(error){Alert.alert("Location preference was not saved",error instanceof Error?error.message:"Please retry.");}
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
        leg: findingForm.leg, assignedFlag: clean(findingForm.assignedFlag) || null,
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
        finalisedAt: null, finaliseRequested: false,
        workingLocation:savedFindingLocation(workspace.workingLocation,findingForm.towerSegment,findingForm.leg),
        findings: [...workspace.findings, pending],
      });

      await saveRevisionWorkspace(next);
      setWorkspace(next);

      await refreshSync(); if (online) void syncNow({ manual: false });
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
      const update: PendingRevisionUpdate = {
        leg: rectification.item.leg, assignedFlag: rectification.item.assigned_flag,
        itemId: rectification.item.id,
        rectificationComment:
          clean(
            rectification.rectificationComment,
          ),
        status: "Rectified",
        afterPhotos:
          rectification.afterPhotos,
        queuedAt: null,
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
      await refreshSync(); if (online) void syncNow({ manual: false });
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

  async function openLocalPhoto(photo: LocalQualityPhoto, phase: "BEFORE" | "AFTER") {
    try {
      const ready = await annotateQualityPhoto(photo,{ ...photo.watermarkContext, capturedAt:photo.capturedAt,timeZone:data?.project?.timezone,phase, reference: serverRevision?.revision_number || workspace?.serverRevisionNumber || photo.watermarkContext?.reference || "Pending RECT", tower: tower?.name || photo.watermarkContext?.tower });
      setPreview({ uri: await evidencePreviewUri(ready), name: photo.name });
    } catch(error) { Alert.alert("Could not open photo",error instanceof Error ? error.message : "Evidence annotation failed."); }
  }

  async function finalise() {
    if (!workspace) return;
    try {
      const ids = [workspace.routeKey, workspace.serverRevisionId];
      const unresolved = (await queueRows()).some(row => row.kind.startsWith("quality_") && row.kind !== "quality_revision_finalise" && ids.includes((row.payload as { revisionId?: string }).revisionId || ""));
      if (syncing || failedCount || unresolved || workspace.findings.length || workspace.pendingUpdates.length || !workspace.serverRevisionId || revisionItems.some(item=>!item.id || !item.fli_number)) {
        Alert.alert("Pending Quality changes", "Sync pending changes before finalising.");
        return;
      }
      const next = touchWorkspace({ ...workspace, finaliseRequested: true });
      await saveRevisionWorkspace(next); setWorkspace(next);
      await enqueue("quality_revision_finalise", { revisionId: workspace.serverRevisionId || workspace.routeKey, projectId: workspace.projectId }, `quality-finalise:${workspace.routeKey}`);
      await refreshSync(); if (online) await syncNow({ manual: false });
      const saved = (await listRevisionWorkspaces(workspace.projectId)).find(row => row.routeKey === workspace.routeKey);
      if (saved) setWorkspace(saved);
      Alert.alert(saved?.finalisedAt ? "Finalised" : "Pending sync", saved?.finalisedAt ? "Ready to submit for review." : "Finalisation will run after all findings and evidence sync.");
      if (online) await reloadDetail(true);
    } catch (error) { Alert.alert("Finalisation pending", error instanceof Error ? error.message : "Tap Sync now to retry."); }
  }

  function confirmDeleteFinding(label: string, itemId?: string, clientMutationId?: string) {
    Alert.alert(`Delete ${label}?`,"This will remove the flagged issue and its Before/After evidence.",[
      {text:"Cancel",style:"cancel"},
      {text:"Delete Flagged Issue",style:"destructive",onPress:()=>{ void (async()=>{
        try {
          if(syncing) throw new Error("Wait for sync to finish before deleting.");
          await deleteQualityFinding({projectId,routeKey:workspace?.routeKey || routeRevisionId,itemId,clientMutationId,confirm:label,online});
          setDetail(current=>{
            if(!current) return current;
            const removed=new Set(current.items.filter(item=>item.id===itemId || Boolean(clientMutationId && item.mobile_client_mutation_id===clientMutationId)).map(item=>item.id));
            return {...current,items:current.items.filter(item=>!removed.has(item.id)),files:current.files.filter(file=>!file.revision_item_id || !removed.has(file.revision_item_id))};
          });
          const saved=(await listRevisionWorkspaces(projectId)).find(row=>row.routeKey===workspace?.routeKey);
          if(saved) setWorkspace(saved);
          await refreshSync();if(online) await reloadDetail(true);
        }catch(error){Alert.alert("Finding was not deleted",error instanceof Error?error.message:"Please retry.");}
      })();}},
    ]);
  }

  async function submit() {
    if (!online) { Alert.alert("Connection required", "This action requires a connection."); return; }
    if (!serverRevision?.finalised_at && !workspace?.finalisedAt) { Alert.alert("Finalise first", "Finalise this Revision and wait for confirmation before submitting."); return; }
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

  const deleteLabel=serverRevision?rectCode:workspace?.serverRevisionNumber || "Pending Rectification";
  async function removeRectification() {
    if(deleteConfirmation!==deleteLabel || deleting || !can("mobile.rectifications"))return;
    setDeleting(true);
    try {
      const result=await deleteQualityRevision({projectId,routeKey:workspace?.routeKey || routeRevisionId,serverRevisionId:serverRevision?.id || workspace?.serverRevisionId,confirm:deleteConfirmation,online});
      await refreshSync();setDeleteOpen(false);
      router.replace("/(drawer)/revisions");
      if(result.warning)Alert.alert("Rectification deleted",result.warning);
    } catch(error) {
      Alert.alert("Rectification was not fully deleted",`${error instanceof Error?error.message:"Please retry."}\n\nIf deletion has started, pending changes stay paused. Retry Delete Rectification to finish safely.`);
      await refreshSync();
    } finally {setDeleting(false);}
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
        {can("mobile.rectifications") ? <Pressable accessibilityLabel="Rectification actions" style={{alignSelf:"flex-end",minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center"}} onPress={()=>Alert.alert("Rectification actions",deleteLabel,[{text:"Cancel",style:"cancel"},{text:"Delete Rectification",style:"destructive",onPress:()=>{setDeleteConfirmation("");setDeleteOpen(true);}}])}><Text style={{fontSize:24}}>⋮</Text></Pressable> : null}
        <Modal visible={deleteOpen} transparent onRequestClose={()=>{if(!deleting)setDeleteOpen(false);}}>
          <SafeAreaView style={{flex:1,backgroundColor:"rgba(0,0,0,0.65)",justifyContent:"center",padding:20}}>
            <View style={{backgroundColor:"white",padding:18,borderRadius:14,gap:12}}>
              <Text style={{fontSize:18,fontWeight:"800"}}>Delete {deleteLabel}?</Text>
              <Text>This will permanently remove this Rectification, all FLIs, Before/After evidence and generated PDFs.</Text>
              <Text>Type {deleteLabel} to confirm.</Text>
              <TextInput accessibilityLabel="Rectification delete confirmation" editable={!deleting} value={deleteConfirmation} onChangeText={setDeleteConfirmation} autoCapitalize="none" style={[styles.input,{minHeight:44}]} />
              <Pressable disabled={deleting || deleteConfirmation!==deleteLabel} onPress={()=>void removeRectification()} style={{minHeight:44,backgroundColor:deleteConfirmation===deleteLabel?"#be123c":"#cbd5e1",justifyContent:"center",alignItems:"center",borderRadius:10}}><Text style={{color:"white",fontWeight:"800"}}>{deleting?"Deleting...":"Delete Rectification"}</Text></Pressable>
              <Pressable disabled={deleting} onPress={()=>setDeleteOpen(false)} style={{minHeight:44,justifyContent:"center",alignItems:"center"}}><Text>Cancel</Text></Pressable>
            </View>
          </SafeAreaView>
        </Modal>
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

      <Pressable style={[styles.addFinding, { backgroundColor: "#047857" }]} onPress={() => void finalise()}><Text style={styles.addFindingText}>{workspace?.finalisedAt || serverRevision?.finalised_at ? "Finalised - ready to submit" : workspace?.finaliseRequested ? "Pending sync - Finalise when synced" : online ? "Finalise Rectification" : "Finalise when synced"}</Text></Pressable>
      <Pressable style={styles.addFinding} onPress={() => void syncNow()}><Text style={styles.addFindingText}>Sync now</Text></Pressable>
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
            <Pressable accessibilityLabel="Finding actions" hitSlop={8} style={{alignSelf:"flex-end",minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center"}} onPress={()=>confirmDeleteFinding("pending FLI",undefined,finding.clientMutationId)}><Text style={{fontSize:24}}>⋯</Text></Pressable>
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
                finding.leg && `Leg ${finding.leg}`, finding.assignedFlag && `Flag ${finding.assignedFlag}`,
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
                      openLocalPhoto(photo, "BEFORE")
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
                      openLocalPhoto(photo, "AFTER")
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
            <Pressable accessibilityLabel={`${fli} actions`} hitSlop={8} style={{alignSelf:"flex-end",minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center"}} onPress={()=>confirmDeleteFinding(fli,item.id,item.mobile_client_mutation_id || undefined)}><Text style={{fontSize:24}}>⋯</Text></Pressable>
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
                item.leg && `Leg ${item.leg}`, item.assigned_flag && `Flag ${item.assigned_flag}`,
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
                      openLocalPhoto(photo, "AFTER")
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
            <QualityLegField value={findingForm.leg} onChange={leg => setFindingForm(current => ({ ...current, leg }))} />
            <KeepLocationControl label="Keep Leg for next FLI" checked={workspace?.workingLocation?.keepLeg ?? false} onChange={checked=>void keepLocation("keepLeg",checked)} />
            <Text style={styles.label}>Assigned Flag (optional)</Text>
            <TextInput style={styles.input} value={findingForm.assignedFlag} onChangeText={assignedFlag => setFindingForm(current => ({ ...current, assignedFlag }))} />
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
              segmentFooter={<KeepLocationControl label="Keep Tower Segment for next FLI" checked={workspace?.workingLocation?.keepSegment ?? false} onChange={checked=>void keepLocation("keepSegment",checked)} />}
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
              context={{ timeZone:data?.project?.timezone,project:data?.project?.project_number, Tower: tower?.name || towerId, Revision: serverRevision?.revision_number || workspace?.serverRevisionNumber || serverRevision?.fli_number || "Pending RECT", "FLI #": "Pending FLI", Flag: findingForm.assignedFlag, Issue: selectedIssueLabel, Leg: findingForm.leg, Segment: findingForm.towerSegment, Member: findingForm.memberNumber, Drawing: findingForm.drawingNumber }}
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
              context={{ timeZone:data?.project?.timezone,project:data?.project?.project_number, Tower: tower?.name || towerId, Revision: serverRevision?.revision_number || workspace?.serverRevisionNumber || serverRevision?.fli_number || "Pending RECT", "FLI #": "Pending FLI", Flag: findingForm.assignedFlag, Issue: selectedIssueLabel, Leg: findingForm.leg, Segment: findingForm.towerSegment, Member: findingForm.memberNumber, Drawing: findingForm.drawingNumber }}
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
              <QualityLegField value={rectification.item.leg} onChange={leg => setRectification(current => current ? { ...current, item: { ...current.item, leg } } : current)} />
              <Text style={styles.label}>Assigned Flag</Text><TextInput style={styles.input} value={rectification.item.assigned_flag || ""} onChangeText={assigned_flag => setRectification(current => current ? { ...current, item: { ...current.item, assigned_flag } } : current)} />
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
                context={{ timeZone:data?.project?.timezone,project:data?.project?.project_number, Tower: tower?.name || towerId, Revision: serverRevision?.revision_number || workspace?.serverRevisionNumber || serverRevision?.fli_number || "Pending RECT", "FLI #": clean(rectification.item.fli_number) || "Pending FLI", Flag: rectification.item.assigned_flag, Issue: data?.issueTypes.find(issue => issue.id === rectification.item.issue_type_id)?.name || rectification.item.other_issue_text, Leg: rectification.item.leg, Segment: rectification.item.tower_segment, Member: rectification.item.member_number, Drawing: rectification.item.drawing_number }}
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

function KeepLocationControl({label,checked,onChange}:{label:string;checked:boolean;onChange:(checked:boolean)=>void}) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{checked}} accessibilityLabel={label} onPress={()=>onChange(!checked)} style={{minHeight:44,flexDirection:"row",alignItems:"center",gap:8}}>
    <Text style={{fontSize:18,color:checked?"#047857":"#64748b"}}>{checked?"☑":"☐"}</Text>
    <Text style={{fontSize:12,color:"#475569",flex:1,flexShrink:1}}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0, flexShrink: 1 },
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
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 16,
  },
  fli: {
    flexShrink: 1,
    minWidth: 0,
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
    flexShrink: 1,
    minWidth: 0,
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 13,
  },
  meta: {
    flexShrink: 1,
    minWidth: 0,
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  notes: {
    flexShrink: 1,
    minWidth: 0,
    color: "#475569",
    fontSize: 13,
    lineHeight: 19,
  },
  finding: {
    flexShrink: 1,
    minWidth: 0,
    color: "#334155",
    fontSize: 13,
    lineHeight: 19,
  },
  rectificationText: {
    flexShrink: 1,
    minWidth: 0,
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
    minWidth: 0,
    flexShrink: 1,
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
    flexShrink: 1,
    minWidth: 0,
    color: "#fff",
    fontSize: 12,
    marginTop: 12,
  },
});

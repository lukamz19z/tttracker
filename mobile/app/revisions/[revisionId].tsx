import { FieldFindingCard } from "@/components/quality/FieldFindingCard";
import { deleteLocalQualityPhoto } from "@/lib/offline/quality-photo-deletion";
import { QualitySwipeViewer, type GalleryPhoto } from "@/components/quality/QualityEvidenceGallery";
import { fieldListRows, filterFieldRows, groupFieldRows, fieldStateKey } from "../../../lib/quality/field-list";
import { materialRequirements, operationalDetailSummary, validateDetailValues, EMPTY_DETAIL_SCHEMA, type DetailValues } from "../../../lib/quality/operational-details";
import { OperationalDetailFields } from "@/components/quality/OperationalDetailFields";
import { FieldListControls } from "@/components/quality/FieldListControls";
import { useQualityFieldState } from "@/lib/quality-field-state";
import { evidencePreviewUri } from "@/lib/quality-evidence";
import { cachedQualityOfflinePack, cleanupExpiredQualityOfflinePacks, offlineQualityStorage, prepareQualityOfflinePack, qualityOfflineSettings, removeSafeQualityOfflinePack, saveQualityOfflineSettings, type QualityOfflinePack, type QualityOfflineSettings } from "@/lib/offline/quality-offline-packs";
import { deleteQualityFinding, deleteQualityRevision } from "@/lib/offline/quality-deletion";
import { useAccess } from "@/lib/access";
import { qualityTowerDisplay } from "../../../lib/quality/tower-label";
import { SafeAreaView } from "react-native-safe-area-context";
import { QualityLegField } from "@/components/quality/QualityLegField";
import { nextFindingLocation, savedFindingLocation } from "@/lib/offline/revision-location";
import { enqueue, queueRows,getCache } from "@/lib/offline/db";

import { useLocalSearchParams, router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import {
  Camera,
  ChevronDown,
  Plus,
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
  Switch,
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
  refreshQualityMemberCatalog,
  refreshQualityRevisionDetail,
  resolveQualityRevision,
  submitRevisionForReview,
  type QualityMemberCatalogRow,
} from "@/lib/api/quality";
import {
  enqueueRevisionItemCreate,
  type OfflineRevisionItemUpdate,
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
  return `${match[3]}/${match[2]}/${match[1]}`;
}

type FindingForm = {
  operationalDetails: DetailValues;
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
  operationalDetails: {},
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
  const [queuedEdits, setQueuedEdits] = useState<OfflineRevisionItemUpdate[]>([]);
  const [deleteOpen,setDeleteOpen]=useState(false);
  const [deleteConfirmation,setDeleteConfirmation]=useState("");
  const [deleting,setDeleting]=useState(false);
  const { profile } = useAuth();
  const { online, syncing, failedCount, pendingCount, syncNow, refresh: refreshSync } = useSync();

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

  const [localGallery,setLocalGallery]=useState<{photos:GalleryPhoto[];index:number}|null>(null);

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
  const [offlinePack,setOfflinePack]=useState<QualityOfflinePack|null>(null);
  const [offlineSettings,setOfflineSettings]=useState<QualityOfflineSettings|null>(null);
  const [offlineStorage,setOfflineStorage]=useState<{packs:QualityOfflinePack[];bytes:number;megabytes:number}>({packs:[],bytes:0,megabytes:0});
  const [offlinePackBusy,setOfflinePackBusy]=useState(false);
  const [offlineOptionsExpanded,setOfflineOptionsExpanded]=useState(false);
  const [offlineStorageOpen,setOfflineStorageOpen]=useState(false);

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
    () => (detail?.items ?? []).filter(item=>!workspace?.findings.some(finding=>item.mobile_client_mutation_id===finding.clientMutationId || workspace.serverItems?.[finding.clientMutationId]?.id===item.id)),
    [detail?.items,workspace],
  );

  const revisionFiles = useMemo(
    () => detail?.files ?? [],
    [detail?.files],
  );

  const fieldState = useQualityFieldState(fieldStateKey(profile?.userId || "", projectId, routeRevisionId));
  const pendingFieldItems = useMemo(() => (workspace?.findings || []).map(finding => ({
    id: finding.clientMutationId, status: finding.status, fli_number: workspace?.serverItems?.[finding.clientMutationId]?.fli_number || "Pending FLI", source_type: "manual", issue_type_id: finding.issueTypeId === "__other__" ? null : finding.issueTypeId, other_issue_text: finding.otherIssueText, tower_segment: finding.towerSegment, member_number: finding.memberNumber, leg: finding.leg, assigned_flag: finding.assignedFlag, finding: finding.finding, rectification_comment: finding.rectificationComment, operational_details: finding.operationalDetails,
  })), [workspace]);
  const fieldRows = useMemo(() => {
    const items = revisionItems.map(item => {
      const pending = queuedEdits.filter(edit=>edit.itemId===item.id).at(-1);
      return pending ? { ...item, status: pending.status, operational_details: pending.operationalDetails ?? item.operational_details, issue_type_id: pending.issueTypeId === undefined ? item.issue_type_id : pending.issueTypeId, rectification_comment: pending.rectificationComment, pendingSync: true } : item;
    });
    const localFiles = [...(workspace?.findings || []).flatMap(finding=>[...finding.beforePhotos.map(()=>({revision_item_id:finding.clientMutationId,file_role:"before_photo"})),...finding.afterPhotos.map(()=>({revision_item_id:finding.clientMutationId,file_role:"after_photo"}))]), ...queuedEdits.flatMap(edit=>[...(edit.beforePhotos || []).map(()=>({revision_item_id:edit.itemId,file_role:"before_photo"})),...edit.afterPhotos.map(()=>({revision_item_id:edit.itemId,file_role:"after_photo"}))])];
    return fieldListRows([...items, ...pendingFieldItems], data?.issueTypes || [], [...revisionFiles, ...localFiles]);
  }, [revisionItems, data?.issueTypes, revisionFiles, pendingFieldItems, workspace, queuedEdits]);
  const filteredRows = useMemo(() => filterFieldRows(fieldRows, fieldState.state), [fieldRows, fieldState.state]);
  const fieldGroups = useMemo(() => groupFieldRows(filteredRows.filter(row=>!pendingFieldItems.some(item=>item.id===row.item.id)), fieldState.state.group), [filteredRows, fieldState.state.group, pendingFieldItems]);
  const requirements = useMemo(() => materialRequirements(filteredRows.map(row => row.item), data?.issueTypes || []), [filteredRows, data?.issueTypes]);

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
    async () => {
      if (!projectId || !canonicalRevisionId) {
        return;
      }

      const queued = await queueRows();
      setQueuedEdits(queued.filter(row=>row.kind==="quality_revision_item_update" && (row.payload as OfflineRevisionItemUpdate).revisionId===canonicalRevisionId).map(row=>row.payload as OfflineRevisionItemUpdate));
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
          if(cached.value.revision.source_type==="punchlist"){
            setOfflinePack(await cachedQualityOfflinePack(projectId,canonicalRevisionId));
          }
        }

        if (online) {
          const latest =
            await refreshQualityRevisionDetail(
              projectId,
              canonicalRevisionId,
            );
          setDetail(latest);
          if(latest.revision.source_type==="punchlist")void prepareQualityOfflinePack({projectId,revisionId:canonicalRevisionId,detail:latest,onProgress:setOfflinePack}).then(setOfflinePack).catch(()=>undefined);
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

  useFocusEffect(useCallback(()=>{void reloadDetail();},[reloadDetail]));

  useEffect(()=>{if(!projectId)return;let active=true;void Promise.all([qualityOfflineSettings(projectId),offlineQualityStorage(projectId)]).then(([settings,storage])=>{if(active){setOfflineSettings(settings);setOfflineStorage(storage);}}).catch(()=>undefined);return()=>{active=false;};},[projectId,offlinePack]);

  useEffect(()=>{if(!projectId || !online)return;void cleanupExpiredQualityOfflinePacks(projectId).then(()=>offlineQualityStorage(projectId)).then(setOfflineStorage).catch(()=>undefined);},[online,projectId]);

  const prepareOfflinePack=useCallback(async(explicit:boolean)=>{
    if(!projectId || !canonicalRevisionId || !detail)return;
    setOfflinePackBusy(true);
    try{const pack=await prepareQualityOfflinePack({projectId,revisionId:canonicalRevisionId,detail,explicit,onProgress:setOfflinePack});setOfflinePack(pack);setOfflineStorage(await offlineQualityStorage(projectId));}
    catch(error){Alert.alert("Offline pack could not be prepared",error instanceof Error?error.message:"Retry while connected.");}
    finally{setOfflinePackBusy(false);}
  },[canonicalRevisionId,detail,projectId]);

  async function removeOfflinePack(revisionId:string){try{await removeSafeQualityOfflinePack(projectId,revisionId);setOfflineStorage(await offlineQualityStorage(projectId));if(revisionId===canonicalRevisionId)setOfflinePack(null);}catch(error){Alert.alert("Offline pack protected",error instanceof Error?error.message:"Queued work must sync before removal.");}}

  useEffect(() => {
    const wasSyncing = wasSyncingRef.current;
    wasSyncingRef.current = syncing;

    if (
      wasSyncing &&
      !syncing &&
      online &&
      canonicalRevisionId
    ) {
      void reloadDetail();
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

  useEffect(()=>{
    let active=true;
    const read=()=>{void listRevisionWorkspaces(projectId).then(rows=>{
      const next=rows.find(row=>row.routeKey===routeRevisionId || row.serverRevisionId===routeRevisionId || row.legacyRouteKeys?.includes(routeRevisionId));
      if(active && next)setWorkspace(next);
    }).catch(()=>undefined);};
    read();
    const timer=syncing?setInterval(read,500):null;
    return ()=>{active=false;if(timer)clearInterval(timer);};
  },[syncing,projectId,routeRevisionId]);

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
          operationalDetails: finding.operationalDetails,
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

    const detailError = validateDetailValues(data?.issueTypes.find(issue=>issue.id===findingForm.issueTypeId)?.detail_schema || EMPTY_DETAIL_SCHEMA, findingForm.operationalDetails);
    if (detailError) return Alert.alert("Check operational details", detailError);
    setFindingSaving(true);

    try {
      const pending = createPendingFinding({
        operationalDetails: findingForm.operationalDetails,
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
        status: "Open",
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

    if (!rectification.afterPhotos.length && !(detail?.files || []).some(file=>file.revision_item_id===rectification.item.id && file.file_role==="after_photo")) {
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
        expectedVersion: rectification.item.record_version,
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

  async function openLocalPhoto(photo:LocalQualityPhoto,phase:"BEFORE"|"AFTER") {
    try {
      const finding=workspace?.findings.find(row=>[...row.beforePhotos,...row.afterPhotos].some(value=>value.id===photo.id));
      const update=workspace?.pendingUpdates.find(row=>row.afterPhotos.some(value=>value.id===photo.id));
      const before=finding?.beforePhotos || [],after=finding?.afterPhotos || update?.afterPhotos || (phase==="AFTER"?[photo]:[]);
      const combined=[...(before.length?before:phase==="BEFORE"?[photo]:[]).map(row=>({photo:row,role:"before_photo"})),...after.map(row=>({photo:row,role:"after_photo"}))];
      const photos:GalleryPhoto[]=[];for(const value of combined)photos.push({id:value.photo.id,role:value.role,uri:await evidencePreviewUri(value.photo)});
      setLocalGallery({photos,index:photos.findIndex(row=>row.id===photo.id)});
    }catch(error){Alert.alert("Photo unavailable",error instanceof Error?error.message:"Retry this photo.");}
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
      if (online) await reloadDetail();
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
          await refreshSync();if(online) await reloadDetail();
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

      await reloadDetail();
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
      compactHeader
      title={rectCode}
      virtualRows={fieldGroups.flatMap(group => [
        { id: `group:${group.label}`, content: <Text style={styles.title}>{group.label} · {group.rows.length}</Text> },
        ...group.rows.map(row => ({ id: row.item.id, content: <FieldFindingCard row={row} issueTypes={data?.issueTypes||[]} locked={Boolean(serverRevision?.finalised_at) || ["Ready for Review", "Closed"].includes(serverRevision?.status || "")} onOpen={()=>router.push(`/revisions/${encodeURIComponent(serverRevision?.id || routeRevisionId)}/${encodeURIComponent(row.item.id)}`)} onActions={()=>confirmDeleteFinding(row.item.fli_number || "Finding",row.item.id,revisionItems.find(item=>item.id===row.item.id)?.mobile_client_mutation_id || undefined)}/> })),
      ])}
      subtitle={[qualityTowerDisplay(tower?.name,workspace?.towerLabel,detail?.towerLabel),clean(serverRevision?.client_reference||workspace?.clientReference)?`Punchlist ${clean(serverRevision?.client_reference||workspace?.clientReference)}`:null,`${revisionItems.length+pendingFindingCount} FLI${revisionItems.length+pendingFindingCount===1?"":"s"}`,online?"Online":"Offline"].filter(Boolean).join(" · ")}
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
              {qualityTowerDisplay(tower?.name,workspace?.towerLabel,detail?.towerLabel)}
            </Text>
            <Text style={styles.meta}>
              {prettyDate(
                serverRevision?.inspection_date ??
                  workspace?.inspectionDate,
              )}{" "}
              ·{" "}
              {serverRevision?.source_type==="punchlist"?`Punchlist ${clean(serverRevision.client_reference||workspace?.clientReference)}`.trim():clean(serverRevision?.inspection_stage??workspace?.inspectionStage)}
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

      <View style={{gap:6,paddingVertical:2}}>
        <Pressable accessibilityRole="button" style={styles.addIssuePrimary} onPress={openAddFinding}><Plus size={19} color="#fff"/><Text style={styles.addIssuePrimaryText}>Add Flagged Issue</Text></Pressable>
        <View style={{flexDirection:"row",alignItems:"center",gap:6}}>
          <Pressable accessibilityRole="button" style={[styles.compactAction,{backgroundColor:failedCount?"#fef2f2":pendingCount?"#fffbeb":"#ecfdf5",borderColor:failedCount?"#fecaca":pendingCount?"#fde68a":"#bbf7d0"}]} onPress={()=>void syncNow().then(()=>reloadDetail())}><Text style={{fontSize:11,fontWeight:"800",color:failedCount?"#b91c1c":pendingCount?"#92400e":"#166534"}}>{syncing?"Syncing…":failedCount?`Retry ${failedCount}`:pendingCount?`Sync ${pendingCount}`:"✓ Synced"}</Text></Pressable>
          {serverRevision&&!['Ready for Review','Closed'].includes(serverRevision.status)?<Pressable accessibilityRole="button" disabled={submitBusy} style={[styles.compactAction,{backgroundColor:"#eff6ff",borderColor:"#bfdbfe",opacity:submitBusy?0.65:1}]} onPress={()=>void submit()}><Text style={{fontSize:11,fontWeight:"800",color:"#1d4ed8"}}>{submitBusy?"Sending…":"Submit Review"}</Text></Pressable>:null}
          <Pressable accessibilityRole="button" style={[styles.compactAction,{backgroundColor:"#f1f5f9",borderColor:"#e2e8f0"}]} onPress={()=>Alert.alert("Rectification actions",workspace?.finalisedAt||serverRevision?.finalised_at?"This Rectification is finalised.":"Finalise the Rectification when field work is complete.",[{text:"Cancel",style:"cancel"},{text:workspace?.finalisedAt||serverRevision?.finalised_at?"Done":"Finalise",onPress:()=>{if(!workspace?.finalisedAt&&!serverRevision?.finalised_at)void finalise();}}])}><Text style={{fontSize:11,fontWeight:"800",color:"#475569"}}>More</Text></Pressable>
        </View>
      </View>

      {workspace?.findings.filter(finding=>serverRevision?.source_type!=="punchlist" || filteredRows.some(row=>row.item.id===finding.clientMutationId)).map(
        (finding) => (
          <View
            key={finding.clientMutationId}
            style={styles.card}
          >
            <Pressable accessibilityLabel="Finding actions" hitSlop={8} style={{alignSelf:"flex-end",minHeight:44,minWidth:44,alignItems:"center",justifyContent:"center"}} onPress={()=>confirmDeleteFinding("pending FLI",undefined,finding.clientMutationId)}><Text style={{fontSize:24}}>⋯</Text></Pressable>
            <View style={styles.head}>
              <View>
                <Text style={styles.fli}>
                  {workspace?.serverItems?.[finding.clientMutationId]?.fli_number || "Pending FLI"}
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

            {operationalDetailSummary(data?.issueTypes.find(type=>type.id===finding.issueTypeId)?.detail_schema,finding.operationalDetails)?<Text style={[styles.meta,{color:"#1e3a8a",fontWeight:"800"}]}>{operationalDetailSummary(data?.issueTypes.find(type=>type.id===finding.issueTypeId)?.detail_schema,finding.operationalDetails)}</Text>:null}

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

      {serverRevision?.source_type === "punchlist" ? <View style={[styles.card,{padding:9,gap:5}]}>
          <View style={{flexDirection:"row",alignItems:"center",gap:8}}><View style={styles.grow}><Text style={{fontSize:12,fontWeight:"900",color:offlinePack?.status==="ready"?"#166534":"#334155"}}>{offlinePack?.status==="ready"?"✓ Available Offline":offlinePack?.status==="preparing"?`Preparing offline · ${offlinePack.previews?Math.floor(offlinePack.cachedPreviews/offlinePack.previews*100):100}%`:"Offline pack preparing"}</Text><Text style={styles.meta}>{offlinePack?.status==="ready"?`${offlinePack.findings} findings · ${offlinePack.previews} photos · ${offlineStorage.megabytes} MB cached`:offlinePack?`${offlinePack.cachedFindings}/${offlinePack.findings} findings · ${offlinePack.cachedPreviews}/${offlinePack.previews} photos`:"Punchlist details and supplied Before previews"}</Text></View><Pressable onPress={()=>setOfflineStorageOpen(true)} style={{minHeight:36,paddingHorizontal:10,justifyContent:"center"}}><Text style={{fontSize:11,fontWeight:"800",color:"#334155"}}>Manage</Text></Pressable></View>
          {offlinePack?.failedFileIds.length? <Pressable disabled={!online||offlinePackBusy} onPress={()=>void prepareOfflinePack(true)}><Text style={{fontSize:11,fontWeight:"800",color:"#b45309"}}>Retry {offlinePack.failedFileIds.length} photos</Text></Pressable>:null}
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><Pressable onPress={()=>setOfflineOptionsExpanded(value=>!value)}><Text style={{fontSize:10,fontWeight:"700",color:"#64748b"}}>Offline settings {offlineOptionsExpanded?"⌃":"⌄"}</Text></Pressable><Pressable disabled={!online||offlinePackBusy} onPress={()=>void prepareOfflinePack(true)}><Text style={{fontSize:10,fontWeight:"800",color:online?"#1d4ed8":"#94a3b8"}}>{offlinePack?.status==="ready"?"Refresh":"Download"}</Text></Pressable></View>
          {offlineOptionsExpanded&&offlineSettings?<View style={{gap:3,borderTopWidth:1,borderTopColor:"#e2e8f0",paddingTop:5}}><View style={styles.head}><Text style={styles.meta}>Auto-cache on open</Text><Switch value={offlineSettings.autoCacheOnOpen&&!offlineSettings.manualOnly} onValueChange={value=>{const next={autoCacheOnOpen:value,manualOnly:!value};setOfflineSettings({...offlineSettings,...next});void saveQualityOfflineSettings(projectId,next);}}/></View><View style={styles.head}><Text style={styles.meta}>Wi-Fi only</Text><Switch value={offlineSettings.wifiOnly} onValueChange={value=>{setOfflineSettings({...offlineSettings,wifiOnly:value});void saveQualityOfflineSettings(projectId,{wifiOnly:value});}}/></View><Pressable onPress={()=>setOfflineStorageOpen(true)}><Text style={styles.meta}>Storage · {offlineStorage.packs.length} cached Punchlists · {offlineStorage.megabytes} MB · Manage</Text></Pressable></View>:null}
        </View> : null}
        <FieldListControls rows={fieldRows} state={fieldState.state} onChange={fieldState.update} disabled={!fieldState.ready} sections={Array.from(new Set([...memberCatalog.map(member=>member.towerSegment || ""),...fieldRows.map(row=>row.section)].filter(Boolean)))} issueTypes={(data?.issueTypes || []).filter(issue=>["revision","both"].includes(issue.applies_to))}/>
        {fieldState.error ? <Text style={styles.notes}>{fieldState.error}</Text> : null}
        <View style={[styles.card,{padding:9,gap:4}]}>
          <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8}}><Text style={styles.issueName}>Materials · {filteredRows.length} filtered FLIs</Text><Text style={styles.meta}>{revisionItems.filter(item=>["Rectified","Verified"].includes(item.status)).length}/{revisionItems.length} rectified</Text></View>
          {requirements.rows.map(row=><Text key={`${row.label}:${row.action}`} style={[styles.finding,{fontSize:12,fontWeight:"800"}]}>{row.quantity} × {row.label}{row.action ? ` · ${row.action}` : ""}</Text>)}
          {!requirements.rows.length ? <Text style={styles.meta}>No structured material requirements in this filter.</Text> : null}
          {requirements.incomplete ? <Text style={[styles.notes,{fontSize:11}]}>{requirements.incomplete} incomplete detail set(s) excluded.</Text> : null}
        </View>
        {!filteredRows.length ? <Text style={styles.notes}>No FLIs match these filters.</Text> : null}
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
                Add Manual FLI
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

            <OperationalDetailFields schema={data?.issueTypes.find(issue=>issue.id===findingForm.issueTypeId)?.detail_schema} values={findingForm.operationalDetails} onChange={operationalDetails=>setFindingForm(current=>({...current,operationalDetails}))}/>
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
                  Rectification comment (optional)
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
                Rectification comment (optional)
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
                  Save &amp; Mark Rectified
                </Text>
              </Pressable>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>

      <Modal visible={offlineStorageOpen} transparent animationType="slide" onRequestClose={()=>setOfflineStorageOpen(false)}><SafeAreaView style={{flex:1,justifyContent:"center",padding:16,backgroundColor:"rgba(15,23,42,0.55)"}}><View style={[styles.card,{maxHeight:"80%"}]}><Text style={styles.issueName}>Offline Storage</Text><Text style={styles.meta}>{offlineStorage.packs.length} cached Punchlists · approximately {offlineStorage.megabytes} MB</Text>{offlineSettings?<><Text style={styles.meta}>Maximum cache size (MB)</Text><TextInput keyboardType="number-pad" value={String(offlineSettings.maxCacheMb)} onChangeText={value=>setOfflineSettings({...offlineSettings,maxCacheMb:Number(value)||64})} onEndEditing={()=>void saveQualityOfflineSettings(projectId,{maxCacheMb:offlineSettings.maxCacheMb})} style={styles.input}/><Text style={styles.meta}>Completed pack retention (days)</Text><TextInput keyboardType="number-pad" value={String(offlineSettings.completedRetentionDays)} onChangeText={value=>setOfflineSettings({...offlineSettings,completedRetentionDays:Number(value)||1})} onEndEditing={()=>void saveQualityOfflineSettings(projectId,{completedRetentionDays:offlineSettings.completedRetentionDays})} style={styles.input}/><Text style={styles.meta}>Preview JPEG quality · {offlineSettings.previewQuality}</Text><TextInput keyboardType="number-pad" value={String(offlineSettings.previewQuality)} onChangeText={value=>setOfflineSettings({...offlineSettings,previewQuality:Number(value)||60})} onEndEditing={()=>void saveQualityOfflineSettings(projectId,{previewQuality:offlineSettings.previewQuality})} style={styles.input}/><View style={styles.head}><Text style={styles.meta}>Cache supplied Before previews</Text><Switch value={offlineSettings.cacheBeforePreviews} onValueChange={value=>{setOfflineSettings({...offlineSettings,cacheBeforePreviews:value});void saveQualityOfflineSettings(projectId,{cacheBeforePreviews:value});}}/></View></>:null}<ScrollView>{offlineStorage.packs.map(pack=><View key={pack.revisionId} style={[styles.head,{paddingVertical:8}]}><View style={styles.grow}><Text style={styles.meta}>{pack.revisionId}</Text><Text style={styles.meta}>{pack.cachedFindings}/{pack.findings} findings · {pack.cachedPreviews}/{pack.previews} previews · {pack.status}</Text></View><Pressable disabled={pack.status!=="ready"} onPress={()=>void removeOfflinePack(pack.revisionId)} style={{padding:8,opacity:pack.status==="ready"?1:0.4}}><Text style={styles.notes}>Remove</Text></Pressable></View>)}</ScrollView><Pressable style={styles.addFinding} onPress={()=>setOfflineStorageOpen(false)}><Text style={styles.addFindingText}>Close</Text></Pressable></View></SafeAreaView></Modal>
      {localGallery?<QualitySwipeViewer photos={localGallery.photos} initialIndex={localGallery.index} onDelete={id=>{const photo=[...(workspace?.findings.flatMap(row=>[...row.beforePhotos,...row.afterPhotos]) || []),...(workspace?.pendingUpdates.flatMap(row=>row.afterPhotos) || [])].find(row=>row.id===id);if(photo)void deleteLocalQualityPhoto(photo).then(async()=>{setLocalGallery(null);await reloadDetail();await refreshSync();}).catch(error=>Alert.alert("Photo deletion failed",String(error)));}} onClose={()=>setLocalGallery(null)}/>:null}
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
    padding: 10,
    gap: 5,
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 11,
    gap: 6,
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
  addIssuePrimary:{minHeight:50,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:8,backgroundColor:"#1d4ed8",borderRadius:13,paddingHorizontal:16},
  addIssuePrimaryText:{color:"#fff",fontWeight:"900",fontSize:15},
  compactAction:{minHeight:36,borderWidth:1,borderRadius:18,paddingHorizontal:11,alignItems:"center",justifyContent:"center"},
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

import { OperationalDetailFields } from "@/components/quality/OperationalDetailFields";
import { QualitySelector } from "@/components/quality/QualitySelector";
import { validateDetailValues, EMPTY_DETAIL_SCHEMA, operationalDetailSummary, type DetailValues } from "../../../../lib/quality/operational-details";
import { findingReadiness } from "../../../../lib/quality/finding-readiness";
import { sourceDateDisplay } from "../../../../lib/quality/punchlist-import-values";
import { qualityDisplayName } from "../../../../lib/quality/display-name";
import { useFocusEffect } from "@react-navigation/native";
import { QualityEvidenceGallery } from "@/components/quality/QualityEvidenceGallery";
import { router, type Href, useLocalSearchParams } from "expo-router";
import {
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { QualityPhotoPicker } from "@/components/quality/QualityPhotoPicker";
import {
  QualityShell,
  qualityStyles as q,
} from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import {
  cachedQualityRevisionDetail,
  refreshQualityRevisionDetail,
} from "@/lib/api/quality";
import { enqueueRevisionItemUpdate } from "@/lib/offline/quality-sync";
import type { OfflineRevisionItemUpdate } from "@/lib/offline/quality-sync";
import { queueRows } from "@/lib/offline/db";
import type { LocalQualityPhoto } from "@/types/quality";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export default function RevisionItemScreen() {
  const { revisionId, itemId } =
    useLocalSearchParams<{
      revisionId: string;
      itemId: string;
    }>();

  const { data } = useQuality();
  const { profile } = useAuth();
  const { online, syncNow, syncing } = useSync();

  const projectId =
    clean(data?.projectId) ||
    clean(profile?.projectId);

  const [detail, setDetail] = useState<
    Awaited<
      ReturnType<
        typeof refreshQualityRevisionDetail
      >
    > | null
  >(null);
  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (!projectId || !revisionId) return;

    let active = true;
    setLoading(true);

    void (async () => {
      try {
        const cached =
          await cachedQualityRevisionDetail(
            projectId,
            revisionId,
          );

        if (active && cached?.value) {
          setDetail(cached.value);
        }

        if (online) {
          const live =
            await refreshQualityRevisionDetail(
              projectId,
              revisionId,
            );
          if (active) setDetail(live);
        }
      } catch (error) {
        console.warn(
          "Revision finding could not be loaded",
          error,
        );
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [online, projectId, revisionId, syncing]);

  const revision = detail?.revision ?? null;
  const item =
    detail?.items.find(
      (row) =>
        row.id === itemId &&
        row.revision_id === revisionId,
    ) ?? null;

  const tower =
    data?.towers.find(
      (row) => row.id === revision?.tower_id,
    ) ?? null;

  const issue =
    data?.issueTypes.find(
      (row) =>
        row.id === item?.issue_type_id,
    ) ?? null;

  const files = useMemo(
    () =>
      (detail?.files ?? []).filter(
        (row) =>
          row.revision_item_id === itemId &&
          ["before_photo", "after_photo"].includes(
            row.file_role,
          ),
      ),
    [detail?.files, itemId],
  );

  const afterFiles = files.filter(
    (row) => row.file_role === "after_photo",
  );

  const [comment, setComment] = useState("");
  const [operationalDetails, setOperationalDetails] = useState<DetailValues>({});
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [issuePickerOpen, setIssuePickerOpen] = useState(false);
  const [beforePhotos, setBeforePhotos] = useState<LocalQualityPhoto[]>([]);
  const [hasPendingEdit, setHasPendingEdit] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);
  const selectedIssue = data?.issueTypes.find(row=>row.id===selectedIssueId);
  const locked = hasPendingEdit || !editLoaded || Boolean(revision?.finalised_at) || !["Draft", "Open", "In Progress"].includes(revision?.status || "") || item?.status === "Verified";
  const [editVersion,setEditVersion]=useState<number|undefined>();
  const dirty=useRef(false);
  useFocusEffect(useCallback(()=>{if(online)void refreshQualityRevisionDetail(projectId,revisionId).then(setDetail).catch(()=>undefined);},[online,projectId,revisionId]));
  const [afterPhotos, setAfterPhotos] =
    useState<LocalQualityPhoto[]>([]);
  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    let active = true;
    if (item && !dirty.current) void queueRows().then(rows => {
      if (!active || dirty.current) return;
      const pending = rows.filter(row=>row.kind==="quality_revision_item_update" && (row.payload as OfflineRevisionItemUpdate).itemId===item.id).at(-1)?.payload as OfflineRevisionItemUpdate | undefined;
      setHasPendingEdit(Boolean(pending));
      setEditVersion(pending?.expectedVersion ?? item.record_version);
      setOperationalDetails(pending?.operationalDetails ?? item.operational_details ?? {});
      setSelectedIssueId(pending?.issueTypeId === undefined ? item.issue_type_id : pending.issueTypeId);
      setComment(pending?.rectificationComment ?? item.rectification_comment ?? "");
      setBeforePhotos(pending?.beforePhotos || []);
      setAfterPhotos(pending?.afterPhotos || []);
      setEditLoaded(true);
    }).catch(error=>Alert.alert("Pending changes could not be loaded", error instanceof Error ? error.message : "Reopen this finding before editing."));
    return () => { active = false; };
  }, [item, syncing]);

  if (loading && !detail) {
    return (
      <QualityShell
        permission="mobile.rectifications"
        title="Finding"
      >
        <ActivityIndicator />
      </QualityShell>
    );
  }

  if (!revision || !item) {
    return (
      <QualityShell
        permission="mobile.rectifications"
        title="Finding"
      >
        <Text style={q.error}>
          Finding could not be loaded.
        </Text>
      </QualityShell>
    );
  }

  async function rectify(markRectified=true) {
    if (locked) return;
    const detailError = validateDetailValues(selectedIssue?.detail_schema || EMPTY_DETAIL_SCHEMA, operationalDetails);
    if (detailError) return Alert.alert("Check operational details", detailError);
    if(markRectified && !beforePhotos.length && !files.some(file=>file.file_role==="before_photo"))return Alert.alert("Before photo required","Add Before evidence before marking Rectified.");
    if (
      markRectified && afterPhotos.length === 0 &&
      afterFiles.length === 0
    ) {
      return Alert.alert(
        "After photo required",
        "Capture evidence after rectification.",
      );
    }

    setSaving(true);

    try {
      await enqueueRevisionItemUpdate({
        revisionId: revision!.id,
        itemId: item!.id,
        expectedVersion: editVersion,
        projectId: revision!.project_id,
        towerId: revision!.tower_id,
        rectificationComment: comment.trim(),
        status: markRectified ? "Rectified" : item!.status,
        afterPhotos,
        beforePhotos,
        operationalDetails,
        issueTypeId: selectedIssueId,
      });

      if (online) {
        await syncNow({ manual: false });
        try {
          await refreshQualityRevisionDetail(
            revision!.project_id,
            revision!.id,
          );
        } catch {
          // The queue is authoritative.
        }
      }

      Alert.alert(
        online
          ? "Rectification saved"
          : "Saved offline",
        online
          ? "Saved to the sync queue. Check Sync status for confirmation or conflicts."
          : "The rectification will sync automatically when TTTracker reconnects.",
        [
          {
            text: "OK",
            onPress: () =>
              router.canGoBack() ? router.back() : router.replace(`/revisions/${encodeURIComponent(revision!.id)}` as Href),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <QualityShell
      permission="mobile.rectifications"
      compactHeader
      title={`Finding ${String(
        item.item_number ?? "",
      ).padStart(3, "0")}`}
      subtitle={`${
        revision.revision_number ||
        revision.fli_number ||
        "Revision"
      } · ${tower?.name || "Tower"}`}
    >
      <View style={q.card}>
        <Text style={q.cardTitle}>FLI # {item.fli_number || `FLI-${String(item.item_number).padStart(3, "0")}`}</Text>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:10}}>{[item.assigned_flag && `Flag ${item.assigned_flag}`,item.leg && `Leg ${item.leg}`].filter(Boolean).map(value=><Text key={String(value)} style={q.muted}>{value}</Text>)}</View>
        <View style={q.row}>
          <QualityStatusPill
            value={findingReadiness(item,files.filter(file=>file.file_role==="before_photo").length,afterFiles.length).workflow}
          />
          <Text
            style={[
              q.muted,
              {
                flex: 1,
                textAlign: "right",
              },
            ]}
          >
            {issue?.name ||
              item.other_issue_text ||
              "Other"}
          </Text>
        </View>

        <Text style={q.cardTitle}>
          {item.finding ||
            "No finding description"}
        </Text>

        <Text style={q.muted}>
          {[
            item.tower_segment,
            item.member_number
              ? `Member ${item.member_number}`
              : "",
            item.drawing_number
              ? `Drawing ${item.drawing_number}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ") ||
            "No steel reference"}
        </Text>
        {operationalDetailSummary(selectedIssue?.detail_schema||issue?.detail_schema,operationalDetails)?<Text style={[q.cardTitle,{fontSize:13,color:"#1e3a8a"}]}>{operationalDetailSummary(selectedIssue?.detail_schema||issue?.detail_schema,operationalDetails)}</Text>:null}
        <Text style={q.fieldLabel}>Defect type</Text>
        <Pressable disabled={locked} style={[q.select,{minHeight:40,padding:9}]} onPress={()=>setIssuePickerOpen(true)}><Text style={q.selectText}>{selectedIssue?.name||item.other_issue_text||"Select defect type"}</Text></Pressable>
        <QualitySelector visible={issuePickerOpen} title="Defect type" options={(data?.issueTypes||[]).filter(type=>type.active&&["revision","both"].includes(type.applies_to)).map(type=>({id:type.id,label:type.name}))} onClose={()=>setIssuePickerOpen(false)} onSelect={option=>{dirty.current=true;setSelectedIssueId(option.id);setIssuePickerOpen(false);}}/>
        <OperationalDetailFields schema={selectedIssue?.detail_schema} values={operationalDetails} disabled={locked} onChange={values=>{dirty.current=true;setOperationalDetails(values);}}/>
      </View>

      <View style={q.card}>
        <Text style={q.cardTitle}>Before / After Evidence</Text>
        {hasPendingEdit ? <Text style={q.muted}>This FLI has saved changes awaiting sync. Details below include your saved values. Sync or resolve its queued conflict before editing again.</Text> : null}
        <QualityEvidenceGallery files={files} locked={Boolean(revision.finalised_at) || !["Draft","Open","In Progress"].includes(revision.status) || item.status==="Verified"} onChanged={deletedId=>{if(deletedId)setDetail(current=>current?{...current,files:current.files.filter(file=>file.id!==deletedId)}:current);if(online)void refreshQualityRevisionDetail(projectId,revisionId).then(setDetail).catch(()=>undefined);}}/>
        <View style={{flexDirection:"row",flexWrap:"wrap",gap:10}}><Text style={q.muted}>{item.source_type==="punchlist"?"Punchlist":"Manual"}</Text><Text style={q.muted}>{item.external_reference}</Text></View>
        {item.source_type==="punchlist"?<><Text>Inspector: {item.inspector_name || "Not supplied"}</Text>{item.source_date?<Text>Source Date: {sourceDateDisplay(item.source_date)}</Text>:null}<Text>Imported By: {qualityDisplayName(item.imported_by_label)}</Text></>:null}
        <Text>{findingReadiness(item,files.filter(file=>file.file_role==="before_photo").length,afterFiles.length).photosComplete?"Photos Complete":"Photos Incomplete"}</Text>
        {item.inspector_comment?<Text>{item.inspector_comment}</Text>:null}
        <Text style={q.fieldLabel}>
          Rectification / Action Taken (optional)
        </Text>
        <TextInput
          editable={!locked}
          value={comment}
          onChangeText={value=>{dirty.current=true;setComment(value);}}
          multiline
          style={[q.input, styles.textarea]}
        />

        {!locked ? <QualityPhotoPicker label="Add extra Before photos" photos={beforePhotos} onChange={value=>{dirty.current=true;setBeforePhotos(value);}} prefix="revision-before" context={{ Revision: revision.revision_number || revision.fli_number, Tower: tower?.name, "FLI #": item.fli_number, Issue: selectedIssue?.name || item.other_issue_text, Segment: item.tower_segment, Member: item.member_number, Drawing: item.drawing_number }} /> : null}
        {!locked ? <QualityPhotoPicker
          label="Add after photos"
          photos={afterPhotos}
          onChange={value=>{dirty.current=true;setAfterPhotos(value);}}
          prefix="revision-after"
          context={{ Revision: revision.revision_number || revision.fli_number || "Pending RECT", Tower: tower?.name, "FLI #": item.fli_number || "Pending FLI", Flag: item.assigned_flag, Leg: item.leg, Issue: issue?.name || item.other_issue_text, Segment: item.tower_segment, Member: item.member_number, Drawing: item.drawing_number }}
        /> : null}

        <Pressable disabled={saving || locked} style={[q.primary, (saving || locked) && {opacity:0.5}]} onPress={()=>void rectify(false)}><Text style={q.primaryText}>Save Only</Text></Pressable>
        <Pressable
          disabled={saving || locked}
          style={[q.primary, (saving || locked) && {opacity:0.5}]}
          onPress={() => void rectify()}
        >
          <Text style={q.primaryText}>
            {saving
              ? "Saving…"
              : online
                ? "Save & Mark Rectified"
                : "Save & Mark Rectified Offline"}
          </Text>
        </Pressable>
      </View>
    </QualityShell>
  );
}

const styles = StyleSheet.create({
  textarea: {
    minHeight: 90,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  file: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
  },
  fileName: {
    flex: 1,
    color: "#334155",
    fontWeight: "700",
    fontSize: 12,
  },
  open: {
    color: "#2563eb",
    fontWeight: "900",
    fontSize: 12,
  },
});

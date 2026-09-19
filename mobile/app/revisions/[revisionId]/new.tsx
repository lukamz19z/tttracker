import { router, type Href, useLocalSearchParams } from "expo-router";
import {
  useEffect,
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
  QualitySelector,
  type QualitySelectorOption,
} from "@/components/quality/QualitySelector";
import {
  QualityShell,
  qualityStyles as q,
} from "@/components/quality/QualityShell";
import { useAuth } from "@/contexts/AuthContext";
import { useQuality } from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import {
  cachedQualityMemberCatalog,
  cachedQualityRevisionDetail,
  refreshQualityMemberCatalog,
  refreshQualityRevisionDetail,
  type QualityMemberCatalogRow,
} from "@/lib/api/quality";
import { enqueueRevisionItemCreate } from "@/lib/offline/quality-sync";
import type { LocalQualityPhoto } from "@/types/quality";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

export default function NewFindingScreen() {
  const { revisionId } =
    useLocalSearchParams<{ revisionId: string }>();
  const { data } = useQuality();
  const { profile } = useAuth();
  const { online, syncNow } = useSync();

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
  const [detailLoading, setDetailLoading] =
    useState(false);
  const [members, setMembers] = useState<
    QualityMemberCatalogRow[]
  >([]);

  const revision = detail?.revision ?? null;
  const tower = data?.towers.find(
    (row) => row.id === revision?.tower_id,
  ) ?? null;

  const [issueTypeId, setIssueTypeId] =
    useState("");
  const [otherIssue, setOtherIssue] =
    useState("");
  const [memberId, setMemberId] =
    useState("");
  const [finding, setFinding] =
    useState("");
  const [rectification, setRectification] =
    useState("");
  const [beforePhotos, setBeforePhotos] =
    useState<LocalQualityPhoto[]>([]);
  const [afterPhotos, setAfterPhotos] =
    useState<LocalQualityPhoto[]>([]);
  const [selector, setSelector] =
    useState<"issue" | "member" | null>(null);
  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    if (!projectId || !revisionId) return;

    let active = true;
    setDetailLoading(true);

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
          "Revision detail could not be loaded",
          error,
        );
      } finally {
        if (active) setDetailLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [online, projectId, revisionId]);

  useEffect(() => {
    const towerId = clean(revision?.tower_id);
    if (!projectId || !towerId) {
      setMembers([]);
      return;
    }

    let active = true;

    void cachedQualityMemberCatalog(
      projectId,
      towerId,
    )
      .then((cached) => {
        if (active && cached?.value?.length) {
          setMembers(cached.value);
        }
      })
      .catch(() => undefined);

    if (online) {
      void refreshQualityMemberCatalog(
        projectId,
        towerId,
      )
        .then((rows) => {
          if (active) setMembers(rows);
        })
        .catch(() => undefined);
    }

    return () => {
      active = false;
    };
  }, [
    online,
    projectId,
    revision?.tower_id,
  ]);

  const issue = data?.issueTypes.find(
    (row) => row.id === issueTypeId,
  ) ?? null;

  const member =
    members.find((row) => row.id === memberId) ??
    null;

  const options = useMemo<
    QualitySelectorOption[]
  >(() => {
    if (selector === "issue") {
      return [
        ...(data?.issueTypes ?? [])
          .filter(
            (row) =>
              row.active &&
              (row.applies_to === "revision" ||
                row.applies_to === "both"),
          )
          .map((row) => ({
            id: row.id,
            label: row.name,
          })),
        {
          id: "__other__",
          label: "Other / unlisted issue",
        },
      ];
    }

    return members.map((row) => ({
      id: row.id,
      label: row.memberNumber || "Member",
      subtitle: [
        row.towerSegment,
        row.drawingNumber,
        row.bundleReference,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
  }, [data?.issueTypes, members, selector]);

  if (detailLoading && !revision) {
    return (
      <QualityShell
        permission="mobile.rectifications"
        title="Add Finding"
      >
        <ActivityIndicator />
      </QualityShell>
    );
  }

  if (!revision) {
    return (
      <QualityShell
        permission="mobile.rectifications"
        title="New Finding"
      >
        <Text style={q.error}>
          Revision could not be loaded.
        </Text>
      </QualityShell>
    );
  }

  async function save() {
    if (!issueTypeId) {
      return Alert.alert(
        "Issue required",
        "Select a common issue or Other.",
      );
    }
    if (
      issueTypeId === "__other__" &&
      !otherIssue.trim()
    ) {
      return Alert.alert(
        "Issue details required",
        "Enter the issue details.",
      );
    }
    if (!finding.trim()) {
      return Alert.alert(
        "Finding required",
        "Describe the finding.",
      );
    }
    if (!beforePhotos.length) {
      return Alert.alert(
        "Before photo required",
        "Capture the before condition before removing the flag.",
      );
    }

    setSaving(true);

    try {
      await enqueueRevisionItemCreate({
        revisionId: revision!.id,
        projectId: revision!.project_id,
        towerId: revision!.tower_id,
        issueTypeId:
          issueTypeId === "__other__"
            ? null
            : issueTypeId,
        otherIssueText:
          issueTypeId === "__other__"
            ? otherIssue.trim()
            : null,
        towerSegment:
          member?.towerSegment ?? null,
        memberNumber:
          member?.memberNumber ?? null,
        drawingNumber:
          member?.drawingNumber ?? null,
        finding: finding.trim(),
        rectificationComment:
          rectification.trim() || null,
        status: afterPhotos.length
          ? "Rectified"
          : "Open",
        beforePhotos,
        afterPhotos,
      });

      if (online) {
        await syncNow();
        try {
          await refreshQualityRevisionDetail(
            revision!.project_id,
            revision!.id,
          );
        } catch {
          // Queue is authoritative; detail can refresh later.
        }
      }

      Alert.alert(
        online ? "Finding saved" : "Saved offline",
        online
          ? "The finding has been added."
          : "It will sync automatically when TTTracker reconnects.",
        [
          {
            text: "OK",
            onPress: () =>
              router.replace(
                `/revisions/${encodeURIComponent(revision!.id)}` as Href,
              ),
          },
        ],
      );
    } catch (error) {
      Alert.alert(
        "Could not save finding",
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
      title="Add Finding"
      subtitle={`${
        revision.fli_number ||
        revision.revision_number ||
        "Revision"
      } · ${tower?.name || "Tower"}`}
    >
      <Field
        label="Common Issue"
        value={
          issueTypeId === "__other__"
            ? "Other / unlisted issue"
            : issue?.name || "Select issue"
        }
        onPress={() => setSelector("issue")}
      />

      {issueTypeId === "__other__" ? (
        <>
          <Text style={q.fieldLabel}>
            Other Issue
          </Text>
          <TextInput
            value={otherIssue}
            onChangeText={setOtherIssue}
            style={q.input}
          />
        </>
      ) : null}

      <Field
        label="Member (optional)"
        value={
          member
            ? [
                member.memberNumber,
                member.towerSegment,
                member.drawingNumber,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Select member"
        }
        onPress={() => setSelector("member")}
      />

      <Text style={q.fieldLabel}>
        Finding *
      </Text>
      <TextInput
        value={finding}
        onChangeText={setFinding}
        multiline
        style={[q.input, styles.textarea]}
      />

      <QualityPhotoPicker
        label="Before photos"
        required
        photos={beforePhotos}
        onChange={setBeforePhotos}
        prefix="revision-before"
      />

      <Text style={q.fieldLabel}>
        Rectification Comment
      </Text>
      <TextInput
        value={rectification}
        onChangeText={setRectification}
        multiline
        style={[q.input, styles.textarea]}
        placeholder="Optional until rectified"
      />

      <QualityPhotoPicker
        label="After photos (if rectified now)"
        photos={afterPhotos}
        onChange={setAfterPhotos}
        prefix="revision-after"
      />

      <Pressable
        disabled={saving}
        style={q.primary}
        onPress={() => void save()}
      >
        <Text style={q.primaryText}>
          {saving
            ? "Saving…"
            : online
              ? "Save Finding"
              : "Save Finding Offline"}
        </Text>
      </Pressable>

      <QualitySelector
        visible={selector !== null}
        title={`Select ${selector ?? "option"}`}
        options={options}
        onClose={() => setSelector(null)}
        onSelect={(option) =>
          selector === "issue"
            ? setIssueTypeId(option.id)
            : setMemberId(option.id)
        }
      />
    </QualityShell>
  );
}

function Field({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={q.fieldLabel}>{label}</Text>
      <Pressable
        style={q.select}
        onPress={onPress}
      >
        <Text style={q.selectText}>
          {value}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  textarea: {
    minHeight: 90,
    textAlignVertical: "top",
    paddingTop: 12,
  },
});

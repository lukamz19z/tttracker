import { Image } from "expo-image";
import {
  useLocalSearchParams,
} from "expo-router";
import {
  Camera,
  ChevronDown,
  MessageSquareText,
  Pencil,
  Plus,
  Save,
  X,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
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
import { QualitySelector } from "@/components/quality/QualitySelector";
import { QualityShell } from "@/components/quality/QualityShell";
import { QualityStatusPill } from "@/components/quality/QualityStatusPill";
import { RevisionMemberFields } from "@/components/quality/RevisionMemberFields";
import {
  QualityProvider,
  useQuality,
} from "@/contexts/QualityContext";
import { useSync } from "@/contexts/SyncContext";
import {
  cachedQualityMemberCatalog,
  downloadQualityFile,
  refreshQualityMemberCatalog,
  type QualityMemberCatalogRow,
} from "@/lib/api/quality";
import {
  addDefectAction,
  getDefectAssignees,
  patchDefect,
  uploadDefectPhoto,
  type DefectActionRow,
  type DefectAssignee,
  type MobileDefectSeverity,
  type MobileDefectStatus,
} from "@/lib/api/defects";
import { supabase } from "@/lib/supabase";
import type { LocalQualityPhoto } from "@/types/quality";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function prettyDateTime(value: unknown) {
  const raw = clean(value);
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleString("en-AU");
}

type EditState = {
  issueTypeId: string | null;
  memberNumber: string;
  segment: string;
  drawingNumber: string;
  description: string;
  responsibility: string;
  clientReference: string;
  severity: MobileDefectSeverity;
  status: MobileDefectStatus;
  resolutionNotes: string;
  assignedToUserId: string | null;
};

type Preview = {
  uri: string;
  name: string;
};

function DefectDetailContent() {
  const params = useLocalSearchParams<{
    defectId: string;
  }>();
  const defectId = clean(params.defectId);

  const { data, loading, refresh } = useQuality();
  const { online } = useSync();

  const defects = useMemo(
    () => (Array.isArray(data?.defects) ? data.defects : []),
    [data?.defects],
  );
  const issueTypes = useMemo(
    () => (Array.isArray(data?.issueTypes) ? data.issueTypes : []),
    [data?.issueTypes],
  );
  const towers = useMemo(
    () => (Array.isArray(data?.towers) ? data.towers : []),
    [data?.towers],
  );
  const files = useMemo(
    () => (Array.isArray(data?.files) ? data.files : []),
    [data?.files],
  );

  const defect = defects.find(
    (row) => clean(row.id) === defectId,
  );

  const [members, setMembers] = useState<
    QualityMemberCatalogRow[]
  >([]);
  const [assignees, setAssignees] = useState<
    DefectAssignee[]
  >([]);
  const [actions, setActions] = useState<
    DefectActionRow[]
  >([]);
  const [actionsLoading, setActionsLoading] =
    useState(false);
  const [newAction, setNewAction] = useState("");
  const [actionSaving, setActionSaving] =
    useState(false);

  const [edit, setEdit] =
    useState<EditState | null>(null);
  const [editSaving, setEditSaving] =
    useState(false);
  const [issuePickerOpen, setIssuePickerOpen] =
    useState(false);
  const [severityPickerOpen, setSeverityPickerOpen] =
    useState(false);
  const [statusPickerOpen, setStatusPickerOpen] =
    useState(false);
  const [assigneePickerOpen, setAssigneePickerOpen] =
    useState(false);

  const [photoModalOpen, setPhotoModalOpen] =
    useState(false);
  const [newPhotos, setNewPhotos] = useState<
    LocalQualityPhoto[]
  >([]);
  const [photoSaving, setPhotoSaving] =
    useState(false);
  const [preview, setPreview] =
    useState<Preview | null>(null);

  const projectId = clean(data?.projectId);
  const towerId = clean(defect?.tower_id);

  const towerLabel =
    clean(
      towers.find(
        (tower) => clean(tower.id) === towerId,
      )?.name,
    ) || "Tower";

  const issueName =
    clean(
      issueTypes.find(
        (item) =>
          clean(item.id) ===
          clean(defect?.issue_type_id),
      )?.name,
    ) || "Other";

  const defectIssueTypes = useMemo(() => {
    const seen = new Set<string>();

    return issueTypes.filter((item) => {
      if (item.active === false) return false;
      if (
        !["defect", "both"].includes(
          clean(item.applies_to).toLowerCase(),
        )
      ) {
        return false;
      }

      const key = clean(item.name).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [issueTypes]);

  const issueOptions = useMemo(
    () => [
      {
        id: "",
        label: "Other / not selected",
      },
      ...defectIssueTypes.map((item) => ({
        id: clean(item.id),
        label: clean(item.name),
      })),
    ],
    [defectIssueTypes],
  );

  const severityOptions = [
    { id: "Minor", label: "Minor" },
    { id: "Major", label: "Major" },
    { id: "Critical", label: "Critical" },
  ];

  const statusOptions = [
    { id: "Open", label: "Open" },
    { id: "In Progress", label: "In Progress" },
    { id: "Fixed", label: "Fixed" },
    { id: "Closed", label: "Closed" },
  ];

  const assigneeOptions = useMemo(
    () => [
      { id: "", label: "Unassigned" },
      ...assignees.map((user) => ({
        id: user.id,
        label: user.name,
        subtitle: [user.role, user.email]
          .filter(Boolean)
          .join(" · "),
      })),
    ],
    [assignees],
  );

  const defectFiles = useMemo(
    () =>
      files.filter(
        (file) =>
          clean(file.defect_id) === defectId &&
          clean(file.file_role) === "defect_photo",
      ),
    [defectId, files],
  );

  useEffect(() => {
    if (!projectId) return;
    void getDefectAssignees(projectId)
      .then(setAssignees)
      .catch(() => setAssignees([]));
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !towerId) return;

    let active = true;

    void (async () => {
      try {
        const cached =
          await cachedQualityMemberCatalog(
            projectId,
            towerId,
          );
        if (active) setMembers(cached?.value ?? []);

        if (online) {
          const live =
            await refreshQualityMemberCatalog(
              projectId,
              towerId,
            );
          if (active) setMembers(live ?? []);
        }
      } catch (error) {
        console.warn(
          "Defect member catalogue could not be loaded",
          error,
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [online, projectId, towerId]);

  const loadActions = useCallback(async () => {
    if (!defectId || !online) {
      setActions([]);
      return;
    }

    setActionsLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("defect_actions")
        .select(
          "id,defect_id,action_note,created_by,created_at",
        )
        .eq("defect_id", defectId)
        .order("created_at", {
          ascending: false,
        });

      if (error) throw error;
      setActions(
        (rows ?? []) as DefectActionRow[],
      );
    } catch (error) {
      console.warn(
        "Defect actions could not be loaded",
        error,
      );
    } finally {
      setActionsLoading(false);
    }
  }, [defectId, online]);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  function beginEdit() {
    if (!defect) return;

    setEdit({
      issueTypeId:
        clean(defect.issue_type_id) || null,
      memberNumber: clean(defect.member_number),
      segment: clean(defect.segment),
      drawingNumber: clean(
        defect.drawing_number,
      ),
      description: clean(defect.description),
      responsibility: clean(
        defect.responsibility,
      ),
      clientReference: clean(
        defect.client_reference,
      ),
      severity:
        (clean(defect.severity) ||
          "Minor") as MobileDefectSeverity,
      status:
        (clean(defect.status) ||
          "Open") as MobileDefectStatus,
      resolutionNotes: clean(
        defect.resolution_notes,
      ),
      assignedToUserId:
        clean(defect.assigned_to_user_id) ||
        null,
    });
  }

  async function saveEdit() {
    if (!edit || !defectId) return;

    if (!online) {
      Alert.alert(
        "Connection required",
        "Existing controlled Defects are updated through the server so assignment, close-out and notifications remain authoritative.",
      );
      return;
    }

    if (!edit.description.trim()) {
      Alert.alert(
        "Description required",
        "Enter a Defect description.",
      );
      return;
    }

    setEditSaving(true);
    try {
      const payload = await patchDefect(
        defectId,
        {
          issueTypeId:
            clean(edit.issueTypeId) || null,
          memberNumber:
            clean(edit.memberNumber) || null,
          segment: clean(edit.segment) || null,
          drawingNumber:
            clean(edit.drawingNumber) || null,
          description: edit.description.trim(),
          responsibility:
            clean(edit.responsibility) || null,
          clientReference:
            clean(edit.clientReference) || null,
          severity: edit.severity,
          status: edit.status,
          resolutionNotes:
            clean(edit.resolutionNotes) || null,
          assignedToUserId:
            clean(edit.assignedToUserId) || null,
        },
      );

      setEdit(null);
      await refresh();

      if (payload.warning) {
        Alert.alert(
          "Defect updated",
          payload.warning,
        );
      }
    } catch (error) {
      Alert.alert(
        "Could not update Defect",
        error instanceof Error
          ? error.message
          : "Unknown error.",
      );
    } finally {
      setEditSaving(false);
    }
  }

  async function saveAction() {
    const note = newAction.trim();
    if (!note || !defectId) return;

    if (!online) {
      Alert.alert(
        "Connection required",
        "Actions are written through the controlled Defect API so configured recipients can be notified.",
      );
      return;
    }

    setActionSaving(true);
    try {
      const payload = await addDefectAction(
        defectId,
        note,
      );
      setNewAction("");
      await loadActions();

      if (payload.warning) {
        Alert.alert(
          "Action saved",
          payload.warning,
        );
      }
    } catch (error) {
      Alert.alert(
        "Could not add action",
        error instanceof Error
          ? error.message
          : "Unknown error.",
      );
    } finally {
      setActionSaving(false);
    }
  }

  async function openFile(file: any) {
    try {
      const uri = await downloadQualityFile(
        clean(file.id),
        clean(file.file_name) || "Defect photo",
      );

      setPreview({
        uri,
        name:
          clean(file.file_name) ||
          "Defect photo",
      });
    } catch (error) {
      Alert.alert(
        "Photo could not be opened",
        error instanceof Error
          ? error.message
          : "Unknown error.",
      );
    }
  }

  async function savePhotos() {
    if (!defect || !projectId || !towerId) return;

    if (!online) {
      Alert.alert(
        "Connection required",
        "New evidence for an existing Defect is uploaded directly to the project quality folder. Reconnect before adding these photos.",
      );
      return;
    }

    if (!newPhotos.length) return;

    setPhotoSaving(true);
    try {
      for (const photo of newPhotos) {
        await uploadDefectPhoto({
          projectId,
          towerId,
          defectId,
          photo,
        });
      }

      setNewPhotos([]);
      setPhotoModalOpen(false);
      await refresh();
    } catch (error) {
      Alert.alert(
        "Photos could not be uploaded",
        error instanceof Error
          ? error.message
          : "Unknown error.",
      );
    } finally {
      setPhotoSaving(false);
    }
  }

  if (loading && !data) {
    return <ActivityIndicator />;
  }

  if (!defect) {
    return (
      <QualityShell
        permission="mobile.defects"
        title="Defect"
        subtitle="The requested Defect is not in the current project cache."
      >
        <Text style={styles.helper}>
          Refresh the project data and try again.
        </Text>
      </QualityShell>
    );
  }

  return (
    <QualityShell
      permission="mobile.defects"
      title={
        clean(defect.defect_number) || "Defect"
      }
      subtitle={`${towerLabel} · ${issueName}`}
    >
      <View style={styles.headRow}>
        <View style={styles.grow}>
          <Text style={styles.description}>
            {clean(defect.description) ||
              "No description"}
          </Text>
        </View>

        <Pressable
          style={styles.editButton}
          onPress={beginEdit}
        >
          <Pencil size={16} color="#334155" />
          <Text style={styles.editButtonText}>
            Edit
          </Text>
        </Pressable>
      </View>

      <View style={styles.pills}>
        <QualityStatusPill
          value={defect.severity}
        />
        <QualityStatusPill
          value={defect.status}
        />
      </View>

      <View style={styles.infoCard}>
        <Info
          label="Segment"
          value={clean(defect.segment) || "—"}
        />
        <Info
          label="Member"
          value={
            clean(defect.member_number) || "—"
          }
        />
        <Info
          label="Drawing"
          value={
            clean(defect.drawing_number) || "—"
          }
        />
        <Info
          label="Assigned"
          value={
            clean(defect.assigned_to_label) ||
            "Unassigned"
          }
        />
        <Info
          label="Responsibility"
          value={
            clean(defect.responsibility) || "—"
          }
        />
        <Info
          label="Client / RFI"
          value={
            clean(defect.client_reference) || "—"
          }
        />
      </View>

      {clean(defect.resolution_notes) ? (
        <View style={styles.noteCard}>
          <Text style={styles.sectionTitle}>
            Resolution / close-out
          </Text>
          <Text style={styles.noteText}>
            {clean(defect.resolution_notes)}
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>
            Evidence
          </Text>
          <Text style={styles.helper}>
            Shared website/mobile quality evidence.
          </Text>
        </View>

        <Pressable
          style={styles.darkButton}
          onPress={() => setPhotoModalOpen(true)}
        >
          <Camera size={15} color="#fff" />
          <Text style={styles.darkButtonText}>
            Add photos
          </Text>
        </Pressable>
      </View>

      <View style={styles.photoGrid}>
        {defectFiles.map((file) => (
          <Pressable
            key={clean(file.id)}
            style={styles.photoTile}
            onPress={() => void openFile(file)}
          >
            <Camera
              size={22}
              color="#2563eb"
            />
            <Text
              numberOfLines={2}
              style={styles.photoName}
            >
              {clean(file.file_name) ||
                "Defect photo"}
            </Text>
            <Text style={styles.photoMeta}>
              {prettyDateTime(file.captured_at)}
            </Text>
          </Pressable>
        ))}

        {defectFiles.length === 0 ? (
          <View style={styles.emptyEvidence}>
            <Text style={styles.helper}>
              No SharePoint defect evidence attached
              yet.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.sectionHead}>
        <View>
          <Text style={styles.sectionTitle}>
            Actions / traceability
          </Text>
          <Text style={styles.helper}>
            Instructions, responses and
            rectification notes.
          </Text>
        </View>
      </View>

      <View style={styles.actionComposer}>
        <TextInput
          multiline
          value={newAction}
          onChangeText={setNewAction}
          placeholder="Add action, instruction or response…"
          style={[styles.input, styles.actionInput]}
        />
        <Pressable
          style={[
            styles.actionAdd,
            (!newAction.trim() ||
              actionSaving) &&
              styles.disabled,
          ]}
          disabled={
            !newAction.trim() || actionSaving
          }
          onPress={() => void saveAction()}
        >
          {actionSaving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Plus size={17} color="#fff" />
          )}
        </Pressable>
      </View>

      {actionsLoading ? (
        <ActivityIndicator />
      ) : null}

      {actions.map((action) => (
        <View
          key={action.id}
          style={styles.actionCard}
        >
          <View style={styles.actionIcon}>
            <MessageSquareText
              size={15}
              color="#475569"
            />
          </View>
          <View style={styles.grow}>
            <Text style={styles.actionText}>
              {action.action_note}
            </Text>
            <Text style={styles.actionMeta}>
              {prettyDateTime(action.created_at)}
              {action.created_by
                ? ` · ${action.created_by}`
                : ""}
            </Text>
          </View>
        </View>
      ))}

      {edit ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setEdit(null)}
        >
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <View style={styles.grow}>
                <Text style={styles.modalTitle}>
                  Edit Defect
                </Text>
                <Text style={styles.helper}>
                  Changes apply to the same controlled
                  record used by the website.
                </Text>
              </View>
              <Pressable
                style={styles.close}
                onPress={() => setEdit(null)}
              >
                <X size={20} color="#334155" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={
                styles.modalContent
              }
              keyboardShouldPersistTaps="handled"
            >
              <FieldLabel text="Common issue" />
              <Pressable
                style={styles.selector}
                onPress={() =>
                  setIssuePickerOpen(true)
                }
              >
                <Text style={styles.selectorText}>
                  {issueOptions.find(
                    (option) =>
                      option.id ===
                      (edit.issueTypeId ?? ""),
                  )?.label ||
                    "Other / not selected"}
                </Text>
                <ChevronDown
                  size={18}
                  color="#64748b"
                />
              </Pressable>

              <RevisionMemberFields
                members={members}
                segment={edit.segment}
                memberNumber={edit.memberNumber}
                drawingNumber={edit.drawingNumber}
                onSegmentChange={(
                  segment,
                  keepCurrentMember,
                ) =>
                  setEdit((current) =>
                    current
                      ? {
                          ...current,
                          segment,
                          memberNumber:
                            keepCurrentMember
                              ? current.memberNumber
                              : "",
                          drawingNumber:
                            keepCurrentMember
                              ? current.drawingNumber
                              : "",
                        }
                      : current,
                  )
                }
                onSelectMember={(member) =>
                  setEdit((current) =>
                    current
                      ? {
                          ...current,
                          memberNumber: clean(
                            member.memberNumber,
                          ),
                          segment:
                            clean(
                              member.towerSegment,
                            ) || current.segment,
                          drawingNumber: clean(
                            member.drawingNumber,
                          ),
                        }
                      : current,
                  )
                }
              />

              <FieldLabel text="Severity" />
              <Pressable
                style={styles.selector}
                onPress={() =>
                  setSeverityPickerOpen(true)
                }
              >
                <Text style={styles.selectorText}>
                  {edit.severity}
                </Text>
                <ChevronDown
                  size={18}
                  color="#64748b"
                />
              </Pressable>

              <FieldLabel text="Status" />
              <Pressable
                style={styles.selector}
                onPress={() =>
                  setStatusPickerOpen(true)
                }
              >
                <Text style={styles.selectorText}>
                  {edit.status}
                </Text>
                <ChevronDown
                  size={18}
                  color="#64748b"
                />
              </Pressable>

              <FieldLabel text="Assigned to" />
              <Pressable
                style={styles.selector}
                onPress={() =>
                  setAssigneePickerOpen(true)
                }
              >
                <Text style={styles.selectorText}>
                  {assigneeOptions.find(
                    (option) =>
                      option.id ===
                      (edit.assignedToUserId ?? ""),
                  )?.label || "Unassigned"}
                </Text>
                <ChevronDown
                  size={18}
                  color="#64748b"
                />
              </Pressable>

              <FieldLabel text="Responsibility" />
              <TextInput
                value={edit.responsibility}
                onChangeText={(responsibility) =>
                  setEdit((current) =>
                    current
                      ? {
                          ...current,
                          responsibility,
                        }
                      : current,
                  )
                }
                style={styles.input}
              />

              <FieldLabel text="Client / RFI reference" />
              <TextInput
                value={edit.clientReference}
                onChangeText={(clientReference) =>
                  setEdit((current) =>
                    current
                      ? {
                          ...current,
                          clientReference,
                        }
                      : current,
                  )
                }
                style={styles.input}
              />

              <FieldLabel text="Description *" />
              <TextInput
                multiline
                value={edit.description}
                onChangeText={(description) =>
                  setEdit((current) =>
                    current
                      ? {
                          ...current,
                          description,
                        }
                      : current,
                  )
                }
                style={[
                  styles.input,
                  styles.multiline,
                ]}
              />

              <FieldLabel text="Resolution / close-out notes" />
              <TextInput
                multiline
                value={edit.resolutionNotes}
                onChangeText={(resolutionNotes) =>
                  setEdit((current) =>
                    current
                      ? {
                          ...current,
                          resolutionNotes,
                        }
                      : current,
                  )
                }
                style={[
                  styles.input,
                  styles.multiline,
                ]}
              />

              <Pressable
                style={[
                  styles.saveButton,
                  editSaving && styles.disabled,
                ]}
                disabled={editSaving}
                onPress={() => void saveEdit()}
              >
                {editSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Save size={18} color="#fff" />
                )}
                <Text style={styles.saveButtonText}>
                  Save changes
                </Text>
              </Pressable>
            </ScrollView>

            <QualitySelector
              visible={issuePickerOpen}
              title="Common issue"
              options={issueOptions}
              onClose={() =>
                setIssuePickerOpen(false)
              }
              onSelect={(option) => {
                setEdit((current) =>
                  current
                    ? {
                        ...current,
                        issueTypeId:
                          option.id || null,
                      }
                    : current,
                );
                setIssuePickerOpen(false);
              }}
            />

            <QualitySelector
              visible={severityPickerOpen}
              title="Severity"
              options={severityOptions}
              onClose={() =>
                setSeverityPickerOpen(false)
              }
              onSelect={(option) => {
                setEdit((current) =>
                  current
                    ? {
                        ...current,
                        severity:
                          option.id as MobileDefectSeverity,
                      }
                    : current,
                );
                setSeverityPickerOpen(false);
              }}
            />

            <QualitySelector
              visible={statusPickerOpen}
              title="Status"
              options={statusOptions}
              onClose={() =>
                setStatusPickerOpen(false)
              }
              onSelect={(option) => {
                setEdit((current) =>
                  current
                    ? {
                        ...current,
                        status:
                          option.id as MobileDefectStatus,
                      }
                    : current,
                );
                setStatusPickerOpen(false);
              }}
            />

            <QualitySelector
              visible={assigneePickerOpen}
              title="Assigned to"
              options={assigneeOptions}
              onClose={() =>
                setAssigneePickerOpen(false)
              }
              onSelect={(option) => {
                setEdit((current) =>
                  current
                    ? {
                        ...current,
                        assignedToUserId:
                          option.id || null,
                      }
                    : current,
                );
                setAssigneePickerOpen(false);
              }}
            />
          </SafeAreaView>
        </Modal>
      ) : null}

      <Modal
        visible={photoModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() =>
          setPhotoModalOpen(false)
        }
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <View style={styles.grow}>
              <Text style={styles.modalTitle}>
                Add Defect Evidence
              </Text>
              <Text style={styles.helper}>
                Photos upload to the same project
                quality evidence used on the website.
              </Text>
            </View>
            <Pressable
              style={styles.close}
              onPress={() =>
                setPhotoModalOpen(false)
              }
            >
              <X size={20} color="#334155" />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={
              styles.modalContent
            }
          >
            <QualityPhotoPicker
              label="Defect photos"
              photos={newPhotos}
              onChange={setNewPhotos}
              prefix="defect-evidence"
            />

            {!online ? (
              <Text style={styles.offlineWarning}>
                Reconnect before uploading evidence to
                an existing Defect.
              </Text>
            ) : null}

            <Pressable
              style={[
                styles.saveButton,
                (photoSaving ||
                  !newPhotos.length ||
                  !online) &&
                  styles.disabled,
              ]}
              disabled={
                photoSaving ||
                !newPhotos.length ||
                !online
              }
              onPress={() => void savePhotos()}
            >
              {photoSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Camera size={18} color="#fff" />
              )}
              <Text style={styles.saveButtonText}>
                Upload evidence
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={Boolean(preview)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <Pressable
          style={styles.previewBack}
          onPress={() => setPreview(null)}
        >
          <View style={styles.previewInner}>
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
        </Pressable>
      </Modal>
    </QualityShell>
  );
}

export default function DefectDetailScreen() {
  return (
    <QualityProvider>
      <DefectDetailContent />
    </QualityProvider>
  );
}

function FieldLabel({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  headRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  description: {
    color: "#0f172a",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "800",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  editButtonText: {
    color: "#334155",
    fontWeight: "900",
    fontSize: 12,
  },
  pills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  infoCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 14,
  },
  infoItem: {
    minWidth: "45%",
    flexGrow: 1,
  },
  infoLabel: {
    color: "#94a3b8",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  infoValue: {
    marginTop: 3,
    color: "#334155",
    fontWeight: "800",
    fontSize: 12,
  },
  noteCard: {
    borderRadius: 15,
    backgroundColor: "#f8fafc",
    padding: 14,
  },
  noteText: {
    marginTop: 6,
    color: "#475569",
    lineHeight: 20,
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  sectionTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 14,
  },
  helper: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 17,
  },
  darkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#0f172a",
    borderRadius: 11,
    paddingHorizontal: 12,
    minHeight: 39,
  },
  darkButtonText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 11,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  photoTile: {
    width: "47%",
    minHeight: 105,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
    padding: 12,
    justifyContent: "center",
    gap: 6,
  },
  photoName: {
    color: "#1e3a8a",
    fontSize: 11,
    fontWeight: "900",
  },
  photoMeta: {
    color: "#64748b",
    fontSize: 9,
  },
  emptyEvidence: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    padding: 18,
    alignItems: "center",
  },
  actionComposer: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-end",
  },
  actionInput: {
    flex: 1,
    minHeight: 72,
    paddingTop: 10,
    textAlignVertical: "top",
  },
  actionAdd: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  actionCard: {
    flexDirection: "row",
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  actionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: "#334155",
    lineHeight: 19,
  },
  actionMeta: {
    color: "#94a3b8",
    fontSize: 9,
    marginTop: 5,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  modalTitle: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 18,
  },
  close: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    padding: 16,
    gap: 9,
    paddingBottom: 40,
  },
  label: {
    marginTop: 3,
    color: "#475569",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  selector: {
    minHeight: 47,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  selectorText: {
    flex: 1,
    color: "#0f172a",
    fontWeight: "800",
  },
  input: {
    minHeight: 47,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 13,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    color: "#0f172a",
  },
  multiline: {
    minHeight: 100,
    paddingTop: 11,
    textAlignVertical: "top",
  },
  saveButton: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#0f172a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.5,
  },
  offlineWarning: {
    color: "#b45309",
    backgroundColor: "#fffbeb",
    borderRadius: 12,
    padding: 12,
    fontSize: 11,
    lineHeight: 17,
  },
  previewBack: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  previewInner: {
    width: "100%",
    height: "90%",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: "90%",
  },
  previewName: {
    color: "#fff",
    marginTop: 8,
    fontSize: 12,
    fontWeight: "800",
  },
});

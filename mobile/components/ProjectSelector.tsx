import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Check,
  ChevronDown,
  X,
} from "lucide-react-native";

import {
  type AvailableProject,
  useAuth,
} from "@/contexts/AuthContext";

type ProjectSelectorProps = {
  label?: string;
  compact?: boolean;
};

function getProjectLabel(
  project: AvailableProject,
) {
  return project.projectNumber
    ? `${project.projectNumber} — ${project.name}`
    : project.name;
}

export function ProjectSelector({
  label = "Current project",
  compact = false,
}: ProjectSelectorProps) {
  const {
    profile,
    setCurrentProject,
  } = useAuth();

  const [modalOpen, setModalOpen] =
    useState(false);

  const [
    changingProjectId,
    setChangingProjectId,
  ] = useState<string | null>(null);

  const projects =
    profile?.availableProjects ?? [];

  const selectedProject =
    projects.find(
      (project) =>
        project.id === profile?.projectId,
    ) ?? null;

  const canChange =
    projects.length > 1;

  async function handleSelect(
    project: AvailableProject,
  ) {
    if (
      project.id ===
      profile?.projectId
    ) {
      setModalOpen(false);
      return;
    }

    setChangingProjectId(project.id);

    try {
      await setCurrentProject(project.id);
      setModalOpen(false);
    } catch (error) {
      Alert.alert(
        "Unable to change project",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    } finally {
      setChangingProjectId(null);
    }
  }

  return (
    <>
      <View
        style={[
          styles.container,
          compact &&
            styles.containerCompact,
        ]}
      >
        <Text style={styles.label}>
          {label.toUpperCase()}
        </Text>

        <Pressable
          disabled={!canChange}
          onPress={() =>
            setModalOpen(true)
          }
          style={({ pressed }) => [
            styles.selector,
            compact &&
              styles.selectorCompact,
            canChange &&
              styles.selectorEnabled,
            pressed &&
              canChange &&
              styles.pressed,
          ]}
        >
          <View style={styles.textContent}>
            <Text
              style={styles.projectName}
              numberOfLines={2}
            >
              {selectedProject
                ? getProjectLabel(
                    selectedProject,
                  )
                : "No project selected"}
            </Text>

            <Text
              style={styles.projectStatus}
            >
              {selectedProject?.status ??
                "Status not set"}
            </Text>
          </View>

          {canChange ? (
            <ChevronDown
              size={20}
              color="#2563eb"
              strokeWidth={2.5}
            />
          ) : null}
        </Pressable>

        {projects.length === 0 ? (
          <Text style={styles.warning}>
            No project access has been
            assigned to this account.
          </Text>
        ) : null}
      </View>

      <Modal
        visible={modalOpen}
        transparent
        animationType="slide"
        onRequestClose={() =>
          setModalOpen(false)
        }
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() =>
              setModalOpen(false)
            }
          />

          <View style={styles.sheet}>
            <View style={styles.handle} />

            <View style={styles.modalHeader}>
              <View
                style={
                  styles.modalHeaderContent
                }
              >
                <Text
                  style={styles.modalTitle}
                >
                  Select project
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  This changes the active
                  project across TTTracker
                  Mobile.
                </Text>
              </View>

              <Pressable
                onPress={() =>
                  setModalOpen(false)
                }
                style={styles.closeButton}
              >
                <X
                  size={20}
                  color="#475569"
                />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={
                styles.projectList
              }
              showsVerticalScrollIndicator={
                false
              }
            >
              {projects.map((project) => {
                const selected =
                  project.id ===
                  profile?.projectId;

                const changing =
                  changingProjectId ===
                  project.id;

                return (
                  <Pressable
                    key={project.id}
                    disabled={
                      changingProjectId !==
                      null
                    }
                    onPress={() =>
                      void handleSelect(
                        project,
                      )
                    }
                    style={({
                      pressed,
                    }) => [
                      styles.projectOption,
                      selected &&
                        styles.projectOptionSelected,
                      pressed &&
                        !selected &&
                        styles.pressed,
                    ]}
                  >
                    <View
                      style={
                        styles.optionContent
                      }
                    >
                      <Text
                        style={[
                          styles.optionName,
                          selected &&
                            styles.optionNameSelected,
                        ]}
                      >
                        {getProjectLabel(
                          project,
                        )}
                      </Text>

                      <Text
                        style={
                          styles.optionStatus
                        }
                      >
                        {project.status ??
                          "Status not set"}
                      </Text>
                    </View>

                    {changing ? (
                      <ActivityIndicator
                        size="small"
                        color="#2563eb"
                      />
                    ) : selected ? (
                      <View
                        style={
                          styles.checkCircle
                        }
                      >
                        <Check
                          size={16}
                          color="#ffffff"
                          strokeWidth={3}
                        />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 20,
    backgroundColor: "#eff6ff",
    padding: 17,
  },

  containerCompact: {
    borderRadius: 16,
    padding: 13,
  },

  label: {
    color: "#2563eb",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 8,
  },

  selector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  selectorCompact: {
    minHeight: 48,
  },

  selectorEnabled: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 13,
    paddingVertical: 12,
  },

  textContent: {
    flex: 1,
  },

  projectName: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },

  projectStatus: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 4,
  },

  warning: {
    color: "#b45309",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8,
  },

  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor:
      "rgba(15, 23, 42, 0.48)",
  },

  sheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingBottom: 30,
  },

  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 17,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingBottom: 17,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  modalHeaderContent: {
    flex: 1,
  },

  modalTitle: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
  },

  modalSubtitle: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },

  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },

  projectList: {
    gap: 10,
    paddingTop: 16,
    paddingBottom: 12,
  },

  projectOption: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 17,
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  projectOptionSelected: {
    borderColor: "#93c5fd",
    backgroundColor: "#eff6ff",
  },

  optionContent: {
    flex: 1,
  },

  optionName: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "800",
  },

  optionNameSelected: {
    color: "#1d4ed8",
  },

  optionStatus: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 5,
  },

  checkCircle: {
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
    marginLeft: 12,
  },

  pressed: {
    opacity: 0.72,
  },
});
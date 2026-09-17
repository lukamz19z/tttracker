
import { Image } from "expo-image";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import {
  FileText,
  Share2,
  X,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function extension(fileName: string) {
  const match = clean(fileName)
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);

  return match?.[1] ?? "";
}

function kindFor(
  fileName: string,
  mimeType?: string | null,
) {
  const mime = clean(mimeType).toLowerCase();
  const ext = extension(fileName);

  if (
    mime.startsWith("image/") ||
    [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "heic",
      "heif",
    ].includes(ext)
  ) {
    return "image" as const;
  }

  if (
    mime === "application/pdf" ||
    ext === "pdf"
  ) {
    return "pdf" as const;
  }

  return "other" as const;
}

function mimeFor(
  fileName: string,
  mimeType?: string | null,
) {
  const supplied = clean(mimeType);

  if (supplied) return supplied;

  const ext = extension(fileName);

  if (ext === "pdf") {
    return "application/pdf";
  }

  if (ext === "png") {
    return "image/png";
  }

  if (
    ext === "jpg" ||
    ext === "jpeg"
  ) {
    return "image/jpeg";
  }

  return "*/*";
}

export type TrainingPreviewFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export function TrainingEvidencePreview({
  file,
  visible,
  loading = false,
  onClose,
}: {
  file: TrainingPreviewFile | null;
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
}) {
  const kind = file
    ? kindFor(
        file.name,
        file.mimeType,
      )
    : "other";

  async function openNativeViewer() {
    if (!file) return;

    try {
      const mimeType = mimeFor(
        file.name,
        file.mimeType,
      );

      /*
       * On Android, expo-sharing opens the share sheet. That is NOT what
       * "Preview PDF" should do.
       *
       * Convert the app's file:// URI to a content:// URI and launch the
       * standard Android ACTION_VIEW intent instead. Android will open the
       * installed PDF/image viewer directly.
       */
      if (Platform.OS === "android") {
        const contentUri =
          file.uri.startsWith("content://")
            ? file.uri
            : await FileSystemLegacy.getContentUriAsync(
                file.uri,
              );

        await IntentLauncher.startActivityAsync(
          "android.intent.action.VIEW",
          {
            data: contentUri,
            flags: 1,
            type: mimeType,
          },
        );

        return;
      }

      /*
       * iOS fallback. The current TTTracker Android build is the immediate
       * target, but keep Sharing as a safe fallback where ACTION_VIEW does
       * not exist.
       */
      if (
        await Sharing.isAvailableAsync()
      ) {
        await Sharing.shareAsync(
          file.uri,
          {
            dialogTitle:
              kind === "pdf"
                ? "Open PDF"
                : "Open Training evidence",
            mimeType,
            UTI:
              kind === "pdf"
                ? "com.adobe.pdf"
                : undefined,
          },
        );
        return;
      }

      throw new Error(
        "No document viewer is available on this device.",
      );
    } catch (error) {
      Alert.alert(
        "Could not open file",
        error instanceof Error
          ? error.message
          : "Please try again.",
      );
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>
              Evidence Preview
            </Text>
            <Text
              numberOfLines={1}
              style={styles.fileName}
            >
              {file?.name ||
                "Training evidence"}
            </Text>
          </View>

          <Pressable
            onPress={onClose}
            style={styles.close}
          >
            <X
              size={22}
              color="#334155"
            />
          </Pressable>
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator
                size="large"
                color="#2563eb"
              />
              <Text style={styles.helper}>
                Loading evidence…
              </Text>
            </View>
          ) : file &&
            kind === "image" ? (
            <>
              <Image
                source={{ uri: file.uri }}
                style={styles.image}
                contentFit="contain"
                transition={150}
              />

              <Pressable
                onPress={() =>
                  void openNativeViewer()
                }
                style={styles.secondary}
              >
                <Share2
                  size={17}
                  color="#334155"
                />
                <Text
                  style={
                    styles.secondaryText
                  }
                >
                  Open in device viewer
                </Text>
              </Pressable>
            </>
          ) : file &&
            kind === "pdf" ? (
            <View style={styles.pdfCard}>
              <View
                style={styles.pdfIcon}
              >
                <FileText
                  size={48}
                  color="#dc2626"
                />
              </View>

              <Text
                style={styles.pdfTitle}
              >
                PDF ready to view
              </Text>

              <Text style={styles.helper}>
                Tap View PDF to open the
                document in the phone&apos;s PDF
                viewer. This no longer opens
                the Share menu.
              </Text>

              <Pressable
                onPress={() =>
                  void openNativeViewer()
                }
                style={styles.primary}
              >
                <FileText
                  size={18}
                  color="#fff"
                />
                <Text
                  style={
                    styles.primaryText
                  }
                >
                  View PDF
                </Text>
              </Pressable>
            </View>
          ) : file ? (
            <View style={styles.pdfCard}>
              <FileText
                size={48}
                color="#64748b"
              />

              <Text
                style={styles.pdfTitle}
              >
                File ready to open
              </Text>

              <Text style={styles.helper}>
                This file type does not have
                an inline image preview.
              </Text>

              <Pressable
                onPress={() =>
                  void openNativeViewer()
                }
                style={styles.primary}
              >
                <FileText
                  size={18}
                  color="#fff"
                />
                <Text
                  style={
                    styles.primaryText
                  }
                >
                  Open File
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.helper}>
                No evidence selected.
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: "#0f172a",
    fontSize: 17,
    fontWeight: "900",
  },
  fileName: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 3,
  },
  close: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  body: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  image: {
    flex: 1,
    width: "100%",
    borderRadius: 14,
    backgroundColor: "#020617",
  },
  helper: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  pdfCard: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 430,
    alignItems: "center",
    gap: 13,
    padding: 24,
    borderRadius: 20,
    backgroundColor: "#fff",
  },
  pdfIcon: {
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#fef2f2",
  },
  pdfTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
  },
  primary: {
    minHeight: 48,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    paddingHorizontal: 16,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "900",
  },
  secondary: {
    marginTop: 12,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    backgroundColor: "#fff",
    paddingHorizontal: 15,
  },
  secondaryText: {
    color: "#334155",
    fontWeight: "900",
  },
});

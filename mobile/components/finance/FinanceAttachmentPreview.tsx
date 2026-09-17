import { Image } from "expo-image";
import * as FileSystemLegacy from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { FileText, ImageIcon, Share2, X } from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Linking,
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

function fileKind(fileName: string, mimeType?: string | null) {
  const mime = clean(mimeType).toLowerCase();
  const ext = extension(fileName);

  if (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)
  ) {
    return "image" as const;
  }

  if (mime.includes("pdf") || ext === "pdf") {
    return "pdf" as const;
  }

  return "other" as const;
}

function isRemoteUri(uri: string) {
  return /^https?:\/\//i.test(uri);
}

export type FinancePreviewFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export function FinanceAttachmentPreview({
  file,
  visible,
  loading = false,
  onClose,
}: {
  file: FinancePreviewFile | null;
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
}) {
  const kind = file ? fileKind(file.name, file.mimeType) : "other";

  async function openViewer() {
    if (!file?.uri) return;

    try {
      // Remote links can go directly to the operating system/browser viewer.
      if (isRemoteUri(file.uri)) {
        await Linking.openURL(file.uri);
        return;
      }

      // Android needs a content:// URI when handing a local cached file to
      // another app such as the standard PDF/document viewer.
      if (Platform.OS === "android") {
        const openUri = file.uri.startsWith("content://")
          ? file.uri
          : await FileSystemLegacy.getContentUriAsync(file.uri);

        await Linking.openURL(openUri);
        return;
      }

      // iOS can normally open the cached local file directly.
      await Linking.openURL(file.uri);
    } catch (viewerError) {
      // Same final fallback used by Training evidence.
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            dialogTitle:
              kind === "pdf" ? "Open PDF" : "Open Finance attachment",
            mimeType: clean(file.mimeType) || undefined,
            UTI: kind === "pdf" ? "com.adobe.pdf" : undefined,
          });
          return;
        }
      } catch {
        // Show the original viewer error below.
      }

      Alert.alert(
        "Could not open file",
        viewerError instanceof Error
          ? viewerError.message
          : "No compatible document viewer is available.",
      );
    }
  }

  async function shareFile() {
    if (!file?.uri) return;

    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          dialogTitle: "Finance attachment",
          mimeType: clean(file.mimeType) || undefined,
          UTI: kind === "pdf" ? "com.adobe.pdf" : undefined,
        });
        return;
      }

      await openViewer();
    } catch (error) {
      Alert.alert(
        "Could not share file",
        error instanceof Error ? error.message : "Please try again.",
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
            <Text style={styles.title}>Attachment Preview</Text>
            <Text numberOfLines={1} style={styles.fileName}>
              {file?.name || "Finance attachment"}
            </Text>
          </View>

          <Pressable onPress={onClose} style={styles.close}>
            <X size={22} color="#334155" />
          </Pressable>
        </View>

        <View style={styles.body}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color="#2563eb" />
              <Text style={styles.helper}>Loading attachment…</Text>
            </View>
          ) : file && kind === "image" ? (
            <>
              <Image
                source={{ uri: file.uri }}
                style={styles.image}
                contentFit="contain"
                transition={150}
              />

              <View style={styles.bottomActions}>
                <Pressable
                  onPress={() => void openViewer()}
                  style={styles.secondary}
                >
                  <ImageIcon size={17} color="#334155" />
                  <Text style={styles.secondaryText}>Open externally</Text>
                </Pressable>

                <Pressable
                  onPress={() => void shareFile()}
                  style={styles.secondary}
                >
                  <Share2 size={17} color="#334155" />
                  <Text style={styles.secondaryText}>Share</Text>
                </Pressable>
              </View>
            </>
          ) : file && kind === "pdf" ? (
            <View style={styles.documentCard}>
              <View style={[styles.documentIcon, styles.pdfIcon]}>
                <FileText size={50} color="#dc2626" />
              </View>

              <Text style={styles.documentTitle}>PDF ready to view</Text>
              <Text style={styles.helper}>
                Open the invoice, receipt or supporting document with the
                standard PDF viewer on this device.
              </Text>

              <Pressable
                onPress={() => void openViewer()}
                style={styles.primary}
              >
                <FileText size={18} color="#fff" />
                <Text style={styles.primaryText}>View PDF</Text>
              </Pressable>

              <Pressable
                onPress={() => void shareFile()}
                style={styles.secondary}
              >
                <Share2 size={17} color="#334155" />
                <Text style={styles.secondaryText}>Share / Save a copy</Text>
              </Pressable>
            </View>
          ) : file ? (
            <View style={styles.documentCard}>
              <View style={styles.documentIcon}>
                <FileText size={50} color="#64748b" />
              </View>

              <Text style={styles.documentTitle}>Document ready</Text>
              <Text style={styles.helper}>
                Open this attachment using a compatible app on this device.
              </Text>

              <Pressable
                onPress={() => void openViewer()}
                style={styles.primary}
              >
                <FileText size={18} color="#fff" />
                <Text style={styles.primaryText}>Open document</Text>
              </Pressable>

              <Pressable
                onPress={() => void shareFile()}
                style={styles.secondary}
              >
                <Share2 size={17} color="#334155" />
                <Text style={styles.secondaryText}>Share / Save a copy</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.helper}>Attachment unavailable.</Text>
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
    backgroundColor: "#f8fafc",
  },
  header: {
    minHeight: 72,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "900",
  },
  fileName: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 3,
  },
  close: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
    padding: 18,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  helper: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  image: {
    flex: 1,
    width: "100%",
    borderRadius: 16,
    backgroundColor: "#ffffff",
  },
  bottomActions: {
    paddingTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  documentCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 22,
    backgroundColor: "#ffffff",
    padding: 24,
    gap: 14,
  },
  documentIcon: {
    width: 92,
    height: 92,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  pdfIcon: {
    backgroundColor: "#fef2f2",
  },
  documentTitle: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  primary: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
  },
  primaryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  secondary: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flex: 1,
  },
  secondaryText: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
  },
});

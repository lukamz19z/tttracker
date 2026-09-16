import { Directory, File, Paths } from "expo-file-system";

const offlineDirectory = new Directory(Paths.document, "tttracker-offline");

function ensureOfflineDirectory() {
  if (!offlineDirectory.exists) {
    offlineDirectory.create({ idempotent: true, intermediates: true });
  }
}

function extension(uri: string) {
  const cleanUri = uri.split("?")[0] ?? uri;
  return cleanUri.match(/\.([A-Za-z0-9]{1,10})$/)?.[1]?.toLowerCase() ?? "jpg";
}

function safePrefix(prefix: string) {
  return prefix.trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
}

export async function persistOfflineFile(uri: string, prefix: string) {
  const sourceUri = uri.trim();
  if (!sourceUri) throw new Error("Cannot persist an offline file without a URI.");

  ensureOfflineDirectory();
  const source = new File(sourceUri);
  if (!source.exists) throw new Error(`The selected file could not be found: ${sourceUri}`);

  const destination = new File(
    offlineDirectory,
    `${safePrefix(prefix)}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension(sourceUri)}`,
  );
  source.copy(destination);
  return destination.uri;
}

export async function removeOfflineFile(uri: string | null | undefined) {
  const cleanUri = uri?.trim();
  if (!cleanUri) return;
  try {
    const file = new File(cleanUri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup only.
  }
}

export function offlineFileExists(uri: string | null | undefined) {
  const cleanUri = uri?.trim();
  if (!cleanUri) return false;
  try { return new File(cleanUri).exists; } catch { return false; }
}

export function getOfflineDirectoryUri() {
  ensureOfflineDirectory();
  return offlineDirectory.uri;
}

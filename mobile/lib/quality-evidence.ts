import { File, Paths } from "expo-file-system";
import { Image } from "react-native";
import { evidenceLayout, type EvidenceContext } from "../../lib/quality/evidence-layout";
import { getCache, setCache } from "@/lib/offline/db";
import { getOfflineDirectoryUri, offlineFileExists, persistOfflineFile } from "@/lib/offline/files";
import { listRevisionWorkspaces, saveRevisionWorkspace } from "@/lib/offline/revision-workspaces";
import type { LocalQualityPhoto } from "@/types/quality";
export type RasterJob = { source: string; layout: ReturnType<typeof evidenceLayout> };
type Renderer = (job: RasterJob) => Promise<string>;
let renderer: Renderer | null = null;
const ready: (() => void)[] = [];
let serial: Promise<unknown> = Promise.resolve();
export function registerEvidenceRenderer(value: Renderer) {
  renderer = value; ready.splice(0).forEach(resolve => resolve());
  return () => { if (renderer === value) renderer = null; };
}
export function photoContext(context: EvidenceContext, phase: string, capturedAt: string): EvidenceContext {
  return { kind:context.kind,project:context.project, phase, tower: context.tower || context.Tower, reference: context.reference || context.Revision || (context.kind==="defect"?"Pending DEF":"Pending RECT"),
    fli: context.fli || (context["FLI #"] === "Pending FLI" ? null : context["FLI #"]),
    assignedFlag: context.assignedFlag || context.Flag, leg: context.leg || context.Leg,
    segment: context.segment || context.Segment, member: context.member || context.Member,
    drawing: context.drawing || context.Drawing, issue: context.issue || context.Issue,
    capturedAt: new Date(capturedAt).toLocaleString("en-AU") };
}
export async function annotateQualityPhoto(photo: LocalQualityPhoto, context = photo.watermarkContext || {}): Promise<LocalQualityPhoto> {
  const task = serial.catch(() => undefined).then(async () => {
    const cached = (await getCache<LocalQualityPhoto>(`quality:photo-annotation:${photo.id}`))?.value;
    let originalUri = cached?.originalUri || photo.originalUri || photo.uri;
    if (!offlineFileExists(originalUri)) throw new Error("Local evidence file could not be found.");
    if (!originalUri.startsWith(getOfflineDirectoryUri())) originalUri = await persistOfflineFile(originalUri,`quality-original-${photo.id}`);
    const position = photo.watermarkPosition || "bottom-left";
    if (cached?.watermarkContext) {
      context = { ...context,
        fli: context.fli || cached.watermarkContext.fli,
        reference: !context.reference || String(context.reference).includes("Pending") ? cached.watermarkContext.reference || context.reference : context.reference,
      };
    }
    const annotationKey = JSON.stringify([originalUri, context, position]);
    const known = cached?.annotationKey === annotationKey ? cached : photo;
    if (known.annotationKey === annotationKey && offlineFileExists(known.annotatedUri)) return known;
    if (!renderer) await new Promise<void>((resolve,reject) => {
      const timer = setTimeout(() => { const index = ready.indexOf(done); if (index >= 0) ready.splice(index,1); reject(new Error("Evidence renderer is not ready. Please retry.")); }, 15_000);
      const done = () => { clearTimeout(timer); resolve(); }; ready.push(done);
    });
    if (!renderer) throw new Error("Evidence renderer is unavailable.");
    const dimensions = photo.width && photo.height ? { width: photo.width, height: photo.height } : await new Promise<{width:number;height:number}>((resolve,reject) => Image.getSize(originalUri,(width,height)=>resolve({width,height}),reject));
    const scale = Math.min(1,1800/Math.max(dimensions.width,dimensions.height));
    const layout = evidenceLayout(Math.round(dimensions.width*scale),Math.round(dimensions.height*scale),context,position);
    // SVG's Android Image only sends onLoad after decoding. A unique temporary
    // source prevents a warm Fresco cache from bypassing that completion event.
    const renderSource = new File(Paths.cache,`quality-render-${Date.now()}-${Math.random().toString(36).slice(2)}.${photo.mimeType === "image/png" ? "png" : "jpg"}`);
    new File(originalUri).copy(renderSource);
    let png: string;
    try { png = await renderer({ source: renderSource.uri, layout }); }
    finally { if (renderSource.exists) renderSource.delete(); }
    if (!png) throw new Error("Evidence annotation could not be rasterised.");
    const destination = new File(getOfflineDirectoryUri(),`annotated-${photo.id}-${Date.now()}-${Math.random().toString(36).slice(2,8)}.png`);
    destination.create({intermediates:true}); destination.write(png,{encoding:"base64"});
    const result = { ...photo, uri: originalUri, originalUri, annotatedUri: destination.uri, annotationKey, watermarkContext: context };
    await setCache(`quality:photo-annotation:${photo.id}`,result);
    return result;
  });
  serial = task;
  return task;
}
export async function evidencePreviewUri(photo: LocalQualityPhoto) {
  const cached = (await getCache<LocalQualityPhoto>(`quality:photo-annotation:${photo.id}`))?.value;
  return cached?.annotatedUri && offlineFileExists(cached.annotatedUri) ? cached.annotatedUri : photo.annotatedUri || photo.originalUri || photo.uri;
}

export async function persistEvidencePhoto(projectId: string, photo: LocalQualityPhoto) {
  const replace = (rows: LocalQualityPhoto[]) => rows.map(row => row.id === photo.id ? photo : row);
  for (const workspace of await listRevisionWorkspaces(projectId)) {
    if (!JSON.stringify([workspace.findings,workspace.pendingUpdates]).includes(photo.id)) continue;
    await saveRevisionWorkspace({ ...workspace,
      findings: workspace.findings.map(row => ({ ...row, beforePhotos: replace(row.beforePhotos), afterPhotos: replace(row.afterPhotos) })),
      pendingUpdates: workspace.pendingUpdates.map(row => ({ ...row, afterPhotos: replace(row.afterPhotos) })),
    });
  }
}

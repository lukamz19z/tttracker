import { qualityCaptureLabel } from "./date-time";
import { sourceDateDisplay } from "./punchlist-import-values";
export const WATERMARK_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type WatermarkPosition = typeof WATERMARK_POSITIONS[number];
export type EvidenceContext = Record<string, unknown>;

export function watermarkLines(context: EvidenceContext) {
  return [context.phase, context.project && `Project ${context.project}`, context.tower && (/^tower\b/i.test(String(context.tower)) ? context.tower : `Tower ${context.tower}`), context.reference && (context.kind === "defect" || String(context.reference).includes("Pending") ? context.reference : `RECT ${context.reference}`), context.kind === "defect" ? null : context.fli ? `FLI # ${context.fli}` : "Pending FLI", context.assignedFlag && `Assigned Flag: ${context.assignedFlag}`, context.leg && `Leg: ${context.leg}`, context.segment && `Segment: ${context.segment}`, context.member && `Member: ${context.member}`, context.drawing && `Drawing: ${context.drawing}`, context.issue && `Issue: ${context.issue}`, context.capturedBy && `Captured By: ${context.capturedBy}`, !context.capturedAt && context.capturedDate ? `Captured: ${sourceDateDisplay(String(context.capturedDate))} (time unknown)` : context.capturedAt ? `Captured: ${qualityCaptureLabel(context.capturedAt, context.timeZone, context.recordedAt)}` : qualityCaptureLabel(context.capturedAt, context.timeZone, context.recordedAt)].filter(Boolean).map(String);
}
export function evidenceLayout(imageWidth: number, imageHeight: number, context: EvidenceContext, position: WatermarkPosition) {
  const width = Math.max(80, Math.round(imageWidth * 0.48));
  const font = Math.max(12, Math.round(Math.min(imageWidth, imageHeight) / 48));
  const characters = Math.max(8, Math.floor((width - 16) / (font * 0.65)));
  const lines = watermarkLines(context).flatMap(line => {
    const result: string[] = []; let current = "";
    for (const word of line.split(/\s+/)) {
      if (current && current.length + word.length + 1 > characters) { result.push(current); current = ""; }
      if (word.length > characters) {
        if (current) { result.push(current); current = ""; }
        const pieces = word.match(new RegExp(`.{1,${characters}}`, "gu")) || [];
        result.push(...pieces.slice(0,-1)); current = pieces.at(-1) || "";
      } else current += (current ? " " : "") + word;
    }
    if (current) result.push(current);
    return result;
  });
  const lineHeight = font + 5, height = (lines.length + 1) * lineHeight;
  const band = height > imageHeight * 0.45 ? height + 8 : 0;
  const top = position.startsWith("top");
  return { imageWidth, imageHeight, width, height, font, lineHeight, lines,
    outputWidth: imageWidth, outputHeight: imageHeight + band,
    imageTop: band && top ? band : 0,
    left: position.endsWith("right") ? imageWidth - width - 4 : 4,
    top: band ? (top ? 4 : imageHeight + 4) : (top ? 4 : imageHeight - height - 4),
  };
}

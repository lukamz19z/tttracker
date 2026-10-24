import sharp from "sharp";
export const WATERMARK_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type WatermarkPosition = typeof WATERMARK_POSITIONS[number];
export function watermarkLines(context: Record<string, unknown>) {
  return [context.phase, context.tower, context.reference, context.assignedFlag && `Flag: ${context.assignedFlag}`, context.issue, context.leg && `Leg ${context.leg}`, context.segment, context.member && `Member ${context.member}`, context.drawing && `Drawing ${context.drawing}`, context.capturedAt].filter(Boolean).map(value => String(value));
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
export async function annotateEvidence(original: Uint8Array, context: Record<string, unknown>, position: WatermarkPosition) {
  const { data, info } = await sharp(original, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const width = Math.min(info.width - 8, Math.round(info.width * 0.48));
  let font = Math.max(9, Math.round(Math.min(info.width, info.height) / 48));
  const characters = Math.max(12, Math.floor((width - 16) / (font * 0.6)));
  const lines = watermarkLines(context).flatMap(line => line.match(new RegExp(`.{1,${characters}}`, "g")) || []);
  font = Math.max(6, Math.min(font, Math.floor(info.height * 0.35 / (lines.length + 1)) - 4));
  const height = Math.min(info.height - 8, (lines.length + 1) * (font + 4));
  const svg = `<svg width="${width}" height="${height}"><rect width="100%" height="100%" rx="6" fill="black" fill-opacity="0.65"/>${lines.map((line, index) => `<text x="8" y="${(index + 1) * (font + 4)}" font-family="sans-serif" font-size="${font}" fill="white" font-weight="${index === 0 ? "bold" : "normal"}">${escape(line)}</text>`).join("")}</svg>`;
  const left = position.endsWith("right") ? info.width - width - 4 : 4;
  const top = position.startsWith("top") ? 4 : info.height - height - 4;
  return sharp(data).composite([{ input: Buffer.from(svg), left, top }]).jpeg({ quality: 90 }).toBuffer();
}

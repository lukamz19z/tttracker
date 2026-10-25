import sharp from "sharp";
import { evidenceLayout, type WatermarkPosition } from "./evidence-layout";
export { WATERMARK_POSITIONS, watermarkLines, type WatermarkPosition } from "./evidence-layout";
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
export async function annotateEvidence(original: Uint8Array, context: Record<string, unknown>, position: WatermarkPosition) {
  const { data, info } = await sharp(original, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const layout = evidenceLayout(info.width, info.height, context, position);
  const { width, height, lines, font, lineHeight, left, top } = layout;
  const svg = `<svg width="${width}" height="${height}"><rect width="100%" height="100%" rx="6" fill="black" fill-opacity="0.65"/>${lines.map((line,index) => `<text x="8" y="${(index+1)*lineHeight}" font-family="sans-serif" font-size="${font}" fill="white" font-weight="${index ? "normal" : "bold"}">${escape(line)}</text>`).join("")}</svg>`;
  const canvas = sharp({ create: { width: layout.outputWidth, height: layout.outputHeight, channels: 3, background: "#222222" } });
  return canvas.composite([{ input: data, left: 0, top: layout.imageTop }, { input: Buffer.from(svg), left, top }]).jpeg({ quality: 90 }).toBuffer();
}

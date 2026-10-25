import sharp from "sharp";
import path from "node:path";
import { evidenceLayout, type WatermarkPosition } from "./evidence-layout";
export { WATERMARK_POSITIONS, watermarkLines, type WatermarkPosition } from "./evidence-layout";
export const EVIDENCE_WATERMARK_VERSION = 3;
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
export async function annotateEvidence(original: Uint8Array, context: Record<string, unknown>, position: WatermarkPosition) {
  const { data, info } = await sharp(original, { limitInputPixels: 80_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).toBuffer({ resolveWithObject: true });
  const layout = evidenceLayout(info.width, info.height, context, position);
  const { width, height, lines, font, lineHeight, left, top } = layout;
  // Pango is given an actual private font file. SVG generic sans-serif depends
  // on the host's Fontconfig inventory, which can be empty on serverless Linux.
  const fontfile=path.join(process.cwd(),"assets","quality-fonts","NotoSans-Regular.ttf");
  const captions=await Promise.all(lines.map(async(line,index)=>({input:await sharp({text:{text:`<span foreground="white">${escape(line)}</span>`,font:`Noto Sans ${font}`,fontfile,rgba:true,dpi:72}}).png().toBuffer(),left:left+8,top:top+index*lineHeight+5})));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" rx="6" fill="black" fill-opacity="0.65"/></svg>`;
  const canvas = sharp({ create: { width: layout.outputWidth, height: layout.outputHeight, channels: 3, background: "#222222" } });
  return canvas.composite([{ input: data, left: 0, top: layout.imageTop }, { input: Buffer.from(svg,"utf8"), left, top },...captions]).jpeg({ quality: 90 }).toBuffer();
}

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const Module = require("node:module");
Module._extensions[".ts"] = (mod, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  mod._compile(js, filename);
};
const sharp = require("sharp");
const { prepareEvidenceForPdf, REVISION_PDF_IMAGE_MAX_DIMENSION, REVISION_PDF_JPEG_QUALITY, RevisionPdfImageProcessingError } = require(path.join(root, "lib/quality/revision-pdf-images.ts"));
const { generateRevisionPdf } = require(path.join(root, "lib/quality/revision-pdf.ts"));
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("large photographic JPEG is downsampled and recompressed for PDF only", async () => {
  const width = 2600, height = 1900;
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 73 + (i >> 7)) % 256;
  const input = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 98 }).toBuffer();
  const beforeHash = hash(input);
  const result = await prepareEvidenceForPdf(input);
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(result.mimeType, "image/jpeg");
  assert.ok(metadata.width <= REVISION_PDF_IMAGE_MAX_DIMENSION);
  assert.ok(metadata.height <= REVISION_PDF_IMAGE_MAX_DIMENSION);
  assert.ok(result.buffer.length < input.length);
  assert.equal(hash(input), beforeHash, "source/canonical buffer remains unchanged");
  assert.equal(REVISION_PDF_JPEG_QUALITY, 72);
});

test("small JPEG is never enlarged", async () => {
  const input = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#8a6b4d" } }).jpeg().toBuffer();
  const result = await prepareEvidenceForPdf(input);
  const metadata = await sharp(result.buffer).metadata();
  assert.deepEqual([metadata.width, metadata.height], [320, 180]);
});

test("EXIF portrait orientation is applied and metadata is stripped", async () => {
  const input = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#6491aa" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const result = await prepareEvidenceForPdf(input);
  const metadata = await sharp(result.buffer).metadata();
  assert.deepEqual([metadata.width, metadata.height], [800, 1200]);
  assert.equal(metadata.orientation, undefined);
});

test("opaque PNG photographs become JPEG while meaningful transparency stays PNG", async () => {
  const opaque = await sharp({ create: { width: 100, height: 80, channels: 3, background: "#336699" } }).png().toBuffer();
  const opaqueResult = await prepareEvidenceForPdf(opaque);
  assert.equal(opaqueResult.mimeType, "image/jpeg");
  const alpha = await sharp({ create: { width: 100, height: 80, channels: 4, background: { r: 20, g: 80, b: 140, alpha: 0.4 } } }).png().toBuffer();
  const alphaResult = await prepareEvidenceForPdf(alpha);
  assert.equal(alphaResult.mimeType, "image/png");
  assert.equal((await sharp(alphaResult.buffer).metadata()).hasAlpha, true);
});

test("image processing failures are explicit and PDF renderer embeds the prepared evidence buffer", async () => {
  await assert.rejects(() => prepareEvidenceForPdf(Buffer.from("not an image")), RevisionPdfImageProcessingError);
  const photo = await prepareEvidenceForPdf(await sharp({ create: { width: 40, height: 30, channels: 3, background: "#c07844" } }).jpeg().toBuffer());
  const pdf = generateRevisionPdf({ projectName: "Sample", projectNumber: "P-TEST", towerName: "Tower 1", fliNumber: "RECT-02", reportRevision: 1, inspectionStage: "Rectification", inspectionDate: "2026-11-05", generatedBy: "Test", generatedAt: "2026-11-05T00:00:00Z", items: [{ itemNumber: 107, itemReference: "FLI-107", issueType: "Bolt Facing Wrong", towerSegment: "Earthwire Peak", memberNumber: "68H", drawingNumber: "TL-799312-22", finding: "Expected finding remains", status: "Rectified", beforePhotos: [{ id: "before", fileName: "before.jpg", mimeType: photo.mimeType, imageBuffer: photo.buffer, capturedAt: "2026-11-04T01:02:03Z" }], afterPhotos: [{ id: "after", fileName: "after.jpg", mimeType: photo.mimeType, imageBuffer: photo.buffer, capturedAt: "2026-11-04T02:03:04Z" }] }] });
  const pdfText = Buffer.from(pdf).toString("latin1");
  assert.ok(pdfText.startsWith("%PDF-"));
  assert.match(pdfText, /\/Subtype \/Image/);
  const renderer = await readFile(path.join(root, "lib/quality/revision-pdf.ts"), "utf8");
  assert.match(renderer, /photo\.imageBuffer/);
  assert.doesNotMatch(renderer, /photo\.dataUrl/);
  const route = await readFile(path.join(root, "app/api/quality/files/revisions/[revisionId]/pdf/route.ts"), "utf8");
  assert.match(route, /return prepareEvidenceForPdf\(buffer\)/);
  assert.doesNotMatch(route, /ensurePublishedQualityEvidence/);
  assert.match(route, /imageBuffer: prepared\.buffer/);
});

test("local multi-FLI fixture preserves evidence/page counts and produces a smaller PDF", async () => {
  const sourceImages = [];
  for (let imageIndex = 0; imageIndex < 8; imageIndex++) {
    const width = 1800, height = 1200;
    const pixels = Buffer.alloc(width * height * 3);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 31 + imageIndex * 47 + (i >> 8)) % 256;
    sourceImages.push(await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 94 }).toBuffer());
  }
  const rawPhotos = sourceImages.map((imageBuffer, index) => ({ id: `raw-${index}`, fileName: `photo-${index}.jpg`, mimeType: "image/jpeg", imageBuffer, capturedAt: "2026-11-04T01:02:03Z" }));
  const optimizedPhotos = await Promise.all(rawPhotos.map(async (photo) => { const prepared = await prepareEvidenceForPdf(photo.imageBuffer); return { ...photo, imageBuffer: prepared.buffer, mimeType: prepared.mimeType }; }));
  const makePdf = (photos) => generateRevisionPdf({ projectName: "Fixture", projectNumber: "P-TEST", towerName: "Tower 5C3/5C1-093", fliNumber: "RECT-02", reportRevision: 1, inspectionStage: "Rectification", inspectionDate: "2026-11-05", generatedBy: "Test", generatedAt: "2026-11-05T00:00:00Z", items: Array.from({ length: 4 }, (_, index) => ({ itemNumber: 104 + index, itemReference: `FLI-${104 + index}`, issueType: "Fixture finding", finding: `Finding ${index + 1}`, status: "Rectified", beforePhotos: [photos[index * 2]], afterPhotos: [photos[index * 2 + 1]] })) });
  const before = Buffer.from(makePdf(rawPhotos));
  const after = Buffer.from(makePdf(optimizedPhotos));
  const count = (pdf, pattern) => [...pdf.toString("latin1").matchAll(pattern)].length;
  const beforeImages = count(before, /\/Subtype \/Image/g);
  const afterImages = count(after, /\/Subtype \/Image/g);
  const beforePages = count(before, /\/Type \/Page\b/g);
  const afterPages = count(after, /\/Type \/Page\b/g);
  assert.equal(afterImages, beforeImages);
  assert.equal(afterPages, beforePages);
  assert.ok(after.length < before.length);
  console.log(`Revision PDF fixture: ${before.length} -> ${after.length} bytes; images=${afterImages}; pages=${afterPages}`);
});

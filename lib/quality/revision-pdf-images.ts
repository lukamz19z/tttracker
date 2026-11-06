import sharp from "sharp";

export const REVISION_PDF_IMAGE_MAX_DIMENSION = 1800;
export const REVISION_PDF_JPEG_QUALITY = 72;

export type PreparedRevisionPdfImage = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png";
};

export class RevisionPdfImageProcessingError extends Error {
  constructor() {
    super("Evidence image could not be prepared for the PDF.");
    this.name = "RevisionPdfImageProcessingError";
  }
}

/** Produces a PDF-only copy. The input buffer and canonical source are never mutated. */
export async function prepareEvidenceForPdf(input: Buffer | Uint8Array): Promise<PreparedRevisionPdfImage> {
  try {
    const source = Buffer.from(input);
    const oriented = sharp(source).rotate().resize({
      width: REVISION_PDF_IMAGE_MAX_DIMENSION,
      height: REVISION_PDF_IMAGE_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });
    const metadata = await sharp(source).metadata();

    // Preserve transparency only when at least one pixel is actually translucent.
    if (metadata.hasAlpha) {
      const stats = await sharp(source).rotate().stats();
      const alpha = stats.channels[stats.channels.length - 1];
      if (alpha && alpha.min < 255) {
        const buffer = await oriented.png({ compressionLevel: 9, adaptiveFiltering: true, effort: 7 }).toBuffer();
        return { buffer, mimeType: "image/png" };
      }
    }

    const buffer = await oriented.jpeg({ quality: REVISION_PDF_JPEG_QUALITY, mozjpeg: true }).toBuffer();
    return { buffer, mimeType: "image/jpeg" };
  } catch {
    throw new RevisionPdfImageProcessingError();
  }
}

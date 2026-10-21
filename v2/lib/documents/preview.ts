import "server-only";
export function documentHeaders(mime: string, filename: string, preview: boolean) {
  const inline = preview && ["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain", "text/csv"].includes(mime);
  const safeName = filename.replace(/[\r\n"\\]/g, "_").replace(/[^\x20-\x7e]/g, "_");
  return {
    "Content-Type": mime,
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'", "Referrer-Policy": "no-referrer",
  };
}

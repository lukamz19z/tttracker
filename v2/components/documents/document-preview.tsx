"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { ConfigurationSurface } from "@/components/people/configuration-surface";

/** Uses an authenticated TTTracker API URL, never a storage URL or Graph token. */
export function DocumentPreview({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const [file, setFile] = useState<{ url: string; mime: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let objectUrl: string | undefined;
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) {
        const message = await response.json().catch(() => null);
        throw new Error(message?.error ?? "The document could not be opened. Try again.");
      }
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setFile({ url: objectUrl, mime: blob.type.split(";")[0] });
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  const inline = !!file && ["application/pdf", "text/plain", "text/csv"].includes(file.mime);
  return <ConfigurationSurface title={name} size="large" onClose={onClose} footer={file ? <a className="tt-button-secondary" href={file.url} download={name}>Download Document</a> : undefined}>
    {error && <p role="alert">{error}</p>}
    {!file && !error && <p role="status">Opening document...</p>}
    {file?.mime.startsWith("image/") && <div style={{ overflow: "auto", maxHeight: "65vh" }}><a href={file.url} target="_blank" rel="noopener noreferrer" aria-label="Open image full size"><Image unoptimized src={file.url} alt={name} width={1200} height={800} style={{ maxWidth: "100%", height: "auto" }} /></a></div>}
    {inline && <iframe title={`Preview ${name}`} src={file.url} style={{ width: "100%", height: "65vh", border: 0 }} />}
    {file && !inline && !file.mime.startsWith("image/") && <p>This file cannot be displayed inline. Download it to open it in your document application.</p>}
  </ConfigurationSurface>;
}

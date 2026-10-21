"use client";
import { useEffect, useState } from "react";
import { formatPeopleDate } from "@/lib/people/dates";
import { DocumentPreview } from "./document-preview";
import { DocumentStorageStatus } from "./document-storage-status";

type Row = { id: string; name: string; content_type: string; size_bytes: number; created_at: string };
export function ProjectDocuments({ organisation, project, canUpload }: { organisation: string; project: string; canUpload: boolean }) {
  const [rows, setRows] = useState<Row[]>([]), [preview, setPreview] = useState<Row | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const endpoint = `/api/projects/${project}/documents?organisation=${encodeURIComponent(organisation)}`;
  useEffect(() => {
    const abort = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: abort.signal }).then(async response => {
      if (!response.ok) throw new Error("Project documents could not be loaded.");
      setRows((await response.json()).rows ?? []);
    }).catch(error => { if (!abort.signal.aborted) setError(error.message); });
    return () => abort.abort();
  }, [endpoint]);
  return <section aria-label="Project Documents"><h2>Project Documents</h2><DocumentStorageStatus organisation={organisation} context="projects"/>
    {error && <p role="alert">{error}</p>}
    {canUpload && <form style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} onSubmit={async event => {
      event.preventDefault(); const form = event.currentTarget; setBusy(true); setError("");
      try {
        const response = await fetch(endpoint, { method: "POST", body: new FormData(form) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error);
        const refreshed = await fetch(endpoint, { cache: "no-store" });
        if (!refreshed.ok) throw new Error("The document was uploaded, but the list could not be refreshed. Reload this page.");
        setRows((await refreshed.json()).rows ?? []); form.reset();
      } catch (error) { setError(error instanceof Error ? error.message : "The document was not uploaded. Try again."); }
      finally { setBusy(false); }
    }}><label>File<input type="file" name="file" required disabled={busy}/></label><button className="tt-button-primary" disabled={busy}>{busy ? "Uploading..." : "Upload Document"}</button></form>}
    {!rows.length && <p>No project documents uploaded yet.</p>}
    {rows.map(row => <div key={row.id} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "8px 0" }}><strong>{row.name}</strong><span>{(row.size_bytes / 1048576).toFixed(1)} MB</span><span>Uploaded {formatPeopleDate(row.created_at)}</span><button className="tt-button-secondary" onClick={() => setPreview(row)}>Preview</button></div>)}
    {preview && <DocumentPreview key={preview.id} name={preview.name} url={`/api/documents/${preview.id}?organisation=${encodeURIComponent(organisation)}&mode=preview`} onClose={() => setPreview(null)}/>}
  </section>;
}

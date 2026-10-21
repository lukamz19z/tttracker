"use client";
import { useState } from "react";

export function DocumentMigration({ organisation }: { organisation: string }) {
  const [preview, setPreview] = useState<{ total: number; configured: boolean; rows: { id: string; name: string }[] } | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const endpoint = `/api/documents/migration?organisation=${encodeURIComponent(organisation)}`;
  async function run(queue: boolean) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(endpoint, queue ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisation, documents: selected }) } : { cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      if (queue) { setMessage(`${result.queued} documents queued. Original files will be retained.`); setSelected([]); }
      else setPreview(result);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Migration could not be started."); }
    finally { setBusy(false); }
  }
  return <details><summary>Historical Document Migration</summary><p>Move selected historical Training files to SharePoint. Original files will be retained. Nothing is migrated by opening this preview.</p>
    <button className="tt-button-secondary" disabled={busy} onClick={() => void run(false)}>Preview Migration</button>
    {message && <p role="status">{message}</p>}
    {preview && <><p>{preview.total} historical Training documents. {preview.configured ? "Document setup exists; the worker will check each file." : "Configure Training document storage before starting."}</p>
      {preview.rows.map(row => <label key={row.id} style={{ display: "block", padding: 4 }}><input type="checkbox" checked={selected.includes(row.id)} onChange={event => setSelected(event.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))}/> {row.name}</label>)}
      <button className="tt-button-primary" disabled={busy || !preview.configured || !selected.length || selected.length > 10} onClick={() => void run(true)}>Migrate Selected Documents</button>
      <p>Select up to 10 documents. The scheduled worker rechecks permissions and uploads each file. Source deletion is unavailable.</p>
    </>}
  </details>;
}

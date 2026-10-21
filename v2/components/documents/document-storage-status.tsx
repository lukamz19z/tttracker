"use client";
import { useEffect, useState } from "react";
import type { DocumentContext } from "@/lib/integrations/resolver";

export function DocumentStorageStatus({ organisation, context }: { organisation: string; context: DocumentContext }) {
  const [status, setStatus] = useState<{ configured: boolean; name?: string; canManage: boolean } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/documents/storage?organisation=${encodeURIComponent(organisation)}&context=${context}`, { cache: "no-store", signal: abort.signal })
      .then(async response => { if (!response.ok) return; setStatus(await response.json()); }).catch(() => {});
    return () => abort.abort();
  }, [organisation, context]);
  if (!status || status.configured) return null;
  return <div role="status" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <strong>Document Storage Not Configured</strong>
    {status.canManage ? <a className="tt-button-secondary" href={`/workspace/settings/integrations/sharepoint?organisation=${encodeURIComponent(organisation)}&context=${context}`}>Set Up Document Storage</a>
      : <span>An organisation administrator needs to configure document storage for this area.</span>}
  </div>;
}

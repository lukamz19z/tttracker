/** Canonical historical display fallback, only for persisted server items. */
export function revisionItemFli(item: { fli_number?: string | null; item_number?: number | null }) {
  return String(item.fli_number || "").trim() || (item.item_number != null ? `FLI-${String(item.item_number).padStart(3, "0")}` : "");
}

export function revisionReference(revision: { revision_number?: string | null; fli_number?: string | null; sequence_no?: number | null }) {
  return String(revision.revision_number || "").trim() || String(revision.fli_number || "").trim() ||
    (revision.sequence_no != null ? `RECT-${String(revision.sequence_no).padStart(2, "0")}` : "");
}

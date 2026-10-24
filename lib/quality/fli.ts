/** Canonical historical display fallback, only for persisted server items. */
export function revisionItemFli(item: { fli_number?: string | null; item_number?: number | null }) {
  return String(item.fli_number || "").trim() || (item.item_number != null ? `FLI-${String(item.item_number).padStart(3, "0")}` : "");
}

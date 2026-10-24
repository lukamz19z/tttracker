const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export function compareBundleNumbers(a: unknown, b: unknown) {
  const left = String(a ?? "").split("/");
  const right = String(b ?? "").split("/");
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const result = collator.compare(left[i] || "", right[i] || "");
    if (result) return result;
  }
  return 0;
}
export function compareBundles(a: { bundle_no?: unknown; tower_id?: unknown; section?: unknown; id?: unknown }, b: { bundle_no?: unknown; tower_id?: unknown; section?: unknown; id?: unknown }) {
  return compareBundleNumbers(a.bundle_no, b.bundle_no) || collator.compare(String(a.tower_id || ""), String(b.tower_id || "")) || collator.compare(String(a.section || ""), String(b.section || "")) || collator.compare(String(a.id || ""), String(b.id || ""));
}

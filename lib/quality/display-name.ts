/** Assignment labels must not expose an address, including historical labels. */
export function qualityDisplayName(value: unknown) {
  const name=String(value || "").replace(/<?[^\s<>@]+@[^\s<>]+>?/g,"").replace(/[·|,;]+\s*$/g,"").trim();
  return name || "TTTracker User";
}
